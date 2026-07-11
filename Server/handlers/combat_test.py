import json
import re

from config import DEEPSEEK_USER_PROMPT_PATCH
from handlers.consult import extract_last_user_message
from handlers.passthrough import to_llm_messages
from rag.policies import CHANNEL_COMBAT_TEST
from rag.service import retrieve_context
from services.deepseek import ChatCompletionResult, deepseek_client
from services.dice_combat import format_combat_dice_block
from services.prompts import (
    build_game_system_prompt,
    load_battle_count_prompt,
    load_battle_end_prompt,
    load_battle_round_0_prompt,
    load_battle_round_normal_prompt,
    load_battle_trigger_prompt,
    load_initiative_order_prompt,
    load_no_trigger_prompt,
    load_user_prompt_patch,
)

# 临时调试阶段：trigger → count → initiative → round0 → full
# full = 全流程（战前 + 战斗回合 + 自动战斗结束判定）；未触发战斗走触发分支的 no_trigger
COMBAT_DEBUG_STAGE = "full"


TRIGGER_OUTPUT_REMINDER = (
    "【系统】请根据以上对话判断：玩家最新行动是否会触发战斗。"
    "只输出 {True} 或 {False}，禁止任何其它文字。"
)
COUNT_OUTPUT_REMINDER = (
    "【系统】请确定本场战斗的参战人员。"
    "只输出 [STATUS_SYNC] 更新所有相关角色的 fighting 字段，禁止任何其它文字。"
)
END_FOLLOWUP_REMINDER = (
    "【系统】根据刚才的回合结果判断：若战斗已结束，描写结局并在末尾输出 "
    "[STATUS_SYNC]（inCombat: false, participants: -1, combatRound: -1, "
    "所有参战角色 initiative: -1, combatOrder: -1, fighting: false）。"
    "若战斗尚未结束，只输出 {Continue}，不要输出其它内容。"
    "友方全灭须所有参战队友 HP 均≤0；仅玩家一人阵亡不算友方全灭。"
)

BOOL_TRUE = re.compile(r"\{True\b", re.IGNORECASE)
BOOL_FALSE = re.compile(r"\{False\b", re.IGNORECASE)
CONTINUE_TOKEN = re.compile(r"\{Continue\b", re.IGNORECASE)
INT_PATTERN = re.compile(r"\b(\d+)\b")
STATUS_SYNC_PATTERN = re.compile(
    r"\[STATUS_SYNC\]\s*([\s\S]*?)\s*\[/STATUS_SYNC\]",
    re.IGNORECASE,
)
INVENTORY_SYNC_PATTERN = re.compile(
    r"\[INVENTORY_SYNC\]\s*([\s\S]*?)\s*\[/INVENTORY_SYNC\]",
    re.IGNORECASE,
)
QUEST_SYNC_PATTERN = re.compile(
    r"\[QUEST_SYNC\]\s*([\s\S]*?)\s*\[/QUEST_SYNC\]",
    re.IGNORECASE,
)

COMBAT_THINKING_REMINDER = (
    "【系统·思考模式】API 会将推理与正文分开：reasoning=思考过程，content=玩家可见正文。"
    "思考里计划要写的内容，必须完整抄进正文。"
    "[STATUS_SYNC] 若在思考里计划但未写入正文，面板不会更新；"
    "系统会从正文与思考中提取同步块，但思考里仅有「打算写」而不含完整 JSON 块则无效。"
)
ROUND_START_LEADING_PATTERN = re.compile(r"^\s*——第\d+回合开始——\s*")
ROUND_0_OUTPUT_REMINDER = (
    "【系统】第0回合叙述完成后，必须在回复正文最末尾输出 [STATUS_SYNC]，"
    "将所有 HP/conditions 变化写入面板（必须含 id 与 hitPoints.current）。"
    "面板只认 [STATUS_SYNC]；叙述里的「凯文 HP：8 → 4」等文字仅供玩家阅读，不会写入面板。"
    "必须写 literally `[STATUS_SYNC]` 与 `[/STATUS_SYNC]`，禁止用 markdown 标题（如 # STATUS_SYNC）或纯文本 STATUS_SYNC。"
    "禁止把 [STATUS_SYNC] 只写在思考过程中。"
    "思考过程仅供推理；玩家可见的完整叙述必须写在回复正文，正文不得为空。"
)
ROUND_NORMAL_OUTPUT_REMINDER = (
    "【系统】战斗回合叙述完成后，必须在回复正文最末尾输出 [STATUS_SYNC]，"
    "将所有 HP/conditions 变化写入面板（必须含 id 与 hitPoints.current）。"
    "面板只认 [STATUS_SYNC]；叙述里的 HP 箭头仅供玩家阅读，不会写入面板。"
    "必须写 literally `[STATUS_SYNC]` 与 `[/STATUS_SYNC]`，禁止用 markdown 标题（如 # STATUS_SYNC）或纯文本 STATUS_SYNC。"
    "禁止把 [STATUS_SYNC] 只写在思考过程中。"
    "思考过程仅供推理；玩家可见的完整叙述必须写在回复正文，正文不得为空。"
)
COMBAT_DOWN_REMINDER = (
    "【系统·倒地规则·调试】HP≤0 视为倒地，禁止死亡豁免检定。"
    "倒地角色可说话指挥队友，但不能攻击/移动/施法；"
    "使用治疗道具或法术回血后，HP>0 才可行动。"
    "玩家 HP≤0 时，其输入视为语言指挥，不是「尝试行动」，不要提示「第二次尝试」。"
)
COMBAT_DICE_FRESH_REMINDER = (
    "【骰子·本轮新生成】以下骰子由系统在本轮玩家输入后重新掷出，"
    "与对话历史中的旧骰子完全无关。"
    "主动作、攻击检定、NPC 自动化一律使用本次「第一组」；"
    "「第二组」仅在本轮确有附赠动作/附加动作时才使用，测试阶段通常不需要。"
    "禁止因历史对话中已出现过「第一组」而改用「第二组」。"
)
COMBAT_ROUND_SCOPE_REMINDER = (
    "【系统·本轮范围】只生成本次战斗回合的叙述与检定。"
    "对话历史（含第0回合、先攻、过往战斗回合、历史中「轮到你了」）仅供参考背景，"
    "可能与当前规则不一致，**不要**据此推断本次行动顺序，**不要**纠错或复盘历史。"
    "第0回合按先攻在玩家前先动NPC，那是另一阶段；与本战斗回合无关。"
    "本战斗回合固定：玩家 combatOrder=1 先行动（【第一～三步】）→ NPC combatOrder 2→N（【第四步】）→ 提示下一轮。"
    "玩家本条输入 = 本轮玩家行动，不是「等所有NPC动完后的补充」；本轮由玩家第一个生成。"
    "禁止输出「其实玩家应该在NPC之后」类自我修正，直接按本 prompt 执行。"
)
COMBAT_ROUND_FLOW_REMINDER = (
    "【系统·本轮生成顺序】本条回复必须按下列顺序书写，与对话历史先后无关："
    "①【第一～三步】玩家（combatOrder=1）根据玩家最新输入行动；"
    "②【第四步】按队列自动化 NPC（combatOrder 2→N）；"
    "③【第五～六步】状态同步与提示下一轮。"
    "历史中若先出现NPC、后出现「轮到你了」，那是第0回合或旧回合，不表示本次玩家排在NPC后面。"
)
COMBAT_NPC_QUEUE_REMINDER = (
    "【系统·NPC队列硬性规则】队列中每一位可行动的 NPC 都必须依次完整执行（检定+结果），"
    "不得跳过，不得用剧情代替。"
    "禁止：队列外角色介入、威吓挡刀、援护、把敌人吓退、突发事件打断等，"
    "用以免去队列内某位敌人的正式行动回合。"
    "队友 NPC 只能在轮到其队列顺位时行动，不能插队干预其他顺位。"
    "仅当该 NPC 本回复内 HP≤0 或已有石化/昏迷/麻痹/束缚等禁制状态时，"
    "才可写「无法行动」并进入下一位。"
    "输出格式：每位 NPC 行动前必须先写标题行"
    "【NPC行动 i/N | id=角色id | name=角色名】，再写检定与结果。"
    "缺少标题行时系统只打警告，不会补写。"
)
NPC_ACTION_HEADER_PATTERN = re.compile(
    r"【NPC行动\s+(?P<index>\d+)/(?P<total>\d+)\s*\|\s*id=(?P<id>[^\s|｜]+)",
)
FLEE_INTENT_PATTERN = re.compile(
    r"(逃跑|逃走|逃离|逃脱|撤退|溜走|开溜|撤离|撒退|投降|认输|缴械)",
    re.IGNORECASE,
)
COMBAT_FLEE_ROUND_REMINDER = (
    "【系统·逃跑/投降】玩家已明确表示逃脱或投降。"
    "本战斗回合只输出简短确认（可极短），禁止描写战斗结局、禁止执行【第四步】NPC 队列、"
    "禁止输出 [STATUS_SYNC]。结局与状态重置由紧随其后的战斗结束判定阶段处理。"
)


