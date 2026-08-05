"""
In-memory registry that tracks, per session_id:
  - metadata about each uploaded/added source (name, type, chunk counts...)
  - one or more named "conversations" (chat threads), each with its own
    running message history - like ChatGPT/NotebookLM, several
    conversations can share the same set of uploaded sources.

This is intentionally lightweight (no external database) to keep the app
fast and easy to run. It resets when the backend process restarts; the
actual vector embeddings persist on disk via ChromaDB regardless (see
vector_store.py).
"""
from __future__ import annotations

import time
import uuid
from threading import Lock
from typing import Any

DEFAULT_CONVERSATION_ID = "default"
_MAX_HISTORY_TURNS = 40


def _new_conversation(title: str = "New chat") -> dict[str, Any]:
    now = time.time()
    return {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "created_at": now,
        "updated_at": now,
        "messages": [],  # [{role, content, timestamp, meta}]
    }


class SessionStore:
    def __init__(self) -> None:
        self._sources: dict[str, list[dict[str, Any]]] = {}
        self._conversations: dict[str, dict[str, dict[str, Any]]] = {}
        self._conversation_order: dict[str, list[str]] = {}
        self._lock = Lock()

    # --- sources ---
    def add_source(self, session_id: str, source_info: dict[str, Any]) -> None:
        with self._lock:
            self._sources.setdefault(session_id, []).append(source_info)

    def list_sources(self, session_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._sources.get(session_id, []))

    def has_sources(self, session_id: str) -> bool:
        with self._lock:
            return bool(self._sources.get(session_id))

    def delete_source(self, session_id: str, source_id: str) -> bool:
        with self._lock:
            sources = self._sources.get(session_id, [])
            new_sources = [s for s in sources if s.get("id") != source_id]
            removed = len(new_sources) != len(sources)
            self._sources[session_id] = new_sources
            return removed

    # --- conversations ---
    def _ensure_session(self, session_id: str) -> None:
        if session_id not in self._conversations:
            self._conversations[session_id] = {}
            self._conversation_order[session_id] = []

    def create_conversation(self, session_id: str, title: str | None = None) -> dict[str, Any]:
        with self._lock:
            self._ensure_session(session_id)
            conv = _new_conversation(title or "New chat")
            self._conversations[session_id][conv["id"]] = conv
            self._conversation_order[session_id].append(conv["id"])
            return dict(conv)

    def list_conversations(self, session_id: str) -> list[dict[str, Any]]:
        with self._lock:
            self._ensure_session(session_id)
            order = self._conversation_order.get(session_id, [])
            convs = self._conversations.get(session_id, {})
            result = []
            for cid in order:
                c = convs.get(cid)
                if not c:
                    continue
                result.append(
                    {
                        "id": c["id"],
                        "title": c["title"],
                        "created_at": c["created_at"],
                        "updated_at": c["updated_at"],
                        "message_count": len(c["messages"]),
                    }
                )
            result.sort(key=lambda c: c["updated_at"], reverse=True)
            return result

    def get_conversation(self, session_id: str, conv_id: str) -> dict[str, Any] | None:
        with self._lock:
            self._ensure_session(session_id)
            conv = self._conversations.get(session_id, {}).get(conv_id)
            return dict(conv) if conv else None

    def rename_conversation(self, session_id: str, conv_id: str, title: str) -> bool:
        with self._lock:
            conv = self._conversations.get(session_id, {}).get(conv_id)
            if not conv:
                return False
            conv["title"] = title.strip() or conv["title"]
            conv["updated_at"] = time.time()
            return True

    def delete_conversation(self, session_id: str, conv_id: str) -> bool:
        with self._lock:
            convs = self._conversations.get(session_id, {})
            if conv_id not in convs:
                return False
            del convs[conv_id]
            order = self._conversation_order.get(session_id, [])
            if conv_id in order:
                order.remove(conv_id)
            return True

    def clear_conversation(self, session_id: str, conv_id: str) -> bool:
        """Removes all messages but keeps the conversation (and its title)."""
        with self._lock:
            conv = self._conversations.get(session_id, {}).get(conv_id)
            if not conv:
                return False
            conv["messages"] = []
            conv["updated_at"] = time.time()
            return True

    def append_message(
        self, session_id: str, conv_id: str, role: str, content: str, meta: dict[str, Any] | None = None
    ) -> None:
        with self._lock:
            self._ensure_session(session_id)
            convs = self._conversations.setdefault(session_id, {})
            if conv_id not in convs:
                conv = _new_conversation("New chat")
                conv["id"] = conv_id
                convs[conv_id] = conv
                self._conversation_order.setdefault(session_id, []).append(conv_id)
            conv = convs[conv_id]
            entry = {"role": role, "content": content, "timestamp": time.time()}
            if meta:
                entry["meta"] = meta
            conv["messages"].append(entry)
            conv["messages"] = conv["messages"][-(_MAX_HISTORY_TURNS * 2):]
            conv["updated_at"] = time.time()
            if role == "user" and conv["title"] in ("New chat", "Chat"):
                snippet = content.strip().replace("\n", " ")[:48]
                conv["title"] = snippet + ("..." if len(content.strip()) > 48 else "")

    def get_history(self, session_id: str, conv_id: str = DEFAULT_CONVERSATION_ID) -> list[dict[str, str]]:
        with self._lock:
            self._ensure_session(session_id)
            conv = self._conversations.get(session_id, {}).get(conv_id)
            if not conv:
                return []
            return [{"role": m["role"], "content": m["content"]} for m in conv["messages"][-20:]]

    def get_messages(self, session_id: str, conv_id: str) -> list[dict[str, Any]]:
        with self._lock:
            self._ensure_session(session_id)
            conv = self._conversations.get(session_id, {}).get(conv_id)
            return list(conv["messages"]) if conv else []

    def conversation_title(self, session_id: str, conv_id: str) -> str:
        with self._lock:
            conv = self._conversations.get(session_id, {}).get(conv_id)
            return conv["title"] if conv else "Chat"

    def total_conversations(self, session_id: str) -> int:
        with self._lock:
            return len(self._conversations.get(session_id, {}))

    def total_messages(self, session_id: str) -> int:
        with self._lock:
            return sum(len(c["messages"]) for c in self._conversations.get(session_id, {}).values())


session_store = SessionStore()
