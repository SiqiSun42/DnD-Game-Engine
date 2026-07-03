from handlers.passthrough import to_llm_messages
from rag.service import retrieve_context
from services.deepseek import deepseek_client
from services.prompts import append_rag_context, load_prompt

CONSULT_PROMPT_FILE = "咨询城主/system.md"


def extract_last_user_message(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") in ("player", "user"):
            return str(message.get("content") or message.get("text") or "")
    return ""


def build_consult_system_prompt(rag_context: str) -> str:
    base = load_prompt(CONSULT_PROMPT_FILE)
    if not base:
        base = (
            "You are the Dungeon Master assistant for D&D rule questions. "
            "Answer clearly in Chinese unless the user uses another language."
        )
    return append_rag_context(base, rag_context)


async def handle_consult(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)
    rag_context = await retrieve_context("consult", last_user, context)
    system_prompt = build_consult_system_prompt(rag_context)
    text = await deepseek_client.chat(llm_messages, system=system_prompt)
    return {"text": text, "role": "dm", "label": "DM"}