COMBAT_DEBUG_ORDER = ("trigger", "count", "initiative", "round0", "full")


def _debug_stage_reached(stage: str) -> bool:
    try:
        current_index = COMBAT_DEBUG_ORDER.index(COMBAT_DEBUG_STAGE)
        target_index = COMBAT_DEBUG_ORDER.index(stage)
    except ValueError:
        return COMBAT_DEBUG_STAGE == "full"
    return current_index >= target_index


def _reset_fighting_sync(context: dict) -> dict:
    status = context.get("status") or {}
    patch: dict = {"team": [], "enemy": []}

    for char in status.get("team") or []:
        if not isinstance(char, dict) or not char.get("id"):
            continue
        patch["team"].append({"id": char["id"], "fighting": False})

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict) or not encounter.get("id"):
            continue
        members_patch = []
        for member in encounter.get("members") or []:
            if not isinstance(member, dict) or not member.get("id"):
                continue
            members_patch.append({"id": member["id"], "fighting": False})
        if members_patch:
            patch["enemy"].append({"id": encounter["id"], "members": members_patch})

    return patch


def _resolve_character_name(
    char_id: str | None,
    char_name: str | None,
    ref_list: list,
) -> str | None:
    for ref in ref_list:
        if not isinstance(ref, dict):
            continue
        if char_id and ref.get("id") == char_id:
            return str(ref.get("name") or char_id)
        if char_name and ref.get("name") == char_name:
            return str(char_name)
    if char_name:
        return str(char_name)
    if char_id:
        return str(char_id)
    return None


def _collect_fighting_combatants(status_sync: dict | None, context: dict) -> list[dict]:
    if not status_sync:
        return []

    status = context.get("status") or {}
    combatants: list[dict] = []

    for entry in status_sync.get("team") or []:
        if not isinstance(entry, dict) or entry.get("fighting") is not True:
            continue
        char_id = entry.get("id")
        if not char_id:
            continue
        name = _resolve_character_name(char_id, entry.get("name"), status.get("team") or [])
        combatants.append({
            "id": char_id,
            "name": name or char_id,
            "side": "team",
        })

    for encounter_patch in status_sync.get("enemy") or []:
        if not isinstance(encounter_patch, dict):
            continue
        encounter_id = encounter_patch.get("id")
        if not encounter_id:
            continue
        ref_encounter = next(
            (
                enc for enc in (status.get("enemy") or [])
                if isinstance(enc, dict) and enc.get("id") == encounter_id
            ),
            None,
        )
        member_refs = (ref_encounter or {}).get("members") or []
        for member in encounter_patch.get("members") or []:
            if not isinstance(member, dict) or member.get("fighting") is not True:
                continue
            member_id = member.get("id")
            if not member_id:
                continue
            name = _resolve_character_name(member_id, member.get("name"), member_refs)
            combatants.append({
                "id": member_id,
                "name": name or member_id,
                "side": "enemy",
                "encounterId": encounter_id,
            })

    return combatants


def _format_fighters_block(fighters: list[dict]) -> str:
    if not fighters:
        return "参战角色（fighting: true）：无"
    lines = ["参战角色（按下列顺序编号，与 d20 第一组数值一一对应）："]
    for index, fighter in enumerate(fighters, start=1):
        if fighter.get("side") == "team":
            lines.append(
                f"{index}. team | id={fighter['id']} | name={fighter.get('name', '')}"
            )
            continue
        lines.append(
            f"{index}. enemy | encounter={fighter.get('encounterId', '')} "
            f"| id={fighter['id']} | name={fighter.get('name', '')}"
        )
    return "\n".join(lines)


def _append_reminder(messages: list[dict[str, str]], reminder: str) -> list[dict[str, str]]:
    if not messages:
        return [{"role": "user", "content": reminder}]
    return [*messages, {"role": "user", "content": reminder}]


def _parse_bool_token(text: str) -> bool | None:
    cleaned = (text or "").strip()
    if BOOL_TRUE.search(cleaned):
        return True
    if BOOL_FALSE.search(cleaned):
        return False
    return None


def _is_continue_token(text: str) -> bool:
    return bool(CONTINUE_TOKEN.search((text or "").strip()))


def _detect_flee_intent(text: str) -> bool:
    return bool(FLEE_INTENT_PATTERN.search((text or "").strip()))


def _is_combat_end_sync(sync: dict | None) -> bool:
    return bool(sync) and sync.get("inCombat") is False


def _parse_positive_int(text: str, default: int) -> int:
    cleaned = (text or "").strip()
    match = INT_PATTERN.search(cleaned)
    if not match:
        return default
    value = int(match.group(1))
    return value if value >= 1 else default


