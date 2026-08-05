"""
Lightweight in-memory analytics used to power the Dashboard page.

Tracks, per session_id:
  - a bounded rolling activity feed (agent, stage, message, timestamp)
  - per-agent invocation counters (how many times each agent has run)
  - message / upload counters
  - first-seen / last-active timestamps

Like the rest of the app's state, this resets when the backend process
restarts - it is meant to give a live, "right now" picture of usage
rather than durable long-term analytics.
"""
from __future__ import annotations

import time
from threading import Lock
from typing import Any

_MAX_ACTIVITY = 200


class StatsStore:
    def __init__(self) -> None:
        self._activity: dict[str, list[dict[str, Any]]] = {}
        self._agent_counts: dict[str, dict[str, int]] = {}
        self._message_counts: dict[str, int] = {}
        self._upload_counts: dict[str, int] = {}
        self._first_seen: dict[str, float] = {}
        self._last_active: dict[str, float] = {}
        self._lock = Lock()

    def _touch(self, session_id: str) -> None:
        now = time.time()
        self._first_seen.setdefault(session_id, now)
        self._last_active[session_id] = now

    def record_agent_event(self, session_id: str, agent: str, stage: str, message: str) -> None:
        with self._lock:
            self._touch(session_id)
            feed = self._activity.setdefault(session_id, [])
            feed.append({"agent": agent, "stage": stage, "message": message, "timestamp": time.time()})
            if len(feed) > _MAX_ACTIVITY:
                del feed[: len(feed) - _MAX_ACTIVITY]

            if stage in ("done", "error"):
                counts = self._agent_counts.setdefault(session_id, {})
                counts[agent] = counts.get(agent, 0) + 1

    def record_message(self, session_id: str) -> None:
        with self._lock:
            self._touch(session_id)
            self._message_counts[session_id] = self._message_counts.get(session_id, 0) + 1

    def record_upload(self, session_id: str) -> None:
        with self._lock:
            self._touch(session_id)
            self._upload_counts[session_id] = self._upload_counts.get(session_id, 0) + 1

    def get_recent_activity(self, session_id: str, limit: int = 30) -> list[dict[str, Any]]:
        with self._lock:
            feed = list(self._activity.get(session_id, []))
        return list(reversed(feed[-limit:]))

    def get_agent_counts(self, session_id: str) -> dict[str, int]:
        with self._lock:
            return dict(self._agent_counts.get(session_id, {}))

    def get_message_count(self, session_id: str) -> int:
        with self._lock:
            return self._message_counts.get(session_id, 0)

    def get_upload_count(self, session_id: str) -> int:
        with self._lock:
            return self._upload_counts.get(session_id, 0)

    def get_session_age_seconds(self, session_id: str) -> float | None:
        with self._lock:
            first = self._first_seen.get(session_id)
        return (time.time() - first) if first else None

    def get_last_active(self, session_id: str) -> float | None:
        with self._lock:
            return self._last_active.get(session_id)


stats_store = StatsStore()
