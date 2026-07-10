from config import DEEPSEEK_USER_PROMPT_PATCH
from handlers.consult import extract_last_user_message
from handlers.passthrough import to_llm_messages
from rag.policies import CHANNEL_CHECK_TEST
from rag.service import retrieve_context
from services.deepseek import deepseek_client
from services.dice import (
    execute_rolls,
    format_dice_results_block,
    format_roll_judge_display,
    parse_roll_judge_response,
)
from services.prompts import (
    build_game_system_prompt,
    load_check_test_generation_prompt,
    load_roll_judge_prompt,
    load_user_prompt_patch,
)


JUDGE_OUTPUT_REMINDER = (
    "【系统】请根据以上对话判断：玩家最新一条行动本轮是否需要掷骰。"
    "只输出 {False} 或 {True, 面数}，禁止任何其它文字。"
)


def _build_judge_messages(llm_messages: list[dict[str, str]]) -> list[dict[str, str]]:
    if not llm_messages:
        return []
    return [*llm_messages, {"role": "user", "content": JUDGE_OUTPUT_REMINDER}]


async def handle_check_test(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)

    judge_prompt = load_roll_judge_prompt()
    judge_messages = _build_judge_messages(llm_messages)
    judge_result = await deepseek_client.chat(
        judge_messages,
        system=judge_prompt,
        thinking=False,
        temperature=0,
        attach_user_patch=False,
    )

    roll_specs = parse_roll_judge_response(judge_result.content)
    judge_display = format_roll_judge_display(roll_specs, judge_result.content)
    needs_roll = bool(roll_specs)
    dice_results_block = None
    if needs_roll:
        dice_results = execute_rolls(roll_specs)
        dice_results_block = format_dice_results_block(dice_results)

    rag_context = await retrieve_context(CHANNEL_CHECK_TEST, last_user, context)
    base_prompt = load_check_test_generation_prompt(context, needs_roll)
    system_prompt = build_game_system_prompt(
        base_prompt,
        rag_context,
        context,
        dice_results_block=dice_results_block,
        roll_judge_block=judge_display,
    )
    user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH else None
    result = await deepseek_client.chat(
        llm_messages,
        system=system_prompt,
        user_patch=user_patch,
    )
    response = deepseek_client.to_handler_response(result)
    response["judgeResult"] = judge_display
    return response