STATUS_SYNC_CLOSE_TAG = "[/STATUS_SYNC]"
STATUS_SYNC_OPEN_MARKERS = (
    re.compile(r"\[STATUS_SYNC\]", re.IGNORECASE),
    re.compile(r"#{1,6}\s*STATUS_SYNC\b", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*STATUS_SYNC\s*(?:\n|$)", re.IGNORECASE),
)
STATUS_SYNC_VARIANT_PATTERN = re.compile(
    r"(?:\[STATUS_SYNC\]|#{1,6}\s*STATUS_SYNC|(?:^|\n)\s*STATUS_SYNC\s*(?:\n|$))"
    r"\s*(\{[\s\S]*\})\s*\[/STATUS_SYNC\]",
    re.IGNORECASE,
)


def _find_status_sync_close_index(text: str) -> int:
    upper = (text or "").upper()
    marker = STATUS_SYNC_CLOSE_TAG.upper()
    return upper.rfind(marker)


def _find_status_sync_open_index(head: str) -> int:
    best = -1
    for pattern in STATUS_SYNC_OPEN_MARKERS:
        for match in pattern.finditer(head):
            if match.start() > best:
                best = match.start()
    return best


def _extract_balanced_json(text: str, start: int, end: int) -> tuple[int, int] | None:
    json_start = (text or "").find("{", start)
    if json_start < 0 or json_start >= end:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(json_start, end):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return json_start, index + 1
    return None


def _extract_status_sync_loose_payload(text: str) -> str | None:
    close_idx = _find_status_sync_close_index(text)
    if close_idx < 0:
        return None
    head = text[:close_idx]
    open_idx = _find_status_sync_open_index(head)
    search_from = 0
    if open_idx >= 0:
        for pattern in STATUS_SYNC_OPEN_MARKERS:
            for match in pattern.finditer(head):
                if match.start() == open_idx:
                    search_from = match.end()
                    break
    json_range = _extract_balanced_json(text, search_from, close_idx)
    if not json_range:
        return None
    start, end = json_range
    return text[start:end].strip()


def _strip_status_sync_loose(text: str) -> str:
    close_idx = _find_status_sync_close_index(text)
    if close_idx < 0:
        return text or ""
    head = text[:close_idx]
    open_idx = _find_status_sync_open_index(head)
    search_from = 0
    if open_idx >= 0:
        for pattern in STATUS_SYNC_OPEN_MARKERS:
            for match in pattern.finditer(head):
                if match.start() == open_idx:
                    search_from = match.end()
                    break
    json_range = _extract_balanced_json(text, search_from, close_idx)
    if not json_range:
        return text or ""
    json_start, _json_end = json_range
    strip_start = open_idx if open_idx >= 0 else json_start
    tail = text[close_idx + len(STATUS_SYNC_CLOSE_TAG):]
    return f"{text[:strip_start]}{tail}".strip()


def _parse_status_sync_payload(payload: str) -> dict | None:
    try:
        parsed = json.loads(payload.strip())
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _extract_status_sync_loose(text: str) -> dict | None:
    payload = _extract_status_sync_loose_payload(text)
    if not payload:
        return None
    return _parse_status_sync_payload(payload)


def _extract_status_sync_variant(text: str) -> dict | None:
    match = STATUS_SYNC_VARIANT_PATTERN.search(text or "")
    if not match:
        return None
    return _parse_status_sync_payload(match.group(1))


def _extract_status_sync(text: str) -> dict | None:
    match = STATUS_SYNC_PATTERN.search(text or "")
    if match:
        parsed = _parse_status_sync_payload(match.group(1))
        if parsed:
            return parsed
    variant = _extract_status_sync_variant(text)
    if variant:
        return variant
    return _extract_status_sync_loose(text)


def _extract_status_sync_all(text: str) -> dict | None:
    merged = None
    found = False
    for match in STATUS_SYNC_PATTERN.finditer(text or ""):
        found = True
        parsed = _parse_status_sync_payload(match.group(1))
        if isinstance(parsed, dict):
            merged = _merge_status_sync(merged or {}, parsed)
    if not found:
        variant = _extract_status_sync_variant(text)
        if variant:
            merged = _merge_status_sync(merged or {}, variant)
            found = True
    if found:
        return merged
    loose = _extract_status_sync_loose(text)
    return loose


def _llm_result_text_layers(result: ChatCompletionResult) -> tuple[str, str]:
    return (result.content or "", result.reasoning_content or "")


def _extract_status_sync_from_result(result: ChatCompletionResult) -> dict | None:
    content, reasoning = _llm_result_text_layers(result)
    sync = _extract_status_sync_all(content)
    if sync:
        return sync
    return _extract_status_sync_all(reasoning)


def _get_combat_round(context: dict) -> int:
    status = context.get("status") or {}
    try:
        value = int(status.get("combatRound", 1))
    except (TypeError, ValueError):
        value = 1
    return value if value >= 1 else 1


def _format_combat_round_marker_block(context: dict, npc_queue: list[dict]) -> str:
    combat_round = _get_combat_round(context)
    status = context.get("status") or {}
    allowed: list[str] = []

    player = _find_player_character(status.get("team") or [])
    if player:
        try:
            if int(player.get("initiative", -1)) == 1:
                allowed.append(
                    f"玩家 name={player.get('name')} id={player.get('id')} initiative=1 "
                    f"→ 仅【第三步】该角色行动叙述紧前"
                )
        except (TypeError, ValueError):
            pass

    for entry in npc_queue:
        try:
            if int(entry.get("initiative", -1)) == 1:
                allowed.append(
                    f"NPC name={entry.get('name')} id={entry.get('id')} initiative=1 "
                    f"→ 仅【第四步】该角色行动叙述紧前"
                )
        except (TypeError, ValueError):
            continue

    lines = [
        f"【回合标记·系统指定】本场为第 {combat_round} 战斗回合，N={combat_round}。",
        "禁止在回复开头输出 ——第N回合开始——。",
        "玩家 initiative≠1 时，禁止在【第三步】之前输出回合开始标记。",
        f"同一回复内最多输出一次 ——第{combat_round}回合开始——。",
        "回合开始标记为可选叙述装饰，不强制每次必须输出；若输出则遵守下列位置限制。",
    ]
    if not allowed:
        lines.append("本场无 initiative=1 的角色，禁止输出回合开始标记。")
    else:
        lines.append("仅以下角色行动叙述紧前可输出：")
        lines.extend(f"- {item}" for item in allowed)
    return "\n".join(lines)


def _parse_hp_current(char: dict) -> int:
    try:
        return int((char.get("hitPoints") or {}).get("current", 0))
    except (TypeError, ValueError):
        return 0


def _iter_fighting_team_members(status: dict):
    for char in status.get("team") or []:
        if isinstance(char, dict) and char.get("fighting") is True:
            yield char


def _iter_fighting_enemy_members(status: dict):
    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict):
            continue
        for member in encounter.get("members") or []:
            if isinstance(member, dict) and member.get("fighting") is True:
                yield member


def _is_team_wipe(status: dict) -> bool:
    fighters = list(_iter_fighting_team_members(status))
    if not fighters:
        return False
    return all(_parse_hp_current(char) <= 0 for char in fighters)


def _is_enemy_wipe(status: dict) -> bool:
    fighters = list(_iter_fighting_enemy_members(status))
    if not fighters:
        return False
    return all(_parse_hp_current(char) <= 0 for char in fighters)


def _build_combat_end_fact_block(context: dict, last_user: str = "") -> str:
    status = context.get("status") or {}
    team_lines = []
    for char in _iter_fighting_team_members(status):
        name = char.get("name") or char.get("id")
        hp = _parse_hp_current(char)
        team_lines.append(f"- {name}（id={char.get('id')}）HP={hp}")

    enemy_lines = []
    for member in _iter_fighting_enemy_members(status):
        name = member.get("name") or member.get("id")
        hp = _parse_hp_current(member)
        enemy_lines.append(f"- {name}（id={member.get('id')}）HP={hp}")

    team_wipe = _is_team_wipe(status)
    enemy_wipe = _is_enemy_wipe(status)
    flee_intent = _detect_flee_intent(last_user)
    lines = [
        "【战斗结束判定·系统面板数据】（以本节为准，勿凭叙述臆断）",
        "友方参战者：",
        *(team_lines or ["- （无）"]),
        f"友方全灭：{'是' if team_wipe else '否'}",
        "敌方参战者：",
        *(enemy_lines or ["- （无）"]),
        f"敌方全灭：{'是' if enemy_wipe else '否'}",
        f"玩家逃脱/投降：{'是' if flee_intent else '否'}",
    ]
    if team_wipe or enemy_wipe or flee_intent:
        reasons = []
        if team_wipe:
            reasons.append("友方全灭")
        if enemy_wipe:
            reasons.append("敌方全灭")
        if flee_intent:
            reasons.append("玩家逃脱/投降")
        lines.append(
            f"结论：战斗应结束（{'、'.join(reasons)}）。"
            "描写结局并在末尾输出 [STATUS_SYNC] 重置战斗状态。"
        )
    else:
        lines.append(
            "结论：战斗尚未结束。仅玩家一人 HP≤0 不构成友方全灭（队友仍存活即继续）。"
            "必须只输出 {Continue}，禁止描写战斗结局。"
        )
    return "\n".join(lines)


