from pathlib import Path

import chromadb

from rag.core.embedder import FastEmbedEmbeddingFunction
from rag.settings import RAG_CHROMA_DIR, load_rules_kb_config

_collection = None


def _distance_to_score(distance: float | None) -> float:
    if distance is None:
        return 0.0
    return max(0.0, 1.0 - float(distance))


def get_collection():
    global _collection
    if _collection is not None:
        return _collection

    config = load_rules_kb_config()
    collection_name = config.get("collection_name", "dnd_rules")
    chroma_path = Path(RAG_CHROMA_DIR)
    if not chroma_path.is_dir():
        return None

    client = chromadb.PersistentClient(path=str(chroma_path))
    _collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=FastEmbedEmbeddingFunction(),
    )
    return _collection


def retrieve_rules(query: str) -> list[dict]:
    query = (query or "").strip()
    if not query:
        return []

    collection = get_collection()
    if collection is None or collection.count() == 0:
        return []

    config = load_rules_kb_config()
    top_k = int(config.get("top_k", 5))
    min_score = float(config.get("min_score", 0.25))

    result = collection.query(
        query_texts=[query],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    segments: list[dict] = []
    for doc, meta, distance in zip(documents, metadatas, distances):
        score = _distance_to_score(distance)
        if score < min_score:
            continue
        segment = {
            "text": doc,
            "book_id": (meta or {}).get("book_id", ""),
            "book_title": (meta or {}).get("book_title", ""),
            "page_start": int((meta or {}).get("page_start", 0) or 0),
            "page_end": int((meta or {}).get("page_end", 0) or 0),
            "score": score,
        }
        segments.append(segment)

    segments.sort(
        key=lambda item: (
            item.get("score", 0),
            -int(item.get("page_start", 0) or 0),
        ),
        reverse=True,
    )
    return segments
