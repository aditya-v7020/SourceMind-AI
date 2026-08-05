"""
Comparison Agent
-----------------
Runs right after the Source Agent's retrieval step. If the retrieved
chunks come from two or more DIFFERENT uploaded sources, this agent
asks Gemini to explicitly compare and contrast what those sources say
about the current question. Its output is folded into the Chat Agent's
prompt as extra context, so the final answer can explicitly mention
where sources agree, disagree, or add different details.

If only one source (or zero) is relevant to the question, this agent
does nothing - there is nothing to compare - and reports that clearly
in the activity log instead of silently skipping.
"""
from __future__ import annotations

from typing import Any

from app.services import llm_client
from app.websocket_manager import manager

AGENT_NAME = "comparison"


async def compare_sources(session_id: str, query: str, local_chunks: list[dict[str, Any]]) -> str:
    distinct_sources = sorted({chunk["source_name"] for chunk in local_chunks})

    if len(distinct_sources) < 2:
        message = (
            "No relevant sources found - nothing to compare."
            if not distinct_sources
            else "Only one relevant source found - nothing to compare."
        )
        await manager.send_agent_status(session_id, "comparison", "done", message)
        return ""

    await manager.send_agent_status(
        session_id,
        "comparison",
        "start",
        f"Comparing {len(distinct_sources)} sources: {', '.join(distinct_sources)}...",
    )

    grouped: dict[str, list[str]] = {}
    for chunk in local_chunks:
        grouped.setdefault(chunk["source_name"], []).append(chunk["content"])

    context_parts = []
    for name, contents in grouped.items():
        context_parts.append(f"--- From '{name}' ---\n" + "\n".join(contents))
    context = "\n\n".join(context_parts)

    prompt = (
        "The user asked the question below. You are given excerpts from "
        f"{len(distinct_sources)} different sources: {', '.join(distinct_sources)}. "
        "Write a short comparison (a few bullet points) of what these sources say "
        "in relation to the question - point out where they agree, where they "
        "disagree, or where one adds detail the other doesn't mention. If the "
        "sources don't actually overlap on this topic, say so briefly instead.\n\n"
        f"--- Question ---\n{query}\n\n{context}\n\nComparison:"
    )

    try:
        comparison = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        await manager.send_agent_status(
            session_id, "comparison", "error", f"Could not generate comparison: {exc}"
        )
        return ""

    await manager.send_agent_status(session_id, "comparison", "done", "Comparison ready.")
    return comparison