def _find_player_character(team: list) -> dict | None:
    for char in team:
        if char.get("tier") == "player":
            return char
    for char in team:
        if char.get("id") == "pc":
            return char
    return team[0] if team else None


def _player_initiative_from_sync(status_sync: dict | None, context: dict) -> int:
    teams_to_check: list[list] = []
    if status_sync and isinstance(status_sync.get("team"), list):
        teams_to_check.append(status_sync["team"])
    status = context.get("status") or {}
    if isinstance(status.get("team"), list):
        teams_to_check.append(status["team"])

    for team in teams_to_check:
        player = _find_player_character(team)
        if not player:
            continue
        initiative = player.get("initiative")
        if initiative is None:
            continue
        try:
            value = int(initiative)
        except (TypeError, ValueError):
            continue
        if value >= 1:
            return value
    return 1


def _strip_display_sync_blocks(text: str) -> str:
    cleaned = text or ""
    for pattern in (STATUS_SYNC_PATTERN, STATUS_SYNC_VARIANT_PATTERN, INVENTORY_SYNC_PATTERN, QUEST_SYNC_PATTERN):
        cleaned = pattern.sub("", cleaned)
    cleaned = _strip_status_sync_loose(cleaned)
    return cleaned.strip()


def _normalize_status_sync(status_sync: dict | None, context: dict) -> dict | None:
    if not status_sync:
        return None

    status = context.get("status") or {}
    normalized = dict(status_sync)

    team_by_name = {
        str(char.get("name")): char
        for char in (status.get("team") or [])
        if isinstance(char, dict) and char.get("name")
    }
    if isinstance(normalized.get("team"), list):
        patched_team = []
        for entry in normalized["team"]:
            if not isinstance(entry, dict):
                continue
            patch = dict(entry)
            if not patch.get("id") and patch.get("name"):
                ref = team_by_name.get(str(patch["name"]))
                if ref and ref.get("id"):
                    patch["id"] = ref["id"]
            if patch.get("id"):
                patched_team.append(patch)
        normalized["team"] = patched_team

    if isinstance(normalized.get("enemy"), list):
        patched_enemies = []
        for patch_encounter in normalized["enemy"]:
            if not isinstance(patch_encounter, dict):
                continue
            encounter_patch = dict(patch_encounter)
            encounter_id = encounter_patch.get("id")
            if not encounter_id:
                continue
            ref_encounter = next(
                (
                    enc for enc in (status.get("enemy") or [])
                    if isinstance(enc, dict) and enc.get("id") == encounter_id
                ),
                None,
            )
            members_by_name = {
                str(member.get("name")): member
                for member in (ref_encounter or {}).get("members") or []
                if isinstance(member, dict) and member.get("name")
            }
            if isinstance(encounter_patch.get("members"), list):
                patched_members = []
                for member in encounter_patch["members"]:
                    if not isinstance(member, dict):
                        continue
                    member_patch = dict(member)
                    if not member_patch.get("id") and member_patch.get("name"):
                        ref_member = members_by_name.get(str(member_patch["name"]))
                        if ref_member and ref_member.get("id"):
                            member_patch["id"] = ref_member["id"]
                    if member_patch.get("id"):
                        patched_members.append(member_patch)
                encounter_patch["members"] = patched_members
            patched_enemies.append(encounter_patch)
        normalized["enemy"] = patched_enemies

    return normalized


def _deep_merge_character_patch(current: dict, patch: dict) -> dict:
    merged = {**current, **patch}
    for key in ("hitPoints", "defense", "abilities", "equipment", "basics"):
        if key in patch and isinstance(patch[key], dict):
            merged[key] = {**(current.get(key) or {}), **patch[key]}
    if "conditions" in patch and isinstance(patch["conditions"], list):
        merged["conditions"] = patch["conditions"]
    return merged


def _merge_status_character_list(current_list: list, patch_list: list) -> list:
    if not isinstance(patch_list, list):
        return current_list
    if not isinstance(current_list, list):
        return [dict(char) for char in patch_list if isinstance(char, dict)]

    merged = [dict(char) for char in current_list if isinstance(char, dict)]
    for patch_char in patch_list:
        if not isinstance(patch_char, dict):
            continue
        patch_id = patch_char.get("id")
        index = next((i for i, char in enumerate(merged) if char.get("id") == patch_id), -1)
        if index < 0 and patch_char.get("name"):
            index = next(
                (i for i, char in enumerate(merged) if char.get("name") == patch_char.get("name")),
                -1,
            )
        if index < 0:
            merged.append(dict(patch_char))
            continue
        merged[index] = _deep_merge_character_patch(merged[index], patch_char)
    return merged


def _merge_status_enemy_list(current_list: list, patch_list: list) -> list:
    if not isinstance(patch_list, list):
        return current_list
    if not isinstance(current_list, list):
        return [dict(encounter) for encounter in patch_list if isinstance(encounter, dict)]

    merged = [dict(encounter) for encounter in current_list if isinstance(encounter, dict)]
    for patch_encounter in patch_list:
        if not isinstance(patch_encounter, dict):
            continue
        encounter_id = patch_encounter.get("id")
        index = next((i for i, enc in enumerate(merged) if enc.get("id") == encounter_id), -1)
        if index < 0:
            merged.append(dict(patch_encounter))
            continue
        current_encounter = merged[index]
        patch_members = patch_encounter.get("members")
        merged[index] = {
            **current_encounter,
            **patch_encounter,
            "members": _merge_status_character_list(
                current_encounter.get("members") or [],
                patch_members if isinstance(patch_members, list) else [],
            ),
        }
    return merged


def _merge_status_sync(base: dict, patch: dict | None) -> dict:
    if not patch:
        return base
    merged = {**base}
    for key, value in patch.items():
        if key in ("inCombat", "participants"):
            merged[key] = value
            continue
        if key == "team" and isinstance(value, list):
            merged["team"] = _merge_status_character_list(merged.get("team") or [], value)
            continue
        if key == "enemy" and isinstance(value, list):
            merged["enemy"] = _merge_status_enemy_list(merged.get("enemy") or [], value)
            continue
        if value is not None:
            merged[key] = value
    return merged


def _apply_status_sync_to_context(context: dict, status_sync: dict | None) -> None:
    if not status_sync:
        return
    status = dict(context.get("status") or {})
    context["status"] = _merge_status_sync(status, status_sync)
    if "inCombat" in status_sync:
        context["inCombat"] = status_sync["inCombat"]
    if "participants" in status_sync:
        context["participants"] = status_sync["participants"]


def _summarize_initiative_from_context(context: dict) -> list[dict]:
    status = context.get("status") or {}
    entries: list[dict] = []

    for char in status.get("team") or []:
        if not isinstance(char, dict):
            continue
        initiative = char.get("initiative")
        try:
            value = int(initiative)
        except (TypeError, ValueError):
            continue
        if value >= 1:
            entries.append({
                "id": char.get("id"),
                "name": char.get("name"),
                "initiative": value,
                "side": "team",
            })

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict):
            continue
        for member in encounter.get("members") or []:
            if not isinstance(member, dict):
                continue
            initiative = member.get("initiative")
            try:
                value = int(initiative)
            except (TypeError, ValueError):
                continue
            if value >= 1:
                entries.append({
                    "id": member.get("id"),
                    "name": member.get("name"),
                    "initiative": value,
                    "side": "enemy",
                })

    entries.sort(key=lambda item: item["initiative"])
    return entries


