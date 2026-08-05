"""
Source Agent
------------
Responsible for accepting raw input (PDF bytes, plain text, or a URL),
extracting/cleaning the text, splitting it into chunks, and embedding
those chunks into the session's vector store. This is the first stage
of the pipeline: its output (stored, searchable chunks) becomes the
input the Research and Chat agents draw on later.

Every step emits a real-time status event over the session's WebSocket
so the frontend workflow panel can show exactly what's happening.
"""
from __future__ import annotations

import uuid

from app.models.schemas import SourceInfo
from app.services import session_store, vector_store
from app.services.pdf_processor import chunk_text, extract_text_from_pdf
from app.services.url_processor import UrlFetchError, fetch_url_text
from app.websocket_manager import manager


class SourceProcessingError(Exception):
    pass


async def _finalize(session_id: str, source_type: str, name: str, raw_text: str) -> SourceInfo:
    if not raw_text.strip():
        raise SourceProcessingError(f"No text could be extracted from '{name}'.")

    await manager.send_agent_status(
        session_id, "source", "progress", f"Splitting '{name}' into searchable chunks..."
    )
    chunks = chunk_text(raw_text)

    if not chunks:
        raise SourceProcessingError(f"No usable content found in '{name}' after processing.")

    source_id = uuid.uuid4().hex[:12]

    await manager.send_agent_status(
        session_id, "source", "progress", f"Embedding {len(chunks)} chunks from '{name}' into memory..."
    )
    stored = vector_store.add_chunks(session_id, source_id, name, chunks)

    info = SourceInfo(
        id=source_id,
        name=name,
        type=source_type,  # type: ignore[arg-type]
        chunk_count=stored,
        char_count=len(raw_text),
        preview=raw_text.strip()[:280],
    )
    session_store.session_store.add_source(session_id, info.model_dump())

    await manager.send_agent_status(
        session_id,
        "source",
        "done",
        f"'{name}' is ready ({stored} chunks, {len(raw_text):,} characters).",
    )
    return info


async def process_pdf(session_id: str, filename: str, file_bytes: bytes) -> SourceInfo:
    await manager.send_agent_status(session_id, "source", "start", f"Reading PDF '{filename}'...")
    try:
        text = extract_text_from_pdf(file_bytes)
    except Exception as exc:
        await manager.send_agent_status(session_id, "source", "error", f"Failed to read PDF: {exc}")
        raise SourceProcessingError(str(exc)) from exc
    return await _finalize(session_id, "pdf", filename, text)


async def process_text_file(session_id: str, filename: str, file_bytes: bytes) -> SourceInfo:
    await manager.send_agent_status(session_id, "source", "start", f"Reading text file '{filename}'...")
    try:
        text = file_bytes.decode("utf-8", errors="ignore")
    except Exception as exc:
        await manager.send_agent_status(session_id, "source", "error", f"Failed to read file: {exc}")
        raise SourceProcessingError(str(exc)) from exc
    return await _finalize(session_id, "text_file", filename, text)


async def process_url(session_id: str, url: str) -> SourceInfo:
    await manager.send_agent_status(session_id, "source", "start", f"Fetching {url}...")
    try:
        title, text = fetch_url_text(url)
    except UrlFetchError as exc:
        await manager.send_agent_status(session_id, "source", "error", str(exc))
        raise SourceProcessingError(str(exc)) from exc
    return await _finalize(session_id, "url", title or url, text)


async def process_plain_text(session_id: str, title: str, text: str) -> SourceInfo:
    await manager.send_agent_status(session_id, "source", "start", f"Processing pasted text '{title}'...")
    return await _finalize(session_id, "plain_text", title, text)
