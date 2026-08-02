import json
import re
from copy import deepcopy

from config import DEEPSEEK_COMBAT_MODEL, DEEPSEEK_USER_PROMPT_PATCH
from handlers.consult import extract_last_user_message
from handlers.passthrough import to_llm_messages
from rag.policies import CHANNEL_COMBAT_TEST
from rag.service import retrieve_context
from services.deepseek import ChatCompletionResult, deepseek_client
from services.dice_initiative import format_initiative_block
from services.dice_single import format_single_dice_block
from services.prompts import (
    build_game_system_prompt,
    load_battle_count_prompt,
    load_battle_npc_turn_prompt,
    load_battle_player_turn_prompt,
    load_battle_trigger_prompt,
    load_battle_update_prompt,
    load_initiative_order_prompt,
    load_no_trigger_prompt,
    load_user_prompt_patch,
)

COMBAT_DEBUG_STAGE = "full"

TRIGGER_OUTPUT_REMINDER = (
    "【系统】请根据以上对话判断：玩家最新行动是否会触发战斗。"
    "只输出合法 JSON，不要解释。格式必须为：{\"triggered\": true} 或 {\"triggered\": false}。"
)
COUNT_OUTPUT_REMINDER = (
    "【系统】请确定本场战斗的参战人员。"
    "只输出 [STATUS_SYNC] 更新所有相关角色的 fighting 字段，禁止任何其它文字。"
)

BOOL_TRUE = re.compile(r"\{True\b", re.IGNORECASE)
BOOL_FALSE = re.compile(r"\{False\b", re.IGNORECASE)
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

COMBAT_DOWN_REMINDER = (
    "【系统·倒地规则·调试】HP≤0 视为倒地，禁止死亡豁免检定。"
    "倒地角色可说话指挥队友，但不能攻击/移动/施法；"
    "使用治疗道具或法术回血后，HP>0 才可行动。"
    "玩家 HP≤0 时，其输入视为语言指挥，不是「尝试行动」，不要提示「第二次尝试」。"
)
COMBAT_ACTOR_ONLY_REMINDER = (
    "【系统·行动者锁定】本场按先攻队列由 Python 逐人调度，每人每轮仅一次主动行动。"
    "本次仅供【当前行动角色·系统指定】中的角色生成主动行动与检定。"
    "禁止描写其他任何角色在本回合的主动行动，含即时反击、借机攻击、反应动作、错峰插队。"
    "被攻击方不得在同一回应里「立刻还手」；其行动须等轮到该角色队列位时另开一轮生成。"
    "其他角色仅可作为目标或被影响方出现。"
)

ACTOR_TURN_TEMPLATE = "【{name}·回合】"

ROUND_START_TEMPLATE = "——第{round}回合开始——"
ROUND_END_TEMPLATE = "——第{round}回合结束——"

COMBAT_DEBUG_ORDER = ("trigger", "count", "initiative", "full")

JSON_RESPONSE_FORMAT = {"type": "json_object"}
COMBAT_STATE_UPDATE_MAX_TOKENS = 2048
COMBAT_STATE_PATH = re.compile(r"(?:[A-Za-z_][A-Za-z0-9_]*|\[\d+\])")
COMBAT_STATE_ROOT_KEYS = {"inCombat", "participants", "combatRound", "combatTurnIndex", "team", "enemy"}


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


def _reset_initiative_sync(context: dict) -> dict:
    status = context.get("status") or {}
    patch: dict = {"team": [], "enemy": []}

    for char in status.get("team") or []:
        if not isinstance(char, dict) or not char.get("id"):
            continue
        try:
            initiative = int(char.get("initiative", -1))
        except (TypeError, ValueError):
            initiative = -1
        if initiative >= 1 or char.get("fighting") is True:
            patch["team"].append({"id": char["id"], "initiative": -1})

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict) or not encounter.get("id"):
            continue
        members_patch = []
        for member in encounter.get("members") or []:
            if not isinstance(member, dict) or not member.get("id"):
                continue
            try:
                initiative = int(member.get("initiative", -1))
            except (TypeError, ValueError):
                initiative = -1
            if initiative >= 1 or member.get("fighting") is True:
                members_patch.append({"id": member["id"], "initiative": -1})
        if members_patch:
            patch["enemy"].append({"id": encounter["id"], "members": members_patch})

    return patch


