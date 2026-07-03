from rag.policies import get_rag_policy
from rag.triggers import should_retrieve


async def retrieve_from_corpus(corpus: str, query: str) -> str:
    if corpus == "rules":
        return await _retrieve_rules(query)
    return ""


async def _retrieve_rules(query: str) -> str:
    return ""


async def retrieve_context(channel: str, query: str, context: dict | None = None) -> str:
    policy = get_rag_policy(channel)
    if not policy or not query.strip():
        return ""
    if not should_retrieve(policy, query, context):
        return ""
    return await retrieve_from_corpus(policy.corpus, query)
