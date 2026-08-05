"""
Quiz Generator Agent
----------------------
A separate, standalone agent - NOT part of the main chat LangGraph
pipeline. It is triggered directly by its own "Generate quiz" button in
the UI (much like the existing "Summarize sources" action), rather than
running on every chat message.

It pulls a broad sample of chunks from across all of the session's
uploaded sources and asks Gemini to turn them into a short practice
quiz - useful for a student studying from their own uploaded material.
"""
from __future__ import annotations

from app.services import llm_client, vector_store
from app.websocket_manager import manager

AGENT_NAME = "quiz"

# A generic query used to pull a broad, representative sample of chunks
# from the vector store, rather than chunks matching one specific question.
_BROAD_SAMPLE_QUERY = "key concepts, definitions, facts, and important details"


async def generate_quiz(session_id: str, num_questions: int = 5) -> str:
    await manager.send_agent_status(session_id, "quiz", "start", "Reviewing your sources...")

    chunks = vector_store.query(session_id, _BROAD_SAMPLE_QUERY, top_k=20)

    if not chunks:
        await manager.send_agent_status(session_id, "quiz", "done", "No sources available to quiz on yet.")
        return "You haven't added any sources yet. Upload a PDF, text file, URL, or paste some text first."

    await manager.send_agent_status(
        session_id, "quiz", "progress", f"Writing {num_questions} practice questions..."
    )

    context = "\n\n".join(f"From '{c['source_name']}':\n{c['content']}" for c in chunks)
    prompt = (
        f"Using ONLY the source material below, write a {num_questions}-question "
        "practice quiz to help a student study this material. Use a mix of "
        "multiple-choice questions (4 options, one clearly correct) and short-"
        "answer questions. Number each question using '1.', '2.', etc. Use a "
        "### Questions header, then a ### Answer Key header (no horizontal rules, "
        "no other section headers). In the Answer Key, list the correct answer "
        "for every question with a one-line explanation. Keep formatting simple: "
        "numbered lists and bold text only - no nested bullet points.\n\n"
        f"{context}"
    )

    try:
        quiz = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        error_message = f"Could not reach Gemini: {exc}"
        await manager.send_agent_status(session_id, "quiz", "error", error_message)
        return error_message

    await manager.send_agent_status(session_id, "quiz", "done", "Quiz ready.")
    return quiz