def _build_combat_exit_sync(context: dict) -> dict:
    merged = _merge_status_sync(
        {
            "inCombat": False,
            "participants": -1,
            "combatRound": -1,
            "combatTurnIndex": -1,
        },
        _reset_initiative_sync(context),
    )
    return _merge_status_sync(merged, _reset_fighting_sync(context))


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
    lines = ["参战角色（按下列顺序编号，与 d20 数值一一对应）："]
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


def _parse_trigger_json(text: str) -> bool | None:
    try:
        payload = json.loads((text or "").strip())
    except json.JSONDecodeError:
        return _parse_bool_token(text)
    if not isinstance(payload, dict) or set(payload) != {"triggered"}:
        return None
    value = payload.get("triggered")
    return value if isinstance(value, bool) else None


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
    return _extract_status_sync_loose(text)


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


def _get_combat_turn_index(context: dict) -> int:
    status = context.get("status") or {}
    try:
        value = int(status.get("combatTurnIndex", 0))
    except (TypeError, ValueError):
        value = 0
    return max(0, value)


def _set_combat_position(context: dict, turn_index: int, combat_round: int) -> None:
    status = dict(context.get("status") or {})
    status["combatTurnIndex"] = turn_index
    status["combatRound"] = combat_round
    context["status"] = status


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


def _find_player_character(team: list) -> dict | None:
    for char in team:
        if char.get("tier") == "player":
            return char
    for char in team:
        if char.get("id") == "pc":
            return char
    return team[0] if team else None


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
        if key in ("inCombat", "participants", "combatRound", "combatTurnIndex"):
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


def _is_player_character(context: dict, char_id: str | None, side: str) -> bool:
    if side != "team" or not char_id:
        return False
    for char in (context.get("status") or {}).get("team") or []:
        if not isinstance(char, dict) or char.get("id") != char_id:
            continue
        return char.get("id") == "pc" or char.get("tier") == "player"
    return char_id == "pc"


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


def _get_initiative_turn_order(context: dict) -> list[dict]:
    status = context.get("status") or {}
    entries: list[dict] = []

    for char in status.get("team") or []:
        if not isinstance(char, dict) or char.get("fighting") is not True:
            continue
        try:
            initiative = int(char.get("initiative"))
        except (TypeError, ValueError):
            continue
        if initiative < 1:
            continue
        entries.append({
            "id": char.get("id"),
            "name": char.get("name"),
            "initiative": initiative,
            "side": "team",
        })

    for encounter in status.get("enemy") or []:
        if not isinstance(encounter, dict):
            continue
        for member in encounter.get("members") or []:
            if not isinstance(member, dict) or member.get("fighting") is not True:
                continue
            try:
                initiative = int(member.get("initiative"))
            except (TypeError, ValueError):
                continue
            if initiative < 1:
                continue
            entries.append({
                "id": member.get("id"),
                "name": member.get("name"),
                "initiative": initiative,
                "side": "enemy",
            })

    entries.sort(key=lambda item: item["initiative"])
    _enrich_enemy_encounter_ids(entries, context)
    return entries


def _format_initiative_order_block(order: list[dict], context: dict) -> str:
    if not order:
        return "【先攻行动顺序】未生成"
    lines = ["【先攻行动顺序】（本场按此顺序逐角色行动，由 Python 循环调度）"]
    for index, entry in enumerate(order):
        role = "玩家" if _is_player_character(context, entry.get("id"), entry.get("side", "")) else "NPC"
        lines.append(
            f"- 队列 {index + 1}/{len(order)} | initiative={entry.get('initiative')} "
            f"| {role} | side={entry.get('side')} | id={entry.get('id')} | name={entry.get('name', '')}"
        )
    return "\n".join(lines)


def _format_turn_context_block(
    entry: dict,
    context: dict,
    combat_round: int,
    turn_index: int,
    total: int,
    initiative_order: list[dict] | None = None,
) -> str:
    role = "玩家" if _is_player_character(context, entry.get("id"), entry.get("side", "")) else "NPC"
    order = initiative_order or _get_initiative_turn_order(context)
    order_block = _format_initiative_order_block(order, context)
    return (
        f"{order_block}\n\n"
        "【当前行动角色·系统指定】\n"
        f"- 第 {combat_round} 回合 | 先攻队列 {turn_index + 1}/{total} "
        f"| initiative={entry.get('initiative')}\n"
        f"- {role} | side={entry.get('side')} | id={entry.get('id')} | name={entry.get('name', '')}\n"
        "- 本次只生成该角色本人的主动行动与检定；禁止代写其他角色行动或即时反击。"
    )


