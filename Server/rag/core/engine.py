from rag.core.formatter import format_segments
from rag.core.retriever import retrieve_rules


async def query_knowledge(
    query_text: str,
    knowledge_base: str = "rules",
    top_k: int | None = None,
) -> dict:
    if knowledge_base != "rules":
        return {"retrieved": False, "context_text": "", "segments": []}

    segments = retrieve_rules(query_text)
    if top_k is not None and top_k > 0:
        segments = segments[:top_k]

    context_text = format_segments(segments)
    return {
        "retrieved": bool(segments),
        "context_text": context_text,
        "segments": segments,
    }