def _is_player_character(context: dict, char_id: str | None, side: str) -> bool:
    if side != "team" or not char_id:
        return False
    for char in (context.get("status") or {}).get("team") or []:
        if not isinstance(char, dict) or char.get("id") != char_id:
            continue
        return char.get("id") == "pc" or char.get("tier") == "player"
    return char_id == "pc"


def _find_player_initiative_index(ordered: list[dict], context: dict) -> int | None:
    for index, entry in enumerate(ordered):
        if _is_player_character(context, entry.get("id"), entry.get("side", "")):
            return index
    return None


def _enrich_enemy_encounter_ids(entries: list[dict], context: dict) -> None:
    status = context.get("status") or {}
    for entry in entries:
        if entry.get("side") != "enemy":
            continue
        for encounter in status.get("enemy") or []:
            if not isinstance(encounter, dict):
                continue
            for member in encounter.get("members") or []:
                if member.get("id") == entry.get("id"):
                    entry["encounterId"] = encounter.get("id")
                    break


def _summarize_combat_order_from_context(context: dict) -> list[dict]:
    status = context.get("status") or {}
    entries: list[dict] = []

    for char in status.get("team") or []:
        if not isinstance(char, dict):
            continue
        try:
            combat_order = int(char.get("combatOrder"))
            initiative = int(char.get("initiative"))
        except (TypeError, ValueError):
            continue
        if combat_order < 1:
            continue
        entries.append({
            "id": char.get("id"),
            "name": char.get("name"),
            "initiative": initiative,
            "combatOrder": combat_order,
            "side": "team",
        })

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict):
            continue
        for member in encounter.get("members") or []:
            if not isinstance(member, dict):
                continue
            try:
                combat_order = int(member.get("combatOrder"))
                initiative = int(member.get("initiative"))
            except (TypeError, ValueError):
                continue
            if combat_order < 1:
                continue
            entries.append({
                "id": member.get("id"),
                "name": member.get("name"),
                "initiative": initiative,
                "combatOrder": combat_order,
                "side": "enemy",
                "encounterId": encounter.get("id"),
            })

    entries.sort(key=lambda item: item["combatOrder"])
    return entries


def _build_combat_order_sync(context: dict) -> dict | None:
    ordered = _summarize_initiative_from_context(context)
    if not ordered:
        return None

    _enrich_enemy_encounter_ids(ordered, context)
    player_index = _find_player_initiative_index(ordered, context)
    if player_index is None:
        return None

    sequence = [ordered[player_index]] + ordered[player_index + 1:] + ordered[:player_index]
    team_patches: list[dict] = []
    enemy_patches: dict[str, list[dict]] = {}

    for combat_pos, entry in enumerate(sequence, start=1):
        patch = {"id": entry["id"], "combatOrder": combat_pos}
        if entry.get("side") == "team":
            team_patches.append(patch)
            continue
        encounter_id = entry.get("encounterId")
        if encounter_id:
            enemy_patches.setdefault(encounter_id, []).append(patch)

    result: dict = {}
    if team_patches:
        result["team"] = team_patches
    if enemy_patches:
        result["enemy"] = [
            {"id": encounter_id, "members": members}
            for encounter_id, members in enemy_patches.items()
        ]
    return result or None


def _reset_combat_order_sync(context: dict) -> dict:
    status = context.get("status") or {}
    patch: dict = {"team": [], "enemy": []}

    for char in status.get("team") or []:
        if not isinstance(char, dict) or not char.get("id"):
            continue
        patch["team"].append({"id": char["id"], "combatOrder": -1})

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict) or not encounter.get("id"):
            continue
        members_patch = []
        for member in encounter.get("members") or []:
            if not isinstance(member, dict) or not member.get("id"):
                continue
            members_patch.append({"id": member["id"], "combatOrder": -1})
        if members_patch:
            patch["enemy"].append({"id": encounter["id"], "members": members_patch})

    return patch


def _build_npc_automation_queue(context: dict, phase: str) -> list[dict]:
    if phase == "after_player":
        ordered = _summarize_combat_order_from_context(context)
        return [
            entry for entry in ordered
            if entry.get("combatOrder", -1) >= 2
            and not _is_player_character(context, entry.get("id"), entry.get("side", ""))
        ]

    ordered = _summarize_initiative_from_context(context)
    if not ordered:
        return []

    _enrich_enemy_encounter_ids(ordered, context)
    player_index = _find_player_initiative_index(ordered, context)
    if player_index is None:
        return [
            entry for entry in ordered
            if not _is_player_character(context, entry.get("id"), entry.get("side", ""))
        ]

    if phase == "round0":
        segment = ordered[:player_index]
    else:
        return []

    return [
        entry for entry in segment
        if not _is_player_character(context, entry.get("id"), entry.get("side", ""))
    ]


def _format_combat_order_reference_block(context: dict) -> str:
    ordered = _summarize_combat_order_from_context(context)
    if not ordered:
        return "【战斗顺位】（combatOrder）未生成"

    lines = [
        "【战斗顺位】（combatOrder，玩家恒为 1；本场战斗回合按此顺序行动，"
        "与面板 initiative 先攻显示、对话历史先后无关）",
    ]
    for entry in ordered:
        role = "玩家" if _is_player_character(context, entry.get("id"), entry.get("side", "")) else "NPC"
        if entry.get("side") == "team":
            lines.append(
                f"- combatOrder={entry.get('combatOrder')} | initiative={entry.get('initiative')} "
                f"| {role} | team | id={entry.get('id')} | name={entry.get('name', '')}"
            )
            continue
        lines.append(
            f"- combatOrder={entry.get('combatOrder')} | initiative={entry.get('initiative')} "
            f"| {role} | enemy | id={entry.get('id')} | name={entry.get('name', '')}"
        )
    return "\n".join(lines)


def _format_combat_round_execution_block(context: dict, npc_queue: list[dict]) -> str:
    ordered = _summarize_combat_order_from_context(context)
    player_entry = next(
        (
            entry
            for entry in ordered
            if _is_player_character(context, entry.get("id"), entry.get("side", ""))
        ),
        None,
    )
    player_name = player_entry.get("name", "") if player_entry else ""
    player_label = f"玩家 {player_name}".strip()

    lines = [
        "【本轮执行顺序】（本条回复书写顺序；与对话历史、第0回合先后无关）",
        f"1. 【第一～三步】{player_label} combatOrder=1 —— 根据玩家最新输入**先**行动",
    ]
    for index, entry in enumerate(npc_queue, start=1):
        lines.append(
            f"{index + 1}. 【第四步·NPC {index}/{len(npc_queue)}】"
            f" combatOrder={entry.get('combatOrder')} | id={entry.get('id')} "
            f"| name={entry.get('name', '')}"
        )
    lines.append(f"{len(npc_queue) + 2}. 【第五～六步】[STATUS_SYNC] 与提示下一轮")
    lines.append(
        "历史中若 NPC 先于玩家、或出现「轮到你了」，那是第0回合/旧回合；"
        "本次战斗回合玩家永远在回复正文最前生成行动，玩家输入不是排在 NPC 队尾之后。"
    )
    return "\n".join(lines)


