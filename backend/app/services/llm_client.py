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
import time

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


def _is_transient_503(exc: Exception) -> bool:
    """Returns True if the exception indicates a 503 UNAVAILABLE or temporary high-demand server error."""
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code == 503:
        return True
    err_str = str(exc).upper()
    transient_indicators = [
        "503",
        "UNAVAILABLE",
        "HIGH DEMAND",
        "OVERLOADED",
        "SERVER ERROR",
        "TEMPORARILY UNABLE",
        "TRY AGAIN LATER",
    ]
    return any(ind in err_str for ind in transient_indicators)


def _generate_single_attempt(agent: str, prompt: str, model_name: str) -> str:
    client = get_client(agent)
    response = client.models.generate_content(model=model_name, contents=prompt)
    return (response.text or "").strip()


def _generate_sync(agent: str, prompt: str, model: str | None = None) -> str:
    """
    Executes Gemini generation with:
    1. Up to 3 retries with exponential backoff (~2s, ~4s, ~8s) for 503 UNAVAILABLE / high demand.
    2. Automatic fallback to alternative supported Gemini Flash models if primary model remains 503.
    """
    primary_model = model or settings.GEMINI_MODEL
    delays = [2, 4, 8]

    # 1. Attempt primary model with retries
    for attempt in range(len(delays) + 1):
        try:
            return _generate_single_attempt(agent, prompt, primary_model)
        except Exception as exc:
            if not _is_transient_503(exc):
                # Permanent error (400 bad request, 401 invalid key, etc.) - do not retry
                raise exc

            if attempt < len(delays):
                delay = delays[attempt]
                print(
                    f"[llm_client] 503 UNAVAILABLE / High demand on model '{primary_model}' for {agent} agent "
                    f"(retry {attempt + 1}/{len(delays)}). Waiting {delay}s before retrying..."
                )
                time.sleep(delay)
            else:
                print(
                    f"[llm_client] Primary model '{primary_model}' exhausted all {len(delays)} retries due to 503 high demand. "
                    "Initiating fallback model cascade..."
                )

    # 2. Primary model exhausted due to 503 - try fallback models
    candidate_fallbacks = settings.available_models_list + [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
    ]
    unique_fallbacks: list[str] = []
    for f in candidate_fallbacks:
        if f not in unique_fallbacks and f != primary_model:
            unique_fallbacks.append(f)

    for fb_model in unique_fallbacks:
        print(f"[llm_client] Trying fallback model '{fb_model}' for {agent} agent...")
        for attempt in range(len(delays) + 1):
            try:
                res_text = _generate_single_attempt(agent, prompt, fb_model)
                print(f"[llm_client] Successfully generated response using fallback model '{fb_model}' for {agent} agent.")
                return res_text
            except Exception as exc:
                if not _is_transient_503(exc):
                    raise exc
                if attempt < len(delays):
                    delay = delays[attempt]
                    print(
                        f"[llm_client] Fallback model '{fb_model}' returned 503 for {agent} agent. "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
                else:
                    print(f"[llm_client] Fallback model '{fb_model}' also exhausted retries.")

    raise RuntimeError(
        "All configured Gemini models are currently experiencing high demand (503 UNAVAILABLE). "
        "Please try again in a few moments."
    )


async def generate_text(agent: str, prompt: str, model: str | None = None) -> str:
    """Runs a Gemini generation call (using the given agent's own API key)
    in a background thread so it never blocks the FastAPI event loop.
    Raises on failure - callers decide how to report the error to their
    own agent's status/log."""
    text = await asyncio.to_thread(_generate_sync, agent, prompt, model)
    return text or "I wasn't able to generate a response for that."

