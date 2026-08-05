"""
Thin wrapper around ChromaDB giving each chat session its own persistent
collection. Embeddings are generated locally with a lightweight
sentence-transformers model (all-MiniLM-L6-v2) so no external embedding
API/key is required — only Gemini (used for the final chat generation)
needs an API key.
"""
from __future__ import annotations

import gc
import os
import threading
import uuid
from typing import Any

from app.config import settings

_client: Any = None
_embedding_function: Any = None
_lock = threading.Lock()


def _set_low_memory_env() -> None:
    """Sets CPU thread limits to minimize PyTorch/OpenMP memory usage on low-memory instances."""
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
    try:
        import torch
        torch.set_num_threads(1)
        if hasattr(torch, "set_num_interop_threads"):
            try:
                torch.set_num_interop_threads(1)
            except Exception:
                pass
    except Exception:
        pass


def _get_client() -> Any:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _set_low_memory_env()
                import chromadb
                _client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return _client


def _get_embedding_function() -> Any:
    global _embedding_function
    if _embedding_function is None:
        with _lock:
            if _embedding_function is None:
                _set_low_memory_env()
                from chromadb.utils import embedding_functions
                _embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name="all-MiniLM-L6-v2"
                )
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
    """Embeds and stores chunks for a source in small batches to keep memory under 512 MB. Returns number of chunks stored."""
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
        # Nothing to delete, or the collection doesn't support the filter -
        # safe to ignore, the source metadata is removed regardless.
        pass


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

    return [
        {
            "content": doc,
            "source_name": meta.get("source_name", "Unknown source"),
            "distance": dist,
        }
        for doc, meta, dist in zip(documents, metadatas, distances)
    ]
