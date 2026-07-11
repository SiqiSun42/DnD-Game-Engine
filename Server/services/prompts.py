import json

from config import PROMPT_ROOT

USER_PROMPT_PATCH_FILE = "游戏进程/降智提醒.md"
CONSULT_PROMPT_FILE = "咨询城主/system.md"
GAME_PROMPT_FILE = "游戏进程/游戏进程.md"
ROLL_JUDGE_PROMPT_FILE = "游戏进程/掷骰判断.md"
CHECK_TEST_NON_APPRAISAL_PROMPT_FILE = "游戏进程/非鉴定测试.md"
BATTLE_TRIGGER_PROMPT_FILE = "游戏进程/战斗/1.触发战斗.md"
BATTLE_COUNT_PROMPT_FILE = "游戏进程/战斗/2.参战人数.md"
BATTLE_INITIATIVE_PROMPT_FILE = "游戏进程/战斗/3.先攻顺序.md"
BATTLE_ROUND_0_PROMPT_FILE = "游戏进程/战斗/4.第0回合.md"
BATTLE_ROUND_NORMAL_PROMPT_FILE = "游戏进程/战斗/5.战斗回合.md"
BATTLE_END_PROMPT_FILE = "游戏进程/战斗/6.战斗结束.md"
BATTLE_NO_TRIGGER_PROMPT_FILE = "游戏进程/战斗/7.未触发战斗.md"
GAME_PROMPT_FILE_KEY = "promptFile"


def resolve_game_prompt_file(context: dict | None) -> str | None:
    if not context:
        return None
    prompt_file = context.get(GAME_PROMPT_FILE_KEY)
    if isinstance(prompt_file, str) and prompt_file.strip():
        return prompt_file.strip()
    settings = context.get("settingsGame")
    if isinstance(settings, dict):
        prompt_file = settings.get(GAME_PROMPT_FILE_KEY)
        if isinstance(prompt_file, str) and prompt_file.strip():
            return prompt_file.strip()
    return None


def load_roll_judge_prompt() -> str:
    prompt = load_prompt(ROLL_JUDGE_PROMPT_FILE)
    if prompt:
        return prompt
    return (
        "判断本轮是否需要掷骰。不需要时只输出 {False}；"
        "需要时每个骰子一行输出 {True, 面数}。不要输出其他内容。"
    )


def load_check_test_generation_prompt(context: dict | None, needs_roll: bool) -> str:
    if needs_roll:
        return load_game_base_prompt(context)
    prompt = load_prompt(CHECK_TEST_NON_APPRAISAL_PROMPT_FILE)
    if prompt:
        return prompt
    return (
        "你是叙事生成器。本轮不需要鉴定，不要输出【鉴定类型】等鉴定格式，"
        "不要自行生成或引用任何骰子数字，只根据对话推进叙述。"
    )


def load_game_base_prompt(context: dict | None = None) -> str:
    dedicated = resolve_game_prompt_file(context)
    if dedicated:
        return load_prompt(dedicated)
    return load_prompt(GAME_PROMPT_FILE)


def _load_battle_prompt(path: str, fallback: str) -> str:
    prompt = load_prompt(path)
    return prompt if prompt else fallback


def load_battle_trigger_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_TRIGGER_PROMPT_FILE,
        "判断是否触发战斗。只输出 {True} 或 {False}。",
    )


def load_battle_count_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_COUNT_PROMPT_FILE,
        "统计参战人数。只输出一个正整数。",
    )


def load_initiative_order_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_INITIATIVE_PROMPT_FILE,
        "根据系统提供的骰子与对话，生成先攻顺序。",
    )


def load_battle_round_0_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_ROUND_0_PROMPT_FILE,
        "生成第0回合：玩家顺位之前的 NPC 行动，末尾提示玩家要做什么。",
    )


def load_battle_round_normal_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_ROUND_NORMAL_PROMPT_FILE,
        "处理玩家回合到下一个玩家顺位前的所有战斗行动，末尾提示玩家要做什么。",
    )


def load_battle_end_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_END_PROMPT_FILE,
        "判断战斗是否结束。只输出 {True} 或 {False}。",
    )


def load_no_trigger_prompt() -> str:
    return _load_battle_prompt(
        BATTLE_NO_TRIGGER_PROMPT_FILE,
        "未触发战斗。先输出一句「未触发战斗」，再正常推进叙述。",
    )


