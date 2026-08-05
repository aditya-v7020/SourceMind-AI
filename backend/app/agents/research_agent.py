"""
Research Agent
--------------
Triggered by the workflow graph whenever the retrieved local source
chunks are missing or too weakly related to the user's question. It
searches the public web (via DuckDuckGo, no API key required) and
returns a short list of results whose title/snippet/url become
additional context for the Chat Agent.

Emits real-time status events so the frontend can show
"Searching the web for ..." / "Found N sources" style transparency.
"""
from __future__ import annotations

import asyncio
from typing import Any

from ddgs import DDGS

from app.websocket_manager import manager


def _search_sync(query: str, max_results: int) -> list[dict[str, Any]]:
    with DDGS() as ddgs:
        raw_results = list(ddgs.text(query, max_results=max_results))
    return [
        {
            "title": r.get("title", "Untitled"),
            "url": r.get("href", ""),
            "snippet": r.get("body", ""),
        }
        for r in raw_results
    ]


async def research_web(session_id: str, query: str, max_results: int = 5) -> list[dict[str, Any]]:
    await manager.send_agent_status(
        session_id, "research", "start", f'Searching the web for: "{query}"...'
    )
    try:
        results = await asyncio.to_thread(_search_sync, query, max_results)
    except Exception as exc:
        await manager.send_agent_status(
            session_id, "research", "error", f"Web search failed: {exc}"
        )
        return []

    if results:
        await manager.send_agent_status(
            session_id,
            "research",
            "done",
            f"Found {len(results)} web result(s).",
            results=results,
        )
    else:
        await manager.send_agent_status(session_id, "research", "done", "No relevant web results found.")

    return results