def _collect_llm_full_text(result: ChatCompletionResult) -> str:
    content, reasoning = _llm_result_text_layers(result)
    return f"{content}\n{reasoning}".strip()


def _log_npc_queue_coverage(result: ChatCompletionResult, queue: list[dict], label: str) -> None:
    if not queue:
        return
    full_text = _collect_llm_full_text(result)
    found_ids = {
        match.group("id").strip()
        for match in NPC_ACTION_HEADER_PATTERN.finditer(full_text)
    }
    missing_headers = []
    for entry in queue:
        entry_id = entry.get("id")
        if entry_id and entry_id not in found_ids:
            missing_headers.append(entry.get("name") or entry_id)
    if missing_headers:
        print(
            f"[combat-test] {label} queue header WARNING => "
            f"缺少【NPC行动 i/N | id=... | name=...】标题: {missing_headers}"
        )
    else:
        print(f"[combat-test] {label} queue headers => ok ({len(queue)}/{len(queue)})")


def _format_npc_queue_block(queue: list[dict], *, phase: str) -> str:
    if not queue:
        return "【本次需自动化的 NPC 行动队列】：无"

    if phase == "round0":
        intro = (
            "【本次需自动化的 NPC 行动队列】（第0回合：先攻第1位至玩家前一位，"
            "必须全部执行完毕才可提示玩家）"
        )
    else:
        intro = (
            "【本次需自动化的 NPC 行动队列】（战斗回合：玩家 combatOrder=1 已在【第一～三步】先完成；"
            "本队列 combatOrder 2→N 在玩家之后依次执行；"
            "队列全部执行完毕后才可提示玩家）"
        )
        intro += (
            "\n骰子：各角色使用 combatOrder 对应位置的骰子值（玩家 combatOrder=1 为每行第1个）；"
            "initiative 不参与骰子。"
            "\n回合标记：见系统【回合标记·系统指定】；initiative=1 时输出指定 N，同一回复只输出一次。"
        )

    total = len(queue)
    intro += (
        f"\n共 {total} 位 NPC，按下列顺序逐位执行。"
        "每位行动前必须先写标题行：【NPC行动 i/N | id=角色id | name=角色名】，"
        "再写检定与结果。禁止用剧情介入跳过队列内可行动 NPC。"
    )

    lines = [intro]
    for index, entry in enumerate(queue, start=1):
        order_key = "combatOrder" if phase == "after_player" else "initiative"
        order_val = entry.get(order_key, entry.get("initiative"))
        header = f"【NPC行动 {index}/{total} | id={entry.get('id')} | name={entry.get('name', '')}】"
        if entry.get("side") == "team":
            lines.append(
                f"{index}. team | {order_key}={order_val} | initiative={entry.get('initiative')} "
                f"| id={entry.get('id')} | name={entry.get('name', '')} | 必须输出 {header}"
            )
            continue
        lines.append(
            f"{index}. enemy | {order_key}={order_val} | initiative={entry.get('initiative')} "
            f"| encounter={entry.get('encounterId', '')} "
            f"| id={entry.get('id')} | name={entry.get('name', '')} | 必须输出 {header}"
        )
    return "\n".join(lines)


def _format_combat_dice_block_by_combat_order(context: dict, count: int) -> str:
    base = format_combat_dice_block(count)
    ordered = _summarize_combat_order_from_context(context)
    if not ordered:
        return (
            f"{base}\n\n"
            "【骰子取用规则·战斗回合】按 combatOrder 取用（玩家 combatOrder=1 为每行第 1 个数值）；"
            "initiative 仅用于回合开始标记。"
        )

    lines = [
        COMBAT_DICE_FRESH_REMINDER,
        "",
        "【骰子取用规则·战斗回合】",
        "每种骰子一行中，第 n 个数值对应 combatOrder=n 的角色（玩家恒为第 1 个）。",
        "initiative 不参与骰子分配，仅用于「第N回合开始」标记。",
        "",
    ]
    for entry in ordered:
        role = "玩家" if _is_player_character(context, entry.get("id"), entry.get("side", "")) else "NPC"
        pos = entry.get("combatOrder")
        lines.append(
            f"combatOrder={pos}（骰子第{pos}位）| {role} "
            f"| id={entry.get('id')} | name={entry.get('name', '')}"
        )
    return f"{base}\n\n" + "\n".join(lines)


def _strip_leading_round_start_markers(text: str) -> str:
    cleaned = text or ""
    while ROUND_START_LEADING_PATTERN.match(cleaned):
        cleaned = ROUND_START_LEADING_PATTERN.sub("", cleaned, count=1)
    return cleaned


def _postprocess_combat_round_result(
    result: ChatCompletionResult,
    context: dict,
    npc_queue: list[dict],
) -> ChatCompletionResult:
    status = context.get("status") or {}
    player = _find_player_character(status.get("team") or [])
    player_init = -1
    if player:
        try:
            player_init = int(player.get("initiative", -1))
        except (TypeError, ValueError):
            player_init = -1

    content = _strip_leading_round_start_markers(result.content or "")
    if player_init != 1 and content != (result.content or ""):
        print(
            "[combat-test] round marker sanitize => "
            f"stripped leading marker (player initiative={player_init})"
        )
    return ChatCompletionResult(
        content=content,
        reasoning_content=result.reasoning_content,
    )


def _resolve_display_content(result: ChatCompletionResult) -> ChatCompletionResult:
    content = _strip_display_sync_blocks(result.content or "").strip()
    reasoning = (result.reasoning_content or "").strip()
    if not content and reasoning:
        print("[combat-test] display fallback: 正文为空，使用 reasoning 作为对话框输出")
        return ChatCompletionResult(content=reasoning, reasoning_content="")
    return ChatCompletionResult(
        content=content,
        reasoning_content=result.reasoning_content,
    )


def _dm_segment(text: str, label: str = "DM", reasoning: str = "") -> dict:
    segment = {"text": text.strip(), "label": label, "role": "dm"}
    if reasoning and reasoning.strip():
        segment["reasoning"] = reasoning.strip()
    return segment


def _dm_segment_from_result(result: ChatCompletionResult, label: str = "DM") -> dict:
    display = _resolve_display_content(result)
    return _dm_segment(display.content, label=label, reasoning=display.reasoning_content)


def _build_handler_response(
    result: ChatCompletionResult,
    *,
    pipeline_messages: list[dict] | None = None,
    status_sync: dict | None = None,
    battle_state: str | None = None,
) -> dict:
    cleaned = _resolve_display_content(result)
    response = deepseek_client.to_handler_response(cleaned)
    if pipeline_messages:
        response["pipelineMessages"] = pipeline_messages
    if status_sync:
        response["statusSync"] = status_sync
    if battle_state:
        response["battleState"] = battle_state
    return response


def _build_text_response(
    text: str,
    *,
    pipeline_messages: list[dict] | None = None,
    status_sync: dict | None = None,
    battle_state: str | None = None,
) -> dict:
    response = deepseek_client.to_handler_response(
        ChatCompletionResult(content=text),
    )
    if pipeline_messages:
        response["pipelineMessages"] = pipeline_messages
    if status_sync:
        response["statusSync"] = status_sync
    if battle_state:
        response["battleState"] = battle_state
    return response


