import json
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parent
RAG_CONFIG_DIR = RAG_ROOT / "config"
RAG_DATA_DIR = RAG_ROOT / "data"
RAG_CHUNKS_DIR = RAG_DATA_DIR / "chunks"
RAG_CHROMA_DIR = RAG_DATA_DIR / "chroma"
RAG_META_DIR = RAG_DATA_DIR / "knowledge_bases"

MANIFEST_PATH = RAG_CONFIG_DIR / "manifest.json"
RULES_KB_PATH = RAG_CONFIG_DIR / "rules_kb.json"
RULES_CHUNKS_PATH = RAG_CHUNKS_DIR / "rules.jsonl"
RULES_META_PATH = RAG_META_DIR / "rules_books_meta.json"


def load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_manifest() -> dict:
    return load_json(MANIFEST_PATH)


def load_rules_kb_config() -> dict:
    defaults = {
        "chunk_size": 700,
        "chunk_overlap": 120,
        "top_k": 5,
        "min_score": 0.25,
        "embedding_model": "BAAI/bge-small-zh-v1.5",
        "collection_name": "dnd_rules",
        "batch_size": 64,
    }
    loaded = load_json(RULES_KB_PATH)
    return {**defaults, **loaded}
