import json

from config import PROMPT_ROOT

USER_PROMPT_PATCH_FILE = "游戏进程/降智提醒.md"
CONSULT_PROMPT_FILE = "咨询城主/system.md"
GAME_PROMPT_FILE = "游戏进程/游戏进程.md"
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


def load_game_base_prompt(context: dict | None = None) -> str:
    dedicated = resolve_game_prompt_file(context)
    if dedicated:
        return load_prompt(dedicated)
    return load_prompt(GAME_PROMPT_FILE)


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
        "当前 `inCombat` 为 **true**，玩家尚未宣告战斗结果。\n"
        "- 不要推进战后剧情或结束战斗\n"
        "- 将玩家输入优先理解为：胜利 / 失败 / 逃跑\n"
        "- 战斗结束后必须在 `[STATUS_SYNC]` 中将 `inCombat` 设为 false"
    )
    return f"{prompt.rstrip()}\n\n{notice}"


def build_game_system_prompt(
    base_prompt: str,
    rag_context: str,
    game_context: dict | None = None,
    dice_results_block: str | None = None,
) -> str:
    prompt = base_prompt or (
        "You are the Dungeon Master. Reply in the same language as the player."
    )
    state_block = format_game_context(game_context)
    prompt = f"{prompt.rstrip()}\n\n## 当前游戏状态\n\n{state_block}"
    prompt = append_quest_sync_reminder(prompt, game_context)
    prompt = append_combat_state_reminder(prompt, game_context)
    prompt = append_rag_context(prompt, rag_context)
    if dice_results_block and dice_results_block.strip():
        prompt = f"{prompt.rstrip()}\n\n{dice_results_block.strip()}"
    return prompt