async def handle_combat_test(
    messages: list[dict],
    save_name: str | None = None,
    context: dict | None = None,
) -> dict:
    context = context or {}
    llm_messages = to_llm_messages(messages)
    last_user = extract_last_user_message(messages)

    if not bool(context.get("inCombat")):
        return await _handle_non_combat(llm_messages, last_user, context)

    if not _debug_stage_reached("full"):
        return _build_text_response(
            f"[调试阻断] 当前 COMBAT_DEBUG_STAGE={COMBAT_DEBUG_STAGE}，战斗中分支未开放",
            battle_state="debug_blocked",
        )

    participants = context.get("participants", -1)
    return await _handle_in_combat(llm_messages, last_user, context, participants)


async def _handle_non_combat(
    llm_messages: list[dict],
    last_user: str,
    context: dict,
) -> dict:
    trigger_result = await deepseek_client.chat(
        _append_reminder(llm_messages, TRIGGER_OUTPUT_REMINDER),
        system=build_game_system_prompt(
            load_battle_trigger_prompt(),
            "",
            context,
            channel="combat-test",
            last_user=last_user,
        ),
        thinking=False,
        temperature=0,
        attach_user_patch=False,
    )

    triggered = _parse_bool_token(trigger_result.content)
    if triggered is True:
        debug_label = "{True}"
    elif triggered is False:
        debug_label = "{False}"
    else:
        debug_label = trigger_result.content.strip() or "{?}"

    print(f"[combat-test] trigger => {debug_label} (raw={trigger_result.content!r})")

    if not _debug_stage_reached("count"):
        return _build_text_response(
            "",
            battle_state="debug_trigger",
        )

    if triggered is not True:
        rag_context = await retrieve_context(CHANNEL_COMBAT_TEST, last_user, context)
        system_prompt = build_game_system_prompt(
            load_no_trigger_prompt(),
            rag_context,
            context,
            channel="combat-test",
            last_user=last_user,
        )
        user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH else None
        result = await deepseek_client.chat(
            llm_messages,
            system=system_prompt,
            user_patch=user_patch,
            thinking=True,
        )
        return _build_handler_response(
            result,
            status_sync={"inCombat": False, "participants": -1},
            battle_state="no_trigger",
        )

    return await _handle_battle_prep(llm_messages, last_user, context)


async def _handle_battle_prep(
    llm_messages: list[dict],
    last_user: str,
    context: dict,
) -> dict:
    pipeline: list[dict] = []

    count_result = await deepseek_client.chat(
        _append_reminder(llm_messages, COUNT_OUTPUT_REMINDER),
        system=build_game_system_prompt(
            load_battle_count_prompt(),
            "",
            context,
            channel="combat-test",
            last_user=last_user,
        ),
        thinking=False,
        temperature=0,
        attach_user_patch=False,
    )
    count_sync = _normalize_status_sync(
        _extract_status_sync(count_result.content),
        context,
    )
    fighters = _collect_fighting_combatants(count_sync, context)
    participants = len(fighters) if fighters else _parse_positive_int(count_result.content, 4)

    status_sync = _merge_status_sync(
        _reset_fighting_sync(context),
        {"inCombat": True, "participants": participants},
    )
    status_sync = _merge_status_sync(status_sync, count_sync)

    context["inCombat"] = True
    context["participants"] = participants

    if not _debug_stage_reached("initiative"):
        return _build_text_response(
            "",
            status_sync=status_sync,
            battle_state="debug_count",
        )

    fighters_block = _format_fighters_block(fighters)
    dice_results_block = format_combat_dice_block(participants)
    print(f"[combat-test] initiative input =>\n{fighters_block}\n{dice_results_block}")

    initiative_messages = [
        *llm_messages,
        {
            "role": "user",
            "content": (
                f"{fighters_block}\n\n"
                f"{dice_results_block}\n\n"
                "请根据以上参战角色列表（顺序已与 d20 第一组对齐）与骰子结果生成先攻顺序，"
                "并在末尾输出 [STATUS_SYNC] 更新所有参战角色的 initiative。"
            ),
        },
    ]
    initiative_result = await deepseek_client.chat(
        initiative_messages,
        system=build_game_system_prompt(
            load_initiative_order_prompt(),
            "",
            context,
            channel="combat-test",
            last_user=last_user,
        ),
        thinking=True,
        attach_user_patch=False,
    )
    pipeline.append(_dm_segment_from_result(initiative_result))

    initiative_sync = _normalize_status_sync(
        _extract_status_sync(initiative_result.content),
        context,
    )
    player_position = _player_initiative_from_sync(initiative_sync, context)
    status_sync = _merge_status_sync(
        status_sync,
        {"inCombat": True, "participants": participants, "combatRound": 1},
    )
    status_sync = _merge_status_sync(status_sync, initiative_sync)
    _apply_status_sync_to_context(context, status_sync)
    combat_order_sync = _normalize_status_sync(_build_combat_order_sync(context), context)
    if combat_order_sync:
        status_sync = _merge_status_sync(status_sync, combat_order_sync)
        _apply_status_sync_to_context(context, status_sync)

    print(
        f"[combat-test] initiative => player_position={player_position} "
        f"combat_order={_summarize_combat_order_from_context(context)}"
    )

    if not _debug_stage_reached("round0"):
        return _build_handler_response(
            initiative_result,
            pipeline_messages=pipeline,
            status_sync=status_sync,
            battle_state="debug_initiative",
        )

    if player_position == 1:
        final_text = "你是第一顺位。你要做什么？"
        pipeline.append(_dm_segment(final_text))
        return _build_text_response(
            final_text,
            pipeline_messages=pipeline,
            status_sync=status_sync,
            battle_state="player_turn",
        )

    _apply_status_sync_to_context(context, status_sync)
    round0_queue = _build_npc_automation_queue(context, "round0")
    round0_queue_block = _format_npc_queue_block(round0_queue, phase="round0")
    print(
        "[combat-test] round0 input => initiative order "
        f"{_summarize_initiative_from_context(context)} queue={round0_queue}"
    )

    rag_context = await retrieve_context(CHANNEL_COMBAT_TEST, last_user, context)
    round_0_prompt = load_battle_round_0_prompt()
    system_prompt = build_game_system_prompt(
        round_0_prompt,
        rag_context,
        context,
        dice_results_block=dice_results_block,
        channel="combat-test",
        last_user=last_user,
    )
    system_prompt = (
        f"{system_prompt.rstrip()}\n\n{round0_queue_block}\n\n"
        f"{COMBAT_DOWN_REMINDER}\n\n{COMBAT_NPC_QUEUE_REMINDER}\n\n{COMBAT_THINKING_REMINDER}\n\n"
        f"{ROUND_0_OUTPUT_REMINDER}"
    )
    round_0_messages = [
        *llm_messages,
        {"role": "assistant", "content": initiative_result.content},
    ]
    user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH else None
    round_0_result = await deepseek_client.chat(
        round_0_messages,
        system=system_prompt,
        user_patch=user_patch,
        thinking=True,
    )
    _log_npc_queue_coverage(round_0_result, round0_queue, "round0")
    pipeline.append(_dm_segment_from_result(round_0_result))

    round_0_sync = _merge_round_status_sync(round_0_result, context)

    content_text, reasoning_text = _llm_result_text_layers(round_0_result)
    print(
        "[combat-test] round0 sync => "
        f"extracted={bool(round_0_sync)} "
        f"content_has_block={bool(_extract_status_sync_all(content_text))} "
        f"reasoning_has_block={bool(_extract_status_sync_all(reasoning_text))} "
        f"merged={round_0_sync!r}"
    )
    if not round_0_sync:
        print("[combat-test] round0 WARNING: 未找到 [STATUS_SYNC]，面板不会更新")

    status_sync = _merge_status_sync(status_sync, round_0_sync)

    return _build_handler_response(
        round_0_result,
        pipeline_messages=pipeline,
        status_sync=status_sync,
        battle_state="round_0",
    )