def _merge_turn_status_sync(result: ChatCompletionResult, context: dict) -> dict | None:
    return _normalize_status_sync(_extract_status_sync_from_result(result), context)


def _parse_combat_state_path(path: object) -> list[str | int] | None:
    if not isinstance(path, str) or not path.strip():
        return None
    tokens: list[str | int] = []
    cursor = 0
    for match in COMBAT_STATE_PATH.finditer(path):
        if match.start() != cursor:
            return None
        token = match.group(0)
        tokens.append(int(token[1:-1]) if token.startswith("[") else token)
        cursor = match.end()
        if cursor < len(path) and path[cursor] == ".":
            cursor += 1
    if cursor != len(path) or not tokens or tokens[0] not in COMBAT_STATE_ROOT_KEYS:
        return None
    return tokens


def _resolve_combat_state_parent(state: dict, tokens: list[str | int]) -> tuple[dict | list, str | int] | None:
    if len(tokens) < 1:
        return None
    current: dict | list = state
    for token in tokens[:-1]:
        if isinstance(current, dict):
            if not isinstance(token, str) or token not in current:
                return None
            current = current[token]
        elif isinstance(current, list):
            if not isinstance(token, int) or token < 0 or token >= len(current):
                return None
            current = current[token]
        else:
            return None
        if not isinstance(current, (dict, list)):
            return None
    return current, tokens[-1]


def _apply_combat_state_modifications(context: dict, payload: object) -> dict | None:
    """Apply the JSON-mode updater's whitelisted status paths to a status snapshot."""
    if not isinstance(payload, dict):
        return None
    modifications = payload.get("modifications")
    if not isinstance(modifications, list):
        return None

    updated = deepcopy(context.get("status") or {})
    changed = False
    for modification in modifications:
        if not isinstance(modification, dict):
            continue
        tokens = _parse_combat_state_path(modification.get("path"))
        if not tokens:
            print(f"[combat-test] state update ignored invalid path={modification.get('path')!r}")
            continue
        resolved = _resolve_combat_state_parent(updated, tokens)
        if not resolved:
            print(f"[combat-test] state update ignored unresolved path={modification.get('path')!r}")
            continue
        parent, leaf = resolved
        if isinstance(parent, dict):
            if not isinstance(leaf, str) or leaf not in parent:
                continue
            current = parent[leaf]
        else:
            if not isinstance(leaf, int) or leaf < 0 or leaf >= len(parent):
                continue
            current = parent[leaf]

        if "change" in modification:
            try:
                value = int(current) + int(modification["change"])
            except (TypeError, ValueError):
                continue
            value = str(value) if isinstance(current, str) else value
        elif modification.get("action") in {"add", "remove"}:
            if not isinstance(current, list) or "value" not in modification:
                continue
            value = list(current)
            if modification["action"] == "add" and modification["value"] not in value:
                value.append(modification["value"])
            if modification["action"] == "remove":
                value = [item for item in value if item != modification["value"]]
        elif "value" in modification:
            value = modification["value"]
        else:
            continue

        if isinstance(parent, dict):
            parent[leaf] = value
        else:
            parent[leaf] = value
        changed = True

    return updated if changed else {}


async def _generate_combat_state_sync(
    context: dict,
    narrative: str,
    *,
    actor: dict,
) -> dict | None:
    """Convert one completed combat narration into a reliable status patch via JSON mode."""
    system_prompt = build_game_system_prompt(
        load_battle_update_prompt(),
        "",
        context,
        channel="combat-test",
        panels=["status", "inventory"],
    )
    actor_name = actor.get("name") or actor.get("id") or "未知角色"
    messages = [{
        "role": "user",
        "content": (
            "请根据以下刚完成的战斗回合生成 JSON 状态修改。"
            "只输出 JSON 对象，不要解释。\n\n"
            f"当前行动者：{actor_name}（id={actor.get('id', '')}）\n"
            f"DM 回合输出：\n{narrative.strip()}"
        ),
    }]

    for attempt in range(1, 3):
        result = await deepseek_client.chat(
            messages,
            system=system_prompt,
            thinking=False,
            temperature=0,
            model=DEEPSEEK_COMBAT_MODEL,
            attach_user_patch=False,
            response_format=JSON_RESPONSE_FORMAT,
            max_tokens=COMBAT_STATE_UPDATE_MAX_TOKENS,
        )
        try:
            payload = json.loads(result.content)
        except (TypeError, json.JSONDecodeError):
            payload = None
        status_sync = _apply_combat_state_modifications(context, payload)
        if status_sync is not None:
            return status_sync
        print(f"[combat-test] state update attempt {attempt}/2 failed: invalid or empty JSON")
        messages[0]["content"] += "\n\n上一次输出无效。必须返回包含 modifications 数组的合法 JSON 对象。"
    return None