def load_prompt(relative_path: str) -> str:
    path = PROMPT_ROOT / relative_path
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def load_user_prompt_patch() -> str:
    return load_prompt(USER_PROMPT_PATCH_FILE)


def append_rag_context(base_prompt: str, rag_context: str, section_title: str = "相关规则摘录") -> str:
    if not rag_context.strip():
        return base_prompt
    return f"{base_prompt.rstrip()}\n\n## {section_title}\n\n{rag_context.strip()}"


def append_rag_miss_notice(base_prompt: str) -> str:
    notice = (
        "## 本次检索状态\n\n"
        "规则书中未检索到与当前问题直接相关的摘录。"
    )
    return f"{base_prompt.rstrip()}\n\n{notice}"


def build_consult_system_prompt(base_prompt: str, rag_context: str, rag_hit: bool) -> str:
    if rag_hit and rag_context.strip():
        return append_rag_context(base_prompt, rag_context)
    return append_rag_miss_notice(base_prompt)


def format_game_context(context: dict | None) -> str:
    if not context:
        return "（未提供游戏状态，请仅依据对话历史推进，勿擅自假设具体数值。）"
    return f"```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"


def append_quest_sync_reminder(prompt: str, game_context: dict | None) -> str:
    if not game_context:
        return prompt
    quests = game_context.get("currentQuests") or []
    if not isinstance(quests, list) or not quests:
        return prompt
    quest_text = json.dumps(quests, ensure_ascii=False)
    notice = (
        "## 任务栏更新提醒\n\n"
        f"当前 `currentQuests` = {quest_text}\n\n"
        "本轮输出前必须对照 devPlotTree 检查：玩家刚才的行动是否完成了其中某项？\n"
        "- 若已完成某项 → 在 `[QUEST_SYNC]` 中为该条加上 `（已完成）`\n"
        "- 若 devPlotTree 标明阶段切换条件已满足 → 按节点规则更新 `[QUEST_SYNC]`\n"
        "- **思考里意识到完成但不同步到 `[QUEST_SYNC]` = 错误**"
    )
    return f"{prompt.rstrip()}\n\n{notice}"


def append_combat_state_reminder(prompt: str, game_context: dict | None) -> str:
    if not game_context or not game_context.get("inCombat"):
        return prompt
    notice = (
        "## 战斗状态提醒\n\n"
        f"当前 `inCombat` 为 **true**，`participants` = {game_context.get('participants', -1)}，"
        f"`combatRound` = {game_context.get('status', {}).get('combatRound', 1)}。\n"
        "- 使用系统提供的战斗骰数据，禁止自行随机\n"
        "- 每轮骰子均为新生成，主动作使用本次第一组\n"
        "- 战斗结束后必须在 `[STATUS_SYNC]` 中将 `inCombat` 设为 false、`participants` 设为 -1"
    )
    return f"{prompt.rstrip()}\n\n{notice}"


def append_roll_judge_block(prompt: str, judge_display: str) -> str:
    if not judge_display.strip():
        return prompt
    block = (
        "## 本轮掷骰判断（系统）\n\n"
        f"判断轮输出：{judge_display.strip()}"
    )
    return f"{prompt.rstrip()}\n\n{block}"


def build_game_system_prompt(
    base_prompt: str,
    rag_context: str,
    game_context: dict | None = None,
    dice_results_block: str | None = None,
    roll_judge_block: str | None = None,
    *,
    channel: str = "game",
    last_user: str = "",
    panels: list[str] | None = None,
) -> str:
    from services.game_panels import format_game_panels_block

    prompt = base_prompt or (
        "Reply in the same language as the player."
    )
    state_block = format_game_panels_block(
        game_context,
        channel=channel,
        last_user=last_user,
        panels=panels,
    )
    prompt = f"{prompt.rstrip()}\n\n## 当前游戏状态\n\n{state_block}"
    prompt = append_quest_sync_reminder(prompt, game_context)
    prompt = append_combat_state_reminder(prompt, game_context)
    prompt = append_rag_context(prompt, rag_context)
    if roll_judge_block and roll_judge_block.strip():
        prompt = append_roll_judge_block(prompt, roll_judge_block)
    if dice_results_block and dice_results_block.strip():
        prompt = f"{prompt.rstrip()}\n\n{dice_results_block.strip()}"
    return prompt

