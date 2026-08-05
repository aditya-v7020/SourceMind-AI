"""
FastAPI backend for the NotebookLM-inspired multi-agent app.

Endpoints:
  GET    /api/health                                  - simple health check
  GET    /api/settings                                 - agent/key/model info for the Settings page
  POST   /api/sources/upload                            - upload a PDF or .txt file
  POST   /api/sources/url                                - add a source from a URL
  POST   /api/sources/text                               - add a source from pasted text
  GET    /api/sources/{session_id}                       - list sources for a session
  DELETE /api/sources/{session_id}/{source_id}           - delete a source (document management)
  GET    /api/conversations/{session_id}                 - list chat conversations
  POST   /api/conversations/{session_id}                 - create a new chat conversation
  GET    /api/conversations/{session_id}/{conv_id}        - full message history for one conversation
  PATCH  /api/conversations/{session_id}/{conv_id}        - rename a conversation
  DELETE /api/conversations/{session_id}/{conv_id}        - delete a conversation
  POST   /api/conversations/{session_id}/{conv_id}/clear   - clear a conversation's messages
  GET    /api/conversations/{session_id}/{conv_id}/export   - export a conversation (?format=md|pdf)
  GET    /api/dashboard/{session_id}                      - usage stats for the Dashboard page
  WS     /ws/{session_id}                                 - real-time agent activity + chat

Run with:  uvicorn main:app --reload
"""
from __future__ import annotations

import json
import mimetypes
import os

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from app.agents import chat_agent, graph, podcast_agent, quiz_agent, source_agent
from app.config import settings
from app.models.schemas import (
    ConversationDetail,
    ConversationInfo,
    ConversationListResponse,
    CreateConversationRequest,
    DashboardResponse,
    RenameConversationRequest,
    SettingsResponse,
    SourceInfo,
    SourceListResponse,
    TextSourceRequest,
    UploadResponse,
    UrlSourceRequest,
)
from app.services import export_service, llm_client, session_store as session_store_module
from app.services import stats_store as stats_store_module
from app.services import vector_store
from app.websocket_manager import manager

APP_VERSION = "4.2.0"  # v4.2: 6 agents (Chat, Research, Source, Quiz, Citation Verifier, Podcast)

ALL_AGENTS = ("chat", "research", "source", "quiz", "verifier", "podcast")

app = FastAPI(title="NotebookLM-Inspired Multi-Agent API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def warm_up_agent_clients() -> None:
    """Initializes each agent's own Gemini client at startup (when its API
    key is configured, directly or via fallback), so it's easy to see
    which agents are ready just by watching the server logs."""
    for agent in ALL_AGENTS:
        ready = llm_client.try_initialize(agent)
        state = "ready" if ready else "no API key set (only needed if this agent calls Gemini)"
        print(f"[startup] {agent} agent: {state}")


@app.get("/health")
@app.get("/api/health")
async def health() -> dict[str, str | int]:
    return {"status": "ok", "version": APP_VERSION, "agent_count": len(ALL_AGENTS)}


@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings(session_id: str | None = None) -> SettingsResponse:
    counts = stats_store_module.stats_store.get_agent_counts(session_id) if session_id else {}
    agents = [
        {
            "name": agent,
            "configured": llm_client.is_ready(agent),
            "has_own_key": llm_client.has_own_key(agent),
            "invocation_count": counts.get(agent, 0),
        }
        for agent in ALL_AGENTS
    ]
    return SettingsResponse(
        agents=agents,
        available_models=settings.available_models_list,
        default_model=settings.GEMINI_MODEL,
        features={
            "citation_verifier": settings.ENABLE_CITATION_VERIFIER,
        },
    )


# --- Sources ---


@app.post("/api/sources/upload", response_model=UploadResponse)
async def upload_source(session_id: str, file: UploadFile = File(...)) -> UploadResponse:
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    file_bytes = await file.read()
    filename = file.filename or "uploaded_file"
    guessed_type, _ = mimetypes.guess_type(filename)

    try:
        if filename.lower().endswith(".pdf") or guessed_type == "application/pdf":
            info: SourceInfo = await source_agent.process_pdf(session_id, filename, file_bytes)
        elif filename.lower().endswith(".txt") or (guessed_type or "").startswith("text/"):
            info = await source_agent.process_text_file(session_id, filename, file_bytes)
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a .pdf or .txt file.",
            )
    except source_agent.SourceProcessingError as exc:
        return UploadResponse(success=False, message=str(exc))

    stats_store_module.stats_store.record_upload(session_id)
    return UploadResponse(success=True, source=info, message=f"'{filename}' added successfully.")