def _merge_round_status_sync(round_source: str | ChatCompletionResult, context: dict) -> dict | None:
    if isinstance(round_source, ChatCompletionResult):
        return _normalize_status_sync(
            _extract_status_sync_from_result(round_source),
            context,
        )
    return _normalize_status_sync(
        _extract_status_sync(round_source),
        context,
    )


async def _handle_in_combat(
    llm_messages: list[dict],
    last_user: str,
    context: dict,
    participants: int,
) -> dict:
    if participants < 1:
        participants = _parse_positive_int(str(participants), 4)
        context["participants"] = participants

    combat_round = _get_combat_round(context)
    flee_intent = _detect_flee_intent(last_user)
    npc_queue = _build_npc_automation_queue(context, "after_player")
    round_marker_block = _format_combat_round_marker_block(context, npc_queue)
    execution_block = _format_combat_round_execution_block(context, npc_queue)
    dice_results_block = _format_combat_dice_block_by_combat_order(context, participants)
    npc_queue_block = _format_npc_queue_block(npc_queue, phase="after_player")
    combat_order_block = _format_combat_order_reference_block(context)
    print(
        f"[combat-test] combat round={combat_round} flee_intent={flee_intent} "
        f"npc queue => {npc_queue}"
    )

    rag_context = await retrieve_context(CHANNEL_COMBAT_TEST, last_user, context)
    system_prompt = build_game_system_prompt(
        load_battle_round_normal_prompt(),
        rag_context,
        context,
        dice_results_block=dice_results_block,
        channel="combat-test",
        last_user=last_user,
    )
    system_prompt = (
        f"{system_prompt.rstrip()}\n\n{execution_block}\n\n{round_marker_block}\n\n"
        f"{combat_order_block}\n\n{npc_queue_block}\n\n{COMBAT_DOWN_REMINDER}\n\n"
        f"{COMBAT_NPC_QUEUE_REMINDER}\n\n{COMBAT_THINKING_REMINDER}\n\n"
        f"{COMBAT_ROUND_SCOPE_REMINDER}\n\n{COMBAT_ROUND_FLOW_REMINDER}\n\n"
        f"{ROUND_NORMAL_OUTPUT_REMINDER}"
    )
    if flee_intent:
        system_prompt = f"{system_prompt.rstrip()}\n\n{COMBAT_FLEE_ROUND_REMINDER}"
    user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH else None
    round_messages = _append_reminder(
        llm_messages,
        f"{COMBAT_ROUND_SCOPE_REMINDER}\n\n{COMBAT_ROUND_FLOW_REMINDER}",
    )
    if flee_intent:
        round_messages = _append_reminder(round_messages, COMBAT_FLEE_ROUND_REMINDER)
    round_result = await deepseek_client.chat(
        round_messages,
        system=system_prompt,
        user_patch=user_patch,
        thinking=True,
    )
    if flee_intent:
        print("[combat-test] combat-round flee => skip NPC queue header check")
    else:
        _log_npc_queue_coverage(round_result, npc_queue, "combat-round")

    round_sync = _merge_round_status_sync(round_result, context)
    round_result = _postprocess_combat_round_result(round_result, context, npc_queue)
    content_text, reasoning_text = _llm_result_text_layers(round_result)
    strict = bool(STATUS_SYNC_PATTERN.search(content_text) or STATUS_SYNC_PATTERN.search(reasoning_text))
    loose = bool(_extract_status_sync_loose_payload(content_text) or _extract_status_sync_loose_payload(reasoning_text))
    if flee_intent:
        print("[combat-test] combat-round flee => STATUS_SYNC not expected in round phase")
    elif not round_sync:
        print("[combat-test] combat-round WARNING: 未找到 [STATUS_SYNC]，面板不会更新")
    elif not strict and loose:
        print("[combat-test] combat-round sync => loose extract (missing [STATUS_SYNC] opener)")
    _apply_status_sync_to_context(context, round_sync)

    end_fact_block = _build_combat_end_fact_block(context, last_user)
    print(f"[combat-test] combat end check => {end_fact_block.splitlines()[-1]}")
    end_messages = [
        *llm_messages,
        {"role": "assistant", "content": round_result.content},
        {"role": "user", "content": END_FOLLOWUP_REMINDER},
    ]
    end_result = await deepseek_client.chat(
        end_messages,
        system=build_game_system_prompt(
            load_battle_end_prompt(),
            end_fact_block,
            context,
            channel="combat-test",
            last_user=last_user,
        ),
        thinking=True,
        attach_user_patch=False,
    )

    status = context.get("status") or {}
    team_wipe = _is_team_wipe(status)
    enemy_wipe = _is_enemy_wipe(status)
    end_sync_preview = _normalize_status_sync(
        _extract_status_sync_from_result(end_result),
        context,
    )
    model_end = _is_combat_end_sync(end_sync_preview)
    should_continue = not team_wipe and not enemy_wipe and not flee_intent and not model_end
    force_end = flee_intent and _is_continue_token(end_result.content)

    if force_end:
        print("[combat-test] flee override: 玩家已逃跑但结束判定输出 {Continue}，强制结束")
        end_result = ChatCompletionResult(
            content="你抓住机会，成功脱离了战斗。",
            reasoning_content=end_result.reasoning_content,
        )

    if should_continue and not _is_continue_token(end_result.content):
        print("[combat-test] end override: 友方/敌方均未全灭但模型未输出 {Continue}，强制继续")
        end_result = ChatCompletionResult(content="{Continue}")

    if not force_end and _is_continue_token(end_result.content):
        print(f"[combat-test] combat end => continue (next round={combat_round + 1})")
        status_sync = _merge_status_sync(
            {"inCombat": True, "participants": participants, "combatRound": combat_round + 1},
            round_sync,
        )
        return _build_handler_response(
            round_result,
            pipeline_messages=[_dm_segment_from_result(round_result)],
            status_sync=status_sync,
            battle_state="ongoing",
        )

    end_reasons = []
    if flee_intent:
        end_reasons.append("flee")
    if team_wipe:
        end_reasons.append("team_wipe")
    if enemy_wipe:
        end_reasons.append("enemy_wipe")
    if model_end:
        end_reasons.append("model_end_sync")
    print(f"[combat-test] combat end => ended ({', '.join(end_reasons) or 'unknown'})")

    pipeline = [
        _dm_segment_from_result(round_result),
        _dm_segment_from_result(end_result),
    ]
    end_sync = end_sync_preview or {
        "inCombat": False,
        "participants": -1,
        "combatRound": -1,
    }
    end_sync = _normalize_status_sync(end_sync, context)
    if not _extract_status_sync_from_result(end_result):
        print("[combat-test] combat end WARNING: 未找到 [STATUS_SYNC]，使用 Python 默认重置")
    end_sync = _merge_status_sync(end_sync, _reset_fighting_sync(context))
    end_sync = _merge_status_sync(end_sync, _reset_combat_order_sync(context))
    status_sync = _merge_status_sync(
        end_sync,
        round_sync,
    )
    if status_sync.get("inCombat") is not False:
        status_sync["inCombat"] = False
        status_sync["participants"] = -1
        status_sync["combatRound"] = -1

    print(f"[combat-test] combat end sync => inCombat={status_sync.get('inCombat')}")

    return _build_handler_response(
        end_result,
        pipeline_messages=pipeline,
        status_sync=status_sync,
        battle_state="ended",
    )
