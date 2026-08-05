"""
Thin wrapper around ChromaDB giving each chat session its own persistent
collection. Embeddings are generated locally with a lightweight
sentence-transformers model (all-MiniLM-L6-v2) so no external embedding
API/key is required — only Gemini (used for the final chat generation)
needs an API key.
"""
from __future__ import annotations

import uuid
from typing import Any

import chromadb
from chromadb.utils import embedding_functions

from app.config import settings

_embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)


def _collection_name(session_id: str) -> str:
    return f"session_{session_id}"


def get_collection(session_id: str):
    return _client.get_or_create_collection(
        name=_collection_name(session_id),
        embedding_function=_embedding_function,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(session_id: str, source_id: str, source_name: str, chunks: list[str]) -> int:
    """Embeds and stores chunks for a source. Returns number of chunks stored."""
    if not chunks:
        return 0

    collection = get_collection(session_id)
    ids = [f"{source_id}_{i}_{uuid.uuid4().hex[:6]}" for i in range(len(chunks))]
    metadatas = [{"source_id": source_id, "source_name": source_name, "chunk_index": i} for i in range(len(chunks))]

    collection.add(documents=chunks, ids=ids, metadatas=metadatas)
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
