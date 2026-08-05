"""
Thin wrapper around ChromaDB giving each chat session its own persistent
collection. Embeddings are generated via Google Gemini's API (gemini-embedding-001)
so heavy ML libraries (PyTorch/sentence-transformers) are not required —
keeping total memory footprint under ~110 MB RAM (safely within Render Free's 512 MB limit).
"""
from __future__ import annotations

import gc
import os
import threading
import uuid
from typing import Any

from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from app.config import settings
from app.services import llm_client

_client: Any = None
_embedding_function: Any = None
_lock = threading.Lock()


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Generates vector embeddings using Gemini's gemini-embedding-001 model via API."""

    def __call__(self, input: Documents) -> Embeddings:
        if not input:
            return []
        client = llm_client.get_client("source")
        # Batch requests in chunks of 16 to ensure lightweight network payloads
        batch_size = 16
        all_embeddings: list[list[float]] = []
        for i in range(0, len(input), batch_size):
            batch = input[i : i + batch_size]
            res = client.models.embed_content(
                model="gemini-embedding-001",
                contents=batch,
            )
            for emb in res.embeddings:
                all_embeddings.append(emb.values)
        return all_embeddings


def _get_client() -> Any:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                import chromadb
                _client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return _client


def _get_embedding_function() -> Any:
    global _embedding_function
    if _embedding_function is None:
        with _lock:
            if _embedding_function is None:
                _embedding_function = GeminiEmbeddingFunction()
    return _embedding_function


def _collection_name(session_id: str) -> str:
    return f"session_{session_id}"


def get_collection(session_id: str):
    client = _get_client()
    ef = _get_embedding_function()
    return client.get_or_create_collection(
        name=_collection_name(session_id),
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(session_id: str, source_id: str, source_name: str, chunks: list[str]) -> int:
    """Embeds and stores chunks for a source in small batches to keep memory minimal. Returns number of chunks stored."""
    if not chunks:
        return 0

    collection = get_collection(session_id)
    ids = [f"{source_id}_{i}_{uuid.uuid4().hex[:6]}" for i in range(len(chunks))]
    metadatas = [{"source_id": source_id, "source_name": source_name, "chunk_index": i} for i in range(len(chunks))]

    batch_size = 16
    for start_idx in range(0, len(chunks), batch_size):
        end_idx = start_idx + batch_size
        collection.add(
            documents=chunks[start_idx:end_idx],
            ids=ids[start_idx:end_idx],
            metadatas=metadatas[start_idx:end_idx],
        )

    gc.collect()
    return len(chunks)


def delete_source(session_id: str, source_id: str) -> None:
    """Removes all embedded chunks belonging to one source from this
    session's collection (used by document management's Delete action)."""
    collection = get_collection(session_id)
    try:
        collection.delete(where={"source_id": source_id})
    except Exception:
        pass
    gc.collect()


def collection_chunk_count(session_id: str) -> int:
    collection = get_collection(session_id)
    return collection.count()


def query(session_id: str, query_text: str, top_k: int | None = None) -> list[dict[str, Any]]:
    """
    Returns a list of {content, source_name, distance} sorted by relevance
    (lowest cosine distance first). Returns [] if the session has no
    sources yet or the collection is empty.
    """
    collection = get_collection(session_id)
    if collection.count() == 0:
        return []

    n_results = min(top_k or settings.RETRIEVAL_TOP_K, collection.count())
    results = collection.query(query_texts=[query_text], n_results=n_results)

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    gc.collect()

    return [
        {
            "content": doc,
            "source_name": meta.get("source_name", "Unknown source"),
            "distance": dist,
        }
        for doc, meta, dist in zip(documents, metadatas, distances)
    ]

