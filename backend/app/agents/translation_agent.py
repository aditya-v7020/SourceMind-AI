"""
Translation Agent
------------------
Runs at the very end of the pipeline, only if the user selected a
target language other than English in the chat UI. Translates the
already-generated, already-verified English answer into that language.

The original English answer is still what gets saved into the chat
history (so future questions have consistent, unambiguous context) -
only the copy shown to the user in the UI is translated.
"""
from __future__ import annotations

from app.services import llm_client
from app.websocket_manager import manager

# Keep this in sync with the <select> options in the frontend's ChatPanel.
NO_TRANSLATION_VALUES = {"", "english", "en"}
AGENT_NAME = "translator"


async def translate_text(session_id: str, text: str, target_language: str) -> str:
    if not text.strip() or target_language.strip().lower() in NO_TRANSLATION_VALUES:
        return text

    await manager.send_agent_status(
        session_id, "translator", "start", f"Translating the answer into {target_language}..."
    )

    prompt = (
        f"Translate the following text into {target_language}. Preserve the "
        "meaning, tone, and any source citations exactly. Return ONLY the "
        "translated text, with no extra commentary.\n\n"
        f"--- Text to translate ---\n{text}"
    )

    try:
        translated = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        await manager.send_agent_status(
            session_id, "translator", "error", f"Translation failed, showing the English answer: {exc}"
        )
        return text

    await manager.send_agent_status(
        session_id, "translator", "done", f"Translated into {target_language}."
    )
    return translated.strip() or text
