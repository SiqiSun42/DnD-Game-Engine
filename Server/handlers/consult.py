from handlers.passthrough import to_llm_messages
from rag.core.engine import query_knowledge
from rag.policies import CHANNEL_CONSULT, get_rag_policy
from rag.triggers import should_retrieve
from services.deepseek import deepseek_client
from services.prompts import build_consult_system_prompt, load_prompt

CONSULT_PROMPT_FILE = "咨询城主/system.md"


def extract_last_user_message(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") in ("player", "user"):
            return str(message.get("content") or message.get("text") or "")
    return ""


async def handle_consult(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)

    base_prompt = load_prompt(CONSULT_PROMPT_FILE)
    if not base_prompt:
        base_prompt = (
            "You are the Dungeon Master assistant for D&D rule questions. "
            "Answer clearly in Chinese unless the user uses another language."
        )

    rag_context = ""
    rag_hit = False
    policy = get_rag_policy(CHANNEL_CONSULT)
    if policy and last_user.strip() and should_retrieve(policy, last_user, context):
        result = await query_knowledge(query_text=last_user, knowledge_base="rules")
        rag_context = result.get("context_text") or ""
        rag_hit = bool(result.get("retrieved"))

    system_prompt = build_consult_system_prompt(base_prompt, rag_context, rag_hit)
    text = await deepseek_client.chat(llm_messages, system=system_prompt)
    return {"text": text, "role": "dm", "label": "DM"}