def _post_turn_checks(context: dict, turn_sync: dict | None) -> dict:
    patches: list[dict] = []
    end_reason = None

    if turn_sync:
        _apply_status_sync_to_context(context, turn_sync)
        patches.append(turn_sync)

    status = context.get("status") or {}
    if _is_team_wipe(status):
        end_reason = "team_wipe"
        context["inCombat"] = False
        patches.append({"inCombat": False})
    elif _is_enemy_wipe(status):
        end_reason = "enemy_wipe"
        context["inCombat"] = False
        patches.append({"inCombat": False})

    if not context.get("inCombat", False):
        exit_sync = _build_combat_exit_sync(context)
        print(f"[combat-test] combat ended => {end_reason or 'inCombat_false'}")
        merged = {}
        for patch in patches:
            merged = _merge_status_sync(merged, patch)
        return _merge_status_sync(merged, exit_sync)

    merged = {}
    for patch in patches:
        merged = _merge_status_sync(merged, patch)
    return merged


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
    combat_auto_continue: bool = False,
    combat_state_update: bool = False,
    combat_actor_id: str | None = None,
    suppress_display: bool = False,
) -> dict:
    cleaned = _resolve_display_content(result)
    response = deepseek_client.to_handler_response(cleaned)
    if pipeline_messages:
        response["pipelineMessages"] = pipeline_messages
    if status_sync:
        response["statusSync"] = status_sync
    if battle_state:
        response["battleState"] = battle_state
    if combat_auto_continue:
        response["combatAutoContinue"] = True
    if combat_state_update:
        response["combatStateUpdate"] = True
    if combat_actor_id:
        response["combatActorId"] = combat_actor_id
    if suppress_display:
        response["suppressDisplay"] = True
    return response


