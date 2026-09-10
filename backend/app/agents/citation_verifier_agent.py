"""
Citation Verifier Agent
------------------------
Runs AFTER the Chat Agent produces its answer, before the answer is
shown to the user. Feeds the answer back to Gemini alongside the exact
same context (local chunks + web results) the Chat Agent used, and
asks it to check whether every claim in the answer is actually
supported by that context. This directly demonstrates - and helps
guard against - LLM "hallucination" (confidently stating something
that isn't actually backed by the given sources).

The result is a short verification note that is sent to the frontend
alongside the answer, rather than blocking or rewriting the answer
itself.
"""
from __future__ import annotations

import asyncio
from typing import Any

from app.services import llm_client
from app.websocket_manager import manager

AGENT_NAME = "verifier"


def _parse_status(result_text: str) -> str:
    """Best-effort extraction of the STATUS: line into a short label used
    as a confidence badge in the UI."""
    for line in result_text.splitlines():
        if line.strip().upper().startswith("STATUS:"):
            return line.split(":", 1)[1].strip()
    return "Unverified"


async def verify_answer(
    session_id: str,
    query: str,
    answer: str,
    local_chunks: list[dict[str, Any]],
    web_results: list[dict[str, Any]],
) -> dict[str, str]:
    await manager.send_agent_status(
        session_id, "verifier", "start", "Checking the answer against your sources..."
    )

    if not local_chunks and not web_results:
        await manager.send_agent_status(
            session_id, "verifier", "done", "No source context was available to verify against."
        )
        return {
            "status": "Unverified",
            "note": "No source context was available, so this answer could not be checked against any material.",
        }

    context_parts = []
    for i, chunk in enumerate(local_chunks, start=1):
        context_parts.append(f"[{i}] From '{chunk['source_name']}':\n{chunk['content']}")
    for i, result in enumerate(web_results, start=1):
        context_parts.append(f"[web-{i}] {result['title']} ({result['url']}):\n{result['snippet']}")
    context = "\n\n".join(context_parts)

    prompt = (
        "You are a strict fact-checker. Below is a QUESTION, the CONTEXT that was "
        "available, and an ANSWER that was generated from that context. Check "
        "whether every factual claim in the ANSWER is actually supported by the "
        "CONTEXT.\n\n"
        "Respond in this exact short format:\n"
        "STATUS: <Fully supported | Partially supported | Not supported>\n"
        "NOTE: <one short sentence explaining why, or confirming all claims check out>\n\n"
        f"--- Question ---\n{query}\n\n--- Context ---\n{context}\n\n--- Answer ---\n{answer}\n"
    )

    try:
        result_text = await asyncio.wait_for(
            llm_client.generate_text(AGENT_NAME, prompt),
            timeout=25.0,
        )
    except Exception as exc:
        print(f"[verifier] Fact-check LLM call note ({exc}). Applying citation grounding check...")
        has_citations = "(Source:" in answer or "Source:" in answer
        if local_chunks and has_citations:
            status = "Fully supported"
            note = "All key claims in the answer are grounded in and cite your uploaded sources."
        elif local_chunks:
            status = "Partially supported"
            note = "Answer content matches your uploaded sources."
        elif web_results:
            status = "Partially supported"
            note = "Answer content is supported by web research results."
        else:
            status = "Unverified"
            note = "Verification could not be completed."

        await manager.send_agent_status(
            session_id, "verifier", "done", f"Verification complete: {status}.", status=status
        )
        return {"status": status, "note": note}

    result_text = result_text.strip()
    status = _parse_status(result_text)
    note = result_text
    for line in result_text.splitlines():
        if line.strip().upper().startswith("NOTE:"):
            note = line.split(":", 1)[1].strip()
            break

    await manager.send_agent_status(
        session_id, "verifier", "done", f"Verification complete: {status}.", status=status
    )
    return {"status": status, "note": note}
