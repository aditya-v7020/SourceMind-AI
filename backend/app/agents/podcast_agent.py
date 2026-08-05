"""
Podcast Generator Agent (6th Agent)
-----------------------------------
An independent, on-demand agent — NOT part of the main chat LangGraph
pipeline (`graph.py`). It runs only when the user requests a podcast.

Features:
- Pulls chunks from selected sources or all uploaded sources in the session.
- Prompts Gemini (using PODCAST_AGENT_API_KEY) to draft a strictly source-grounded
  2-speaker dialogue between [Host] and [Expert].
- Supports Short, Medium, and Detailed length options.
- Uses high-quality edge-tts (or gTTS fallback) with genuinely different voices
  for Host and Expert.
- Merges audio clips safely, stores them under backend/podcast_audio/{audio_id}.mp3,
  and manages periodic cleanup of expired audio files.
- Emits real-time progress updates via websocket_manager for WorkflowPanel transparency.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
import uuid
from typing import Any

from app.services import llm_client, vector_store
from app.websocket_manager import manager

AGENT_NAME = "podcast"
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "podcast_audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

# Voice configurations for distinct Host and Expert speakers
HOST_VOICE_EDGE = "en-US-AvaNeural"
EXPERT_VOICE_EDGE = "en-US-ChristopherNeural"

HOST_GTTS_TLD = "co.uk"
EXPERT_GTTS_TLD = "com"

LENGTH_CONFIGS = {
    "short": {
        "turns": "4 to 6 speaker turns",
        "word_count": "200-300 words",
        "desc": "concise overview highlights",
    },
    "medium": {
        "turns": "8 to 12 speaker turns",
        "word_count": "500-700 words",
        "desc": "balanced in-depth discussion",
    },
    "detailed": {
        "turns": "15 to 20 speaker turns",
        "word_count": "1000-1400 words",
        "desc": "comprehensive deep-dive breakdown",
    },
}

_BROAD_SAMPLE_QUERY = "key concepts, definitions, main points, summary, analysis, and core facts"


def cleanup_old_audio_files(max_age_seconds: int = 3600, max_files: int = 30) -> None:
    """Removes temporary audio files older than max_age_seconds or enforces max_files count."""
    try:
        now = time.time()
        files = []
        for filename in os.listdir(AUDIO_DIR):
            if filename.endswith(".mp3"):
                file_path = os.path.join(AUDIO_DIR, filename)
                mtime = os.path.getmtime(file_path)
                files.append((file_path, mtime))

        # Delete expired files
        for file_path, mtime in files:
            if now - mtime > max_age_seconds:
                try:
                    os.remove(file_path)
                except OSError:
                    pass

        # If still over max_files, delete oldest
        remaining = [(p, m) for p, m in files if os.path.exists(p)]
        if len(remaining) > max_files:
            remaining.sort(key=lambda x: x[1])
            for file_path, _ in remaining[:-max_files]:
                try:
                    os.remove(file_path)
                except OSError:
                    pass
    except Exception as exc:
        print(f"[podcast_agent] File cleanup notice: {exc}")


def _parse_dialogue(raw_text: str) -> list[dict[str, str]]:
    """Extracts structured [Host] and [Expert] turns from generated text."""
    dialogue: list[dict[str, str]] = []
    
    # Try parsing JSON if Gemini returned JSON array
    json_match = re.search(r"\[\s*\{.*\}\s*\]", raw_text, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
            if isinstance(parsed, list):
                for item in parsed:
                    speaker = str(item.get("speaker", "Host")).strip()
                    text = str(item.get("text", "")).strip()
                    if speaker and text:
                        normalized_speaker = "Host" if "host" in speaker.lower() else "Expert"
                        dialogue.append({"speaker": normalized_speaker, "text": text})
                if dialogue:
                    return dialogue
        except json.JSONDecodeError:
            pass

    # Line-by-line fallback parser
    pattern = re.compile(r"^\s*\[?(Host|Expert)\]?\s*:\s*(.*)$", re.IGNORECASE)
    lines = raw_text.splitlines()
    current_speaker = "Host"
    current_text = []

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        match = pattern.match(line_str)
        if match:
            if current_text:
                dialogue.append({"speaker": current_speaker, "text": " ".join(current_text).strip()})
                current_text = []
            speaker_str = match.group(1).strip()
            current_speaker = "Host" if "host" in speaker_str.lower() else "Expert"
            current_text.append(match.group(2).strip())
        else:
            current_text.append(line_str)

    if current_text:
        dialogue.append({"speaker": current_speaker, "text": " ".join(current_text).strip()})

    # Fallback if no turns recognized
    if not dialogue:
        dialogue = [
            {"speaker": "Host", "text": "Welcome to the podcast overview of your sources."},
            {"speaker": "Expert", "text": raw_text.strip() or "Here is the key summary of the material."},
        ]

    return dialogue


async def _generate_audio_edge(dialogue: list[dict[str, str]], output_path: str) -> bool:
    """Generates distinct TTS audio using edge-tts for Host and Expert."""
    try:
        import edge_tts

        temp_files: list[str] = []
        for idx, turn in enumerate(dialogue):
            speaker = turn["speaker"]
            text = turn["text"]
            voice = HOST_VOICE_EDGE if speaker == "Host" else EXPERT_VOICE_EDGE
            part_path = f"{output_path}.part_{idx}.mp3"
            
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(part_path)
            temp_files.append(part_path)

        # Concatenate audio parts
        with open(output_path, "wb") as outfile:
            for part in temp_files:
                if os.path.exists(part):
                    with open(part, "rb") as infile:
                        outfile.write(infile.read())
                    try:
                        os.remove(part)
                    except OSError:
                        pass
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as exc:
        print(f"[podcast_agent] edge-tts fallback notice: {exc}")
        return False


def _generate_audio_gtts_sync(dialogue: list[dict[str, str]], output_path: str) -> bool:
    """Fallback TTS generator using gTTS with distinct TLD accents for Host vs Expert."""
    try:
        from gtts import gTTS

        temp_files: list[str] = []
        for idx, turn in enumerate(dialogue):
            speaker = turn["speaker"]
            text = turn["text"]
            tld = HOST_GTTS_TLD if speaker == "Host" else EXPERT_GTTS_TLD
            part_path = f"{output_path}.gpart_{idx}.mp3"

            tts = gTTS(text=text, lang="en", tld=tld, slow=False)
            tts.save(part_path)
            temp_files.append(part_path)

        with open(output_path, "wb") as outfile:
            for part in temp_files:
                if os.path.exists(part):
                    with open(part, "rb") as infile:
                        outfile.write(infile.read())
                    try:
                        os.remove(part)
                    except OSError:
                        pass
        return os.path.exists(output_path) and os.path.getsize(output_path) > 0
    except Exception as exc:
        print(f"[podcast_agent] gTTS error: {exc}")
        return False


async def synthesize_podcast_audio(dialogue: list[dict[str, str]], output_path: str) -> bool:
    """Tries edge-tts first for neural voices, falling back to gTTS if edge-tts fails."""
    success = await _generate_audio_edge(dialogue, output_path)
    if not success:
        success = await asyncio.to_thread(_generate_audio_gtts_sync, dialogue, output_path)
    return success


async def generate_podcast(
    session_id: str,
    length: str = "medium",
    source_ids: list[str] | None = None,
) -> dict[str, Any]:
    """
    Main Podcast Agent execution entry point.
    """
    cleanup_old_audio_files()

    length_key = (length or "medium").lower()
    len_cfg = LENGTH_CONFIGS.get(length_key, LENGTH_CONFIGS["medium"])

    await manager.send_agent_status(
        session_id, "podcast", "start", "Reviewing your uploaded source material..."
    )

    # 1. Fetch chunks from vector store
    all_chunks = vector_store.query(session_id, _BROAD_SAMPLE_QUERY, top_k=25)
    
    # Filter by source_ids if provided
    if source_ids and isinstance(source_ids, list) and len(source_ids) > 0:
        filtered_chunks = [c for c in all_chunks if c.get("source_id") in source_ids]
        if filtered_chunks:
            all_chunks = filtered_chunks

    if not all_chunks:
        msg = "No uploaded sources found. Upload a PDF, text file, URL, or paste text to generate a podcast."
        await manager.send_agent_status(session_id, "podcast", "error", msg)
        return {
            "success": False,
            "error": msg,
            "title": "Podcast Generation Failed",
            "dialogue": [],
            "transcript": "",
            "audio_url": None,
            "length": length_key,
        }

    await manager.send_agent_status(
        session_id,
        "podcast",
        "progress",
        f"Scripting {length_key} podcast ({len_cfg['desc']}) with Host & Expert...",
    )

    source_context = "\n\n".join(f"--- Source: '{c['source_name']}' ---\n{c['content']}" for c in all_chunks[:15])

    prompt = (
        "You are the Podcast Agent writing an engaging, natural 2-speaker audio podcast script.\n"
        "STRICT GROUNDING RULE: Base the discussion ONLY on the source material provided below. Do NOT invent facts or add outside information.\n\n"
        f"TARGET LENGTH: {len_cfg['turns']} ({len_cfg['word_count']}).\n\n"
        "SPEAKERS:\n"
        "- [Host]: Energetic, curious, sets up the topic, asks engaging questions, asks for clarification.\n"
        "- [Expert]: Smart, clear, enthusiastic, explains concepts using concrete examples from the text.\n\n"
        "FORMAT REQUIREMENTS:\n"
        "Write dialogue turn-by-turn. Format each turn strictly as:\n"
        "[Host]: line...\n"
        "[Expert]: line...\n\n"
        "Source Material:\n"
        f"{source_context}"
    )

    try:
        raw_script = await llm_client.generate_text(AGENT_NAME, prompt)
    except Exception as exc:
        err_msg = f"Could not generate podcast script with Gemini: {exc}"
        await manager.send_agent_status(session_id, "podcast", "error", err_msg)
        return {
            "success": False,
            "error": err_msg,
            "title": "Podcast Scripting Failed",
            "dialogue": [],
            "transcript": "",
            "audio_url": None,
            "length": length_key,
        }

    dialogue = _parse_dialogue(raw_script)

    await manager.send_agent_status(
        session_id,
        "podcast",
        "progress",
        "Synthesizing natural 2-speaker audio (Ava & Christopher neural voices)...",
    )

    podcast_id = f"podcast_{uuid.uuid4().hex[:12]}"
    audio_filename = f"{podcast_id}.mp3"
    audio_path = os.path.join(AUDIO_DIR, audio_filename)

    audio_success = await synthesize_podcast_audio(dialogue, audio_path)

    # Format clean transcript text
    transcript_markdown = f"# SourceMind Podcast ({length_key.capitalize()})\n\n"
    for turn in dialogue:
        transcript_markdown += f"**{turn['speaker']}**: {turn['text']}\n\n"

    audio_url = f"/api/podcast/audio/{podcast_id}" if audio_success else None

    status_msg = "Podcast audio & transcript ready!" if audio_success else "Podcast script ready (audio synthesis pending)."
    await manager.send_agent_status(session_id, "podcast", "done", status_msg)

    # Extract clean title from first host turn or source name
    title = f"Deep Dive: {all_chunks[0]['source_name']}" if all_chunks else "SourceMind Podcast"

    return {
        "success": True,
        "podcast_id": podcast_id,
        "title": title,
        "length": length_key,
        "dialogue": dialogue,
        "transcript": transcript_markdown.strip(),
        "audio_url": audio_url,
        "audio_ready": audio_success,
    }
