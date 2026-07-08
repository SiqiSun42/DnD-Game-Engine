from config import DEEPSEEK_USER_PROMPT_PATCH
from handlers.consult import extract_last_user_message
from handlers.passthrough import to_llm_messages
from rag.service import retrieve_context
from services.deepseek import deepseek_client
from services.prompts import build_game_system_prompt, load_game_base_prompt, load_user_prompt_patch


async def handle_game(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)
    rag_context = await retrieve_context("game", last_user, context)
    base_prompt = load_game_base_prompt(context)
    system_prompt = build_game_system_prompt(base_prompt, rag_context, context)
    user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH else None
    result = await deepseek_client.chat(
        llm_messages,
        system=system_prompt,
        user_patch=user_patch,
    )
    return deepseek_client.to_handler_response(result)
