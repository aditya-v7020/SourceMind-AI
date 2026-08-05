"""
Shared Gemini client utility.
-----------------------------
Each agent gets its own independent Gemini client, built from its own
dedicated API key (CHAT_AGENT_API_KEY, RESEARCH_AGENT_API_KEY,
SOURCE_AGENT_API_KEY, QUIZ_AGENT_API_KEY, VERIFIER_AGENT_API_KEY).
Clients are created lazily and cached per agent.

If the Quiz or Citation Verifier agent's own key is left blank, it
transparently falls back to CHAT_AGENT_API_KEY so a setup with only one
key configured still works. The three original agents (chat/research/
source) do NOT fall back to one another - that's unchanged from the
original app.
"""
from __future__ import annotations

import asyncio

from app.config import settings

# Agents that fall back to the Chat Agent's key when their own is unset.
_FALLBACK_TO_CHAT = {"source", "quiz", "verifier", "podcast"}

_clients: dict[str, Any] = {}


def _get_own_api_key(agent: str) -> str:
    key_attr = f"{agent.upper()}_AGENT_API_KEY"
    return str(getattr(settings, key_attr, "") or "")


def _resolve_api_key(agent: str) -> str:
    api_key = _get_own_api_key(agent)
    if not api_key and agent in _FALLBACK_TO_CHAT:
        api_key = settings.CHAT_AGENT_API_KEY
    return api_key


def get_client(agent: str) -> Any:
    """Lazily builds (and caches) the Gemini client for one agent, using
    that agent's own dedicated API key (falling back to the Chat Agent's
    key if its own key isn't set)."""
    if agent not in _clients:
        api_key = _resolve_api_key(agent)
        if not api_key:
            env_var = f"{agent.upper()}_AGENT_API_KEY"
            raise RuntimeError(f"{env_var} is not set. Add it to backend/.env before using the {agent} agent.")
        from google import genai
        _clients[agent] = genai.Client(api_key=api_key)
    return _clients[agent]


def try_initialize(agent: str) -> bool:
    """Attempts to build the client for one agent without raising - used
    for an optional startup warm-up so it's easy to see which agents are
    configured. Returns True if that agent's key is set (directly or via
    fallback) and the client was created successfully."""
    try:
        get_client(agent)
        return True
    except RuntimeError:
        return False


def has_own_key(agent: str) -> bool:
    """True only if this agent has its OWN dedicated key configured
    (i.e. not merely inheriting the Chat Agent's key). Used by the
    Settings page to show accurate per-agent key status."""
    return bool(_get_own_api_key(agent))



def is_ready(agent: str) -> bool:
    """True if this agent has a usable key, either its own or (for the
    agents that support it) a fallback to the Chat Agent's key."""
    return bool(_resolve_api_key(agent))


def _generate_sync(agent: str, prompt: str, model: str | None = None) -> str:
    client = get_client(agent)
    response = client.models.generate_content(model=model or settings.GEMINI_MODEL, contents=prompt)
    return (response.text or "").strip()


async def generate_text(agent: str, prompt: str, model: str | None = None) -> str:
    """Runs a Gemini generation call (using the given agent's own API key)
    in a background thread so it never blocks the FastAPI event loop.
    Raises on failure - callers decide how to report the error to their
    own agent's status/log."""
    text = await asyncio.to_thread(_generate_sync, agent, prompt, model)
    return text or "I wasn't able to generate a response for that."
