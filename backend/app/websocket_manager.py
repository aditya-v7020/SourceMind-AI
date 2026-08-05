"""
Manages WebSocket connections keyed by session_id and provides a single
place to broadcast real-time agent activity events to the connected
frontend. This is what powers the live "Searching the web...",
"Found 5 sources...", workflow-panel style transparency in the UI.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        sockets = self._connections.get(session_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and session_id in self._connections:
            del self._connections[session_id]

    async def send_event(self, session_id: str, payload: dict[str, Any]) -> None:
        """Send a JSON payload to every socket open for this session."""
        payload = {"timestamp": time.time(), **payload}
        sockets = list(self._connections.get(session_id, []))
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                # Socket may have dropped; clean it up silently.
                self.disconnect(session_id, socket)

    async def send_agent_status(
        self,
        session_id: str,
        agent: str,
        stage: str,
        message: str,
        **extra: Any,
    ) -> None:
        """
        Convenience helper for agent activity events.

        agent: "source" | "research" | "chat" | "verifier" | "quiz"
        stage: "start" | "progress" | "done" | "error"
        """
        # Local import to avoid a circular import at module load time
        # (stats_store has no dependency back on this module).
        from app.services.stats_store import stats_store

        stats_store.record_agent_event(session_id, agent, stage, message)

        await self.send_event(
            session_id,
            {
                "type": "agent_status",
                "agent": agent,
                "stage": stage,
                "message": message,
                **extra,
            },
        )


# Single shared instance used across the whole application.
manager = ConnectionManager()