def _build_text_response(
    text: str,
    *,
    pipeline_messages: list[dict] | None = None,
    status_sync: dict | None = None,
    battle_state: str | None = None,
    combat_auto_continue: bool = False,
    combat_state_update: bool = False,
    combat_actor_id: str | None = None,
    suppress_display: bool = False,
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
    if combat_auto_continue:
        response["combatAutoContinue"] = True
    if combat_state_update:
        response["combatStateUpdate"] = True
    if combat_actor_id:
        response["combatActorId"] = combat_actor_id
    if suppress_display:
        response["suppressDisplay"] = True
    return response


async def _execute_character_turn(
    turn_messages: list[dict],
    last_user: str,
    context: dict,
    entry: dict,
    combat_round: int,
    turn_index: int,
    total_fighters: int,
    *,
    is_player: bool,
) -> ChatCompletionResult:
    dice_block = format_single_dice_block()
    initiative_order = _get_initiative_turn_order(context)
    turn_block = _format_turn_context_block(
        entry,
        context,
        combat_round,
        turn_index,
        total_fighters,
        initiative_order,
    )
    prompt_loader = load_battle_player_turn_prompt if is_player else load_battle_npc_turn_prompt
    rag_context = await retrieve_context(
        CHANNEL_COMBAT_TEST,
        last_user if is_player else str(entry.get("name") or ""),
        context,
    )
    system_prompt = build_game_system_prompt(
        prompt_loader(),
        rag_context,
        context,
        dice_results_block=dice_block,
        channel="combat-test",
        last_user=last_user if is_player else "",
    )
    system_prompt = (
        f"{system_prompt.rstrip()}\n\n{turn_block}\n\n"
        f"{COMBAT_ACTOR_ONLY_REMINDER}\n\n"
        f"{COMBAT_DOWN_REMINDER}"
    )

    actor_name = entry.get("name") or entry.get("id") or "未知"
    actor_id = entry.get("id") or ""
    messages = list(turn_messages)
    messages = _append_reminder(
        messages,
        f"【系统】只生成 {actor_name}（id={actor_id}）本回合主动行动，禁止其他角色主动行动或反击。",
    )
    if is_player:
        messages = _append_reminder(
            messages,
            f"【系统】请根据玩家最新输入处理该角色本轮行动：{last_user}",
        )

    user_patch = load_user_prompt_patch() if DEEPSEEK_USER_PROMPT_PATCH and is_player else None
    return await deepseek_client.chat(
        messages,
        system=system_prompt,
        user_patch=user_patch,
        thinking=True,
        temperature=0.5,
        model=DEEPSEEK_COMBAT_MODEL,
        attach_user_patch=bool(user_patch),
    )


async def _execute_single_combat_step(
    llm_messages: list[dict],
    last_user: str,
    context: dict,
    participants: int,
) -> dict:
    initiative_order = _get_initiative_turn_order(context)
    total_fighters = len(initiative_order)
    if total_fighters < 1:
        return _build_text_response(
            "[战斗错误] 先攻行动顺序为空，无法继续战斗。",
            battle_state="error",
        )

    turn_messages = list(llm_messages)
    turn_index = _get_combat_turn_index(context)
    if turn_index >= total_fighters:
        turn_index = 0
    combat_round = _get_combat_round(context)
    combat_continue = bool(context.get("combatContinue"))
    consume_player_input = not combat_continue

    print(
        f"[combat-test] step => round={combat_round} turn_index={turn_index} "
        f"continue={combat_continue} consume_player={consume_player_input} "
        f"actor={initiative_order[turn_index].get('id')}"
    )
    print(
        "[combat-test] order => "
        f"{[{'i': i, 'id': e.get('id'), 'name': e.get('name'), 'init': e.get('initiative')} for i, e in enumerate(initiative_order)]}"
    )

    prefix_parts: list[str] = []
    if turn_index == 0:
        prefix_parts.append(ROUND_START_TEMPLATE.format(round=combat_round))
        print(f"[combat-test] round {combat_round} start")

    entry = initiative_order[turn_index]
    is_player = _is_player_character(context, entry.get("id"), entry.get("side", ""))

    if is_player and not consume_player_input:
        player_name = entry.get("name") or "玩家"
        prompt = f"轮到{player_name}了。你要做什么？"
        pipeline_messages = [
            _dm_segment(part)
            for part in [*prefix_parts, prompt]
            if part and part.strip()
        ]
        status_sync = {
            "inCombat": True,
            "participants": participants,
            "combatRound": combat_round,
            "combatTurnIndex": turn_index,
        }
        _set_combat_position(context, turn_index, combat_round)
        return _build_text_response(
            prompt,
            pipeline_messages=pipeline_messages,
            status_sync=status_sync,
            battle_state="player_turn",
        )

    last_result = await _execute_character_turn(
        turn_messages,
        last_user,
        context,
        entry,
        combat_round,
        turn_index,
        total_fighters,
        is_player=is_player,
    )
    turn_messages.append({"role": "assistant", "content": last_result.content or ""})

    display = _resolve_display_content(last_result)
    actor_label = ACTOR_TURN_TEMPLATE.format(name=entry.get("name") or entry.get("id") or "未知")
    turn_text = "\n\n".join(part for part in [actor_label, display.content] if part and str(part).strip())
    pipeline_messages = [
        *[_dm_segment(part) for part in prefix_parts if part and part.strip()],
        _dm_segment(turn_text, reasoning=display.reasoning_content),
    ]

    return _build_handler_response(
        ChatCompletionResult(content=turn_text, reasoning_content=display.reasoning_content),
        pipeline_messages=pipeline_messages,
        battle_state="state_update_pending",
        combat_state_update=True,
        combat_actor_id=str(entry.get("id") or ""),
    )


def _latest_combat_narrative(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") not in {"dm", "assistant"}:
            continue
        content = str(message.get("content") or message.get("text") or "").strip()
        if content:
            return content
    return ""


async def _handle_combat_state_update(messages: list[dict], context: dict) -> dict:
    initiative_order = _get_initiative_turn_order(context)
    turn_index = _get_combat_turn_index(context)
    if not initiative_order or turn_index >= len(initiative_order):
        return _build_text_response(
            "[系统提示：找不到待更新的战斗回合，已暂停战斗。]",
            battle_state="state_sync_error",
        )

    entry = initiative_order[turn_index]
    expected_actor_id = str(context.get("combatActorId") or "")
    if expected_actor_id and entry.get("id") != expected_actor_id:
        return _build_text_response(
            "[系统提示：战斗回合与状态更新不匹配，已暂停战斗。]",
            battle_state="state_sync_error",
        )

    narrative = _latest_combat_narrative(messages)
    if not narrative:
        return _build_text_response(
            "[系统提示：未找到本回合叙事，无法更新面板。]",
            battle_state="state_sync_error",
        )

    turn_sync = await _generate_combat_state_sync(context, narrative, actor=entry)
    if turn_sync is None:
        print(f"[combat-test] turn ERROR: 状态更新失败，停止推进 id={entry.get('id')}")
        return _build_text_response(
            "[系统提示：本回合的状态更新未能生成，战斗已暂停以避免错误继续。]",
            battle_state="state_sync_error",
        )

    status_sync = _post_turn_checks(context, turn_sync)
    if not context.get("inCombat", False):
        print(f"[combat-test] step exit => combat ended after id={entry.get('id')}")
        return _build_text_response(
            "——战斗结束——",
            status_sync=status_sync,
            battle_state="ended",
        )

    participants = context.get("participants", -1)
    combat_round = _get_combat_round(context)
    turn_index += 1
    notices: list[str] = []
    if turn_index >= len(initiative_order):
        notices.append(ROUND_END_TEMPLATE.format(round=combat_round))
        print(f"[combat-test] round {combat_round} end")
        combat_round += 1
        turn_index = 0

    _set_combat_position(context, turn_index, combat_round)
    status_sync = _merge_status_sync(status_sync, {
        "inCombat": True,
        "participants": participants,
        "combatRound": combat_round,
        "combatTurnIndex": turn_index,
    })

    next_entry = initiative_order[turn_index]
    next_is_player = _is_player_character(context, next_entry.get("id"), next_entry.get("side", ""))
    if next_is_player:
        notices.append(f"轮到{next_entry.get('name') or '玩家'}了。你要做什么？")

    pipeline_messages = [_dm_segment(notice) for notice in notices]
    return _build_text_response(
        "\n\n".join(notices),
        pipeline_messages=pipeline_messages,
        status_sync=status_sync,
        battle_state="player_turn" if next_is_player else "ongoing",
        combat_auto_continue=not next_is_player,
        suppress_display=not notices,
    )


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

    if context.get("combatStateUpdate"):
        return await _handle_combat_state_update(messages, context)

    if not _debug_stage_reached("full"):
        return _build_text_response(
            f"[调试阻断] 当前 COMBAT_DEBUG_STAGE={COMBAT_DEBUG_STAGE}，战斗中分支未开放",
            battle_state="debug_blocked",
        )

    participants = context.get("participants", -1)
    return await _execute_single_combat_step(
        llm_messages,
        last_user,
        context,
        participants,
    )


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
        response_format=JSON_RESPONSE_FORMAT,
        max_tokens=128,
    )

    triggered = _parse_trigger_json(trigger_result.content)
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
    dice_results_block = format_initiative_block(participants)
    print(f"[combat-test] initiative input =>\n{fighters_block}\n{dice_results_block}")

    initiative_messages = [
        *llm_messages,
        {
            "role": "user",
            "content": (
                f"{fighters_block}\n\n"
                f"{dice_results_block}\n\n"
                "请根据以上参战角色列表（顺序已与 d20 数值一一对应）与骰子结果生成先攻顺序，"
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

    initiative_sync = _normalize_status_sync(
        _extract_status_sync(initiative_result.content),
        context,
    )
    status_sync = _merge_status_sync(
        status_sync,
        {
            "inCombat": True,
            "participants": participants,
            "combatRound": 1,
            "combatTurnIndex": 0,
        },
    )
    status_sync = _merge_status_sync(status_sync, initiative_sync)
    _apply_status_sync_to_context(context, status_sync)

    initiative_order = _get_initiative_turn_order(context)
    print(
        f"[combat-test] initiative => order="
        f"{[{'id': e.get('id'), 'initiative': e.get('initiative')} for e in initiative_order]}"
    )

    if not _debug_stage_reached("full"):
        return _build_handler_response(
            initiative_result,
            status_sync=status_sync,
            battle_state="debug_initiative",
        )

    return _build_handler_response(
        initiative_result,
        status_sync=status_sync,
        battle_state="initiative",
        combat_auto_continue=True,
    )
