from handlers.passthrough import to_llm_messages
from handlers.consult import extract_last_user_message
from rag.service import retrieve_context
from services.deepseek import deepseek_client
from services.prompts import append_rag_context, load_prompt

GAME_PROMPT_FILE = "游戏过程/system.md"


def build_game_system_prompt(rag_context: str) -> str:
    base = load_prompt(GAME_PROMPT_FILE)
    if not base:
        base = "You are the Dungeon Master. Reply in the same language as the player."
    return append_rag_context(base, rag_context)


async def handle_game(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)
    rag_context = await retrieve_context("game", last_user, context)
    system_prompt = build_game_system_prompt(rag_context)
    text = await deepseek_client.chat(llm_messages, system=system_prompt)
    return {"text": text, "role": "dm", "label": "DM"}
