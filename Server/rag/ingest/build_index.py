import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import chromadb

from rag.core.embedder import FastEmbedEmbeddingFunction
from rag.ingest.chunker import chunk_book
from rag.ingest.pdf_extract import extract_pages
from rag.settings import (
    RAG_CHROMA_DIR,
    RAG_CHUNKS_DIR,
    RAG_META_DIR,
    RULES_CHUNKS_PATH,
    RULES_META_PATH,
    load_manifest,
    load_rules_kb_config,
    save_json,
)


def _write_chunks_jsonl(chunks: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for chunk in chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")


def _load_chunks_from_jsonl(path: Path) -> list[dict]:
    chunks = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                chunks.append(json.loads(line))
    return chunks


def build_chunks_from_manifest() -> list[dict]:
    manifest = load_manifest()
    config = load_rules_kb_config()
    chunk_size = int(config.get("chunk_size", 700))
    chunk_overlap = int(config.get("chunk_overlap", 120))

    all_chunks: list[dict] = []
    books_meta = []

    for book in manifest.get("books", []):
        book_id = book["id"]
        book_title = book["title"]
        pdf_path = book["path"]
        started = time.time()
        print(f"[ingest] extracting {book_title} ...")
        pages = extract_pages(pdf_path)
        print(f"[ingest] {book_title}: {len(pages)} pages with text")

        chunks = chunk_book(
            book_id=book_id,
            book_title=book_title,
            pages=pages,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        all_chunks.extend(chunks)
        elapsed = time.time() - started
        books_meta.append({
            "id": book_id,
            "title": book_title,
            "path": pdf_path,
            "priority": book.get("priority", 99),
            "page_count": len(pages),
            "chunk_count": len(chunks),
            "elapsed_seconds": round(elapsed, 2),
        })
        print(f"[ingest] {book_title}: {len(chunks)} chunks")

    _write_chunks_jsonl(all_chunks, RULES_CHUNKS_PATH)
    save_json(RULES_META_PATH, {
        "corpus": "rules",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "chunk_count": len(all_chunks),
        "books": books_meta,
    })
    return all_chunks


def build_vector_index(chunks: list[dict]) -> None:
    config = load_rules_kb_config()
    collection_name = config.get("collection_name", "dnd_rules")
    batch_size = int(config.get("batch_size", 64))

    if RAG_CHROMA_DIR.exists():
        shutil.rmtree(RAG_CHROMA_DIR)
    RAG_CHROMA_DIR.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(RAG_CHROMA_DIR))
    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=FastEmbedEmbeddingFunction(),
    )

    total = len(chunks)
    print(f"[index] embedding {total} chunks ...")

    for start in range(0, total, batch_size):
        batch = chunks[start:start + batch_size]
        collection.add(
            ids=[item["id"] for item in batch],
            documents=[item["text"] for item in batch],
            metadatas=[{
                "book_id": item["book_id"],
                "book_title": item["book_title"],
                "page_start": int(item["page_start"]),
                "page_end": int(item["page_end"]),
            } for item in batch],
        )
        done = min(start + batch_size, total)
        print(f"[index] {done}/{total}")

    print(f"[index] collection size: {collection.count()}")


def main(rebuild_chunks: bool = True) -> None:
    RAG_CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
    RAG_META_DIR.mkdir(parents=True, exist_ok=True)

    started = time.time()
    if rebuild_chunks or not RULES_CHUNKS_PATH.is_file():
        chunks = build_chunks_from_manifest()
    else:
        print("[ingest] loading existing chunks.jsonl")
        chunks = _load_chunks_from_jsonl(RULES_CHUNKS_PATH)

    build_vector_index(chunks)
    elapsed = time.time() - started
    print(f"[done] rules index built in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