@app.post("/api/sources/url", response_model=UploadResponse)
async def add_url_source(payload: UrlSourceRequest) -> UploadResponse:
    try:
        info = await source_agent.process_url(payload.session_id, payload.url)
    except source_agent.SourceProcessingError as exc:
        return UploadResponse(success=False, message=str(exc))

    stats_store_module.stats_store.record_upload(payload.session_id)
    return UploadResponse(success=True, source=info, message="URL added successfully.")


@app.post("/api/sources/text", response_model=UploadResponse)
async def add_text_source(payload: TextSourceRequest) -> UploadResponse:
    try:
        info = await source_agent.process_plain_text(
            payload.session_id, payload.title or "Pasted text", payload.text
        )
    except source_agent.SourceProcessingError as exc:
        return UploadResponse(success=False, message=str(exc))

    stats_store_module.stats_store.record_upload(payload.session_id)
    return UploadResponse(success=True, source=info, message="Text added successfully.")


@app.get("/api/sources/{session_id}", response_model=SourceListResponse)
async def list_sources(session_id: str) -> SourceListResponse:
    raw_sources = session_store_module.session_store.list_sources(session_id)
    return SourceListResponse(sources=[SourceInfo(**s) for s in raw_sources])


@app.delete("/api/sources/{session_id}/{source_id}")
async def delete_source(session_id: str, source_id: str) -> dict[str, bool | str]:
    removed = session_store_module.session_store.delete_source(session_id, source_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Source not found.")
    vector_store.delete_source(session_id, source_id)
    return {"success": True, "message": "Source deleted."}


# --- Conversations (chat management) ---


@app.get("/api/conversations/{session_id}", response_model=ConversationListResponse)
async def list_conversations(session_id: str) -> ConversationListResponse:
    convs = session_store_module.session_store.list_conversations(session_id)
    return ConversationListResponse(conversations=[ConversationInfo(**c) for c in convs])


@app.post("/api/conversations/{session_id}", response_model=ConversationInfo)
async def create_conversation(session_id: str, payload: CreateConversationRequest | None = None) -> ConversationInfo:
    title = payload.title if payload else None
    conv = session_store_module.session_store.create_conversation(session_id, title)
    return ConversationInfo(
        id=conv["id"],
        title=conv["title"],
        created_at=conv["created_at"],
        updated_at=conv["updated_at"],
        message_count=0,
    )


@app.get("/api/conversations/{session_id}/{conv_id}", response_model=ConversationDetail)
async def get_conversation(session_id: str, conv_id: str) -> ConversationDetail:
    conv = session_store_module.session_store.get_conversation(session_id, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return ConversationDetail(**conv)


@app.patch("/api/conversations/{session_id}/{conv_id}")
async def rename_conversation(session_id: str, conv_id: str, payload: RenameConversationRequest) -> dict:
    ok = session_store_module.session_store.rename_conversation(session_id, conv_id, payload.title)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"success": True}


@app.delete("/api/conversations/{session_id}/{conv_id}")
async def delete_conversation(session_id: str, conv_id: str) -> dict:
    ok = session_store_module.session_store.delete_conversation(session_id, conv_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"success": True}


@app.post("/api/conversations/{session_id}/{conv_id}/clear")
async def clear_conversation(session_id: str, conv_id: str) -> dict:
    ok = session_store_module.session_store.clear_conversation(session_id, conv_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"success": True}


@app.get("/api/conversations/{session_id}/{conv_id}/export")
async def export_conversation(session_id: str, conv_id: str, format: str = "md") -> Response:
    conv = session_store_module.session_store.get_conversation(session_id, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    title = conv["title"] or "Chat export"
    messages = conv["messages"]

    if format == "pdf":
        pdf_bytes = export_service.to_pdf(title, messages)
        safe_name = "".join(c for c in title if c.isalnum() or c in " -_").strip() or "chat"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
        )

    md_text = export_service.to_markdown(title, messages)
    safe_name = "".join(c for c in title if c.isalnum() or c in " -_").strip() or "chat"
    return Response(
        content=md_text,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.md"'},
    )


# --- Dashboard ---


@app.get("/api/dashboard/{session_id}", response_model=DashboardResponse)
async def dashboard(session_id: str) -> DashboardResponse:
    sources = session_store_module.session_store.list_sources(session_id)
    sources_by_type: dict[str, int] = {}
    total_chunks = 0
    for s in sources:
        sources_by_type[s["type"]] = sources_by_type.get(s["type"], 0) + 1
        total_chunks += s.get("chunk_count", 0)

    conversations = session_store_module.session_store.list_conversations(session_id)

    return DashboardResponse(
        total_sources=len(sources),
        total_chunks=total_chunks,
        total_conversations=len(conversations),
        total_messages=session_store_module.session_store.total_messages(session_id),
        uploads_count=stats_store_module.stats_store.get_upload_count(session_id),
        agent_invocations=stats_store_module.stats_store.get_agent_counts(session_id),
        recent_activity=stats_store_module.stats_store.get_recent_activity(session_id),
        sources_by_type=sources_by_type,
        session_age_seconds=stats_store_module.stats_store.get_session_age_seconds(session_id),
        last_active=stats_store_module.stats_store.get_last_active(session_id),
    )


# --- Podcast Audio Endpoint ---


@app.get("/api/podcast/audio/{audio_id}")
async def get_podcast_audio(audio_id: str) -> FileResponse:
    safe_id = "".join(c for c in audio_id if c.isalnum() or c in "_-")
    file_path = os.path.join(podcast_agent.AUDIO_DIR, f"{safe_id}.mp3")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Podcast audio file not found or expired.")
    return FileResponse(file_path, media_type="audio/mpeg", filename=f"{safe_id}.mp3")


# --- WebSocket: live agent activity + chat ---


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await manager.connect(session_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            message_type = payload.get("type")
            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            conv_id = payload.get("conv_id") or session_store_module.DEFAULT_CONVERSATION_ID

            try:
                if message_type == "chat":
                    query = (payload.get("message") or "").strip()
                    if not query:
                        continue
                    stats_store_module.stats_store.record_message(session_id)
                    try:
                        result = await graph.run_workflow(session_id, query, conv_id=conv_id)
                    except Exception as exc:  # noqa: BLE001 - surface any agent failure to the UI
                        error_answer = f"Something went wrong while processing your question: {exc}"
                        await manager.send_agent_status(session_id, "chat", "error", error_answer)
                        result = {"answer": error_answer, "citations": [], "web_citations": [], "verification": {}}
                    await manager.send_event(
                        session_id,
                        {
                            "type": "answer",
                            "content": result["answer"],
                            "conv_id": conv_id,
                            "citations": result.get("citations", []),
                            "web_citations": result.get("web_citations", []),
                            "verification": result.get("verification", {}),
                        },
                    )

                elif message_type == "summarize":
                    chunks = vector_store.query(session_id, "summary of all key points", top_k=20)
                    summary = await chat_agent.generate_summary(session_id, chunks)
                    session_store_module.session_store.append_message(
                        session_id, conv_id, "user", "Summarize all my sources."
                    )
                    session_store_module.session_store.append_message(session_id, conv_id, "assistant", summary)
                    await manager.send_event(session_id, {"type": "answer", "content": summary, "conv_id": conv_id})

                elif message_type == "quiz":
                    num_questions = int(payload.get("num_questions") or 5)
                    quiz_text = await quiz_agent.generate_quiz(session_id, num_questions)
                    session_store_module.session_store.append_message(
                        session_id, conv_id, "user", f"Generate a {num_questions}-question quiz from my sources."
                    )
                    session_store_module.session_store.append_message(session_id, conv_id, "assistant", quiz_text)
                    await manager.send_event(session_id, {"type": "answer", "content": quiz_text, "conv_id": conv_id})

                elif message_type == "podcast":
                    length = str(payload.get("length") or "medium")
                    source_ids = payload.get("source_ids")
                    podcast_result = await podcast_agent.generate_podcast(
                        session_id, length=length, source_ids=source_ids
                    )
                    if podcast_result.get("success"):
                        user_prompt = f"Generate a {length} podcast from my sources."
                        session_store_module.session_store.append_message(
                            session_id, conv_id, "user", user_prompt
                        )
                        session_store_module.session_store.append_message(
                            session_id,
                            conv_id,
                            "assistant",
                            podcast_result.get("transcript", ""),
                            meta={"podcast": podcast_result},
                        )
                        await manager.send_event(
                            session_id,
                            {
                                "type": "podcast_generated",
                                "conv_id": conv_id,
                                "podcast": podcast_result,
                                "content": podcast_result.get("transcript", ""),
                            },
                        )
                    else:
                        err = podcast_result.get("error", "Failed to generate podcast.")
                        await manager.send_event(
                            session_id,
                            {"type": "answer", "content": f"Podcast generation error: {err}", "conv_id": conv_id},
                        )

            except Exception as exc:  # noqa: BLE001 - never let one bad message kill the connection
                error_message = f"Something went wrong: {exc}"
                await manager.send_agent_status(session_id, message_type or "chat", "error", error_message)
                await manager.send_event(session_id, {"type": "answer", "content": error_message, "conv_id": conv_id})

    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
