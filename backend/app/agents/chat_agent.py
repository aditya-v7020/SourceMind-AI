"""
Summarization / Chat Agent
--------------------------
Final stage of the pipeline. Takes whatever the Source Agent retrieved
from the vector store, plus (optionally) whatever the Research Agent
found on the web, plus the running conversation history, and asks
Google Gemini (via its own CHAT_AGENT_API_KEY) to produce a grounded
answer that cites which source(s) it drew on.
"""
from __future__ import annotations

from typing import Any

from app.services import llm_client
from app.websocket_manager import manager

AGENT_NAME = "chat"


def _build_prompt(
    query: str,
    local_chunks: list[dict[str, Any]],
    web_results: list[dict[str, Any]],
    history: list[dict[str, str]],
) -> str:
    parts: list[str] = []

    parts.append(
        "You are a helpful research assistant, similar to NotebookLM. Answer the "
        "user's question using ONLY the context provided below (their uploaded "
        "sources and, if included, web research results). If the context does not "
        "contain the answer, say so honestly instead of guessing. When you use a "
        "piece of information, mention which source it came from in parentheses, "
        "e.g. (Source: filename.pdf) or (Source: example.com). Format your answer "
        "in clean Markdown, but keep it simple - use paragraphs and bullet points "
        "only where they genuinely help; avoid unnecessary headers or horizontal "
        "rules for a short, direct answer."
    )

    if local_chunks:
        parts.append("\n--- Uploaded Source Context ---")
        for i, chunk in enumerate(local_chunks, start=1):
            parts.append(f"[{i}] From '{chunk['source_name']}':\n{chunk['content']}")

    if web_results:
        parts.append("\n--- Web Research Results ---")
        for i, result in enumerate(web_results, start=1):
            parts.append(
                f"[{i}] {result['title']} ({result['url']}):\n{result['snippet']}"
            )

    if not local_chunks and not web_results:
        parts.append(
            "\n(No uploaded sources or web results are available. Let the user know "
            "you have no context to draw on for this question.)"
        )

    if history:
        parts.append("\n--- Recent Conversation ---")
        for turn in history[-6:]:
            role = "User" if turn["role"] == "user" else "Assistant"
            parts.append(f"{role}: {turn['content']}")

    parts.append(f"\n--- Current Question ---\n{query}")
    parts.append("\nAnswer:")

    return "\n".join(parts)


async def generate_answer(
    session_id: str,
    query: str,
    local_chunks: list[dict[str, Any]],
    web_results: list[dict[str, Any]],
    history: list[dict[str, str]],
) -> str:
    await manager.send_agent_status(session_id, "chat", "start", "Generating answer from gathered context...")

    prompt = _build_prompt(query, local_chunks, web_results, history)

    try:
        answer = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        error_message = f"Could not reach Gemini: {exc}"
        await manager.send_agent_status(session_id, "chat", "error", error_message)
        return error_message

    await manager.send_agent_status(session_id, "chat", "done", "Answer ready.")
    return answer


async def generate_summary(session_id: str, local_chunks: list[dict[str, Any]]) -> str:
    """Used for the 'summarize my sources' quick action."""
    await manager.send_agent_status(session_id, "chat", "start", "Summarizing your sources...")

    if not local_chunks:
        await manager.send_agent_status(session_id, "chat", "done", "Nothing to summarize yet.")
        return "You haven't added any sources yet. Upload a PDF, text file, URL, or paste some text to get started."

    context = "\n\n".join(f"From '{c['source_name']}':\n{c['content']}" for c in local_chunks)
    prompt = (
        "Write a clear, well-organized summary of the following source material, "
        "formatted in clean Markdown for direct display in a chat UI:\n"
        "- Use a few short ### section headers (no more than 4-5 sections total).\n"
        "- Use short paragraphs and bullet points where helpful, not both for the "
        "same point.\n"
        "- Do NOT use horizontal rules (---) between sections - headers alone are "
        "enough separation.\n"
        "- Mention which source each key point comes from inline, in parentheses, "
        "e.g. (Source: filename.pdf), rather than as a separate line.\n\n"
        + context
    )

    try:
        summary = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        error_message = f"Could not reach Gemini: {exc}"
        await manager.send_agent_status(session_id, "chat", "error", error_message)
        return error_message

    await manager.send_agent_status(session_id, "chat", "done", "Summary ready.")
    return summary
