"""
Query Rewriter Agent
---------------------
Runs BEFORE the Source Agent's retrieval step. Takes the user's raw
question (which might be short, vague, or depend on earlier chat
context - e.g. "what about its price?") plus the recent conversation
history, and asks Gemini to rewrite it into one clear, standalone
search query. That rewritten query is what actually gets used to
search the vector store and the web - while the user's original
wording is still what gets shown in the chat and answered directly.

This mirrors a common real-world RAG technique: the question a person
types is not always the best possible search query.
"""
from __future__ import annotations

from app.services import llm_client
from app.websocket_manager import manager

AGENT_NAME = "rewriter"


async def rewrite_query(session_id: str, query: str, history: list[dict[str, str]]) -> str:
    await manager.send_agent_status(
        session_id, "rewriter", "start", "Refining your question into a clear search query..."
    )

    # If there's no conversation history yet, a short question is usually
    # already fine as-is - skip the extra LLM call to keep things fast.
    if not history:
        await manager.send_agent_status(
            session_id, "rewriter", "done", "No prior context yet - using your question as-is."
        )
        return query

    recent = "\n".join(
        f"{'User' if turn['role'] == 'user' else 'Assistant'}: {turn['content']}"
        for turn in history[-4:]
    )
    prompt = (
        "Rewrite the user's latest question as a single, clear, standalone search "
        "query, resolving any pronouns or references to earlier messages (e.g. "
        "'it', 'that', 'the second one') using the conversation below. "
        "Return ONLY the rewritten query - no explanation, no quotation marks.\n\n"
        f"--- Recent Conversation ---\n{recent}\n\n"
        f"--- Latest Question ---\n{query}\n\n"
        "Rewritten standalone query:"
    )

    try:
        rewritten = await llm_client.generate_text(AGENT_NAME, prompt)
        rewritten = rewritten.strip().strip('"').strip()
    except Exception:
        # If the rewrite call fails for any reason, silently fall back to
        # the original question rather than blocking the whole pipeline.
        await manager.send_agent_status(
            session_id, "rewriter", "done", "Could not refine the query - using it as typed."
        )
        return query

    if not rewritten:
        rewritten = query

    if rewritten.strip().lower() == query.strip().lower():
        await manager.send_agent_status(session_id, "rewriter", "done", "Question was already clear.")
    else:
        await manager.send_agent_status(
            session_id, "rewriter", "done", f'Refined query: "{rewritten}"'
        )

    return rewritten
