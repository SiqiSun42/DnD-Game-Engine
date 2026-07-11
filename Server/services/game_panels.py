import json

PANEL_STATUS = "status"
PANEL_INVENTORY = "inventory"
PANEL_CHARACTERS = "characters"
PANEL_WORLD = "world"
PANEL_NOTES = "notes"

PANEL_LABELS = {
    PANEL_STATUS: "状态",
    PANEL_INVENTORY: "背包",
    PANEL_CHARACTERS: "人物档案",
    PANEL_WORLD: "世界",
    PANEL_NOTES: "笔记与任务",
}

PANEL_KEYWORDS: dict[str, tuple[str, ...]] = {
    PANEL_INVENTORY: (
        "背包", "物品", "装备", "金币", "inventory", "药水", "武器", "护甲", "财产",
    ),
    PANEL_CHARACTERS: (
        "人物", "档案", "性格", "characters", "npc", "队友", "盟友",
    ),
    PANEL_WORLD: (
        "地点", "世界", "地图", "location", "环境", "场景", "世界面板",
    ),
    PANEL_NOTES: (
        "任务", "笔记", "quest", "devplot", "剧情", "大纲",
    ),
    PANEL_STATUS: (
        "状态", "hp", "生命", "先攻", "战斗", "敌人", "status", "护甲", "ac",
    ),
}

CHANNEL_DEFAULT_PANELS: dict[str, tuple[str, ...]] = {
    "game": (PANEL_STATUS, PANEL_INVENTORY, PANEL_NOTES),
    "combat-test": tuple(PANEL_LABELS.keys()),
    "check-test": (PANEL_STATUS, PANEL_INVENTORY),
}


def _panel_available(context: dict | None, panel_id: str) -> bool:
    if not context:
        return False
    if panel_id == PANEL_STATUS:
        return bool(context.get("status"))
    if panel_id == PANEL_INVENTORY:
        return bool(context.get("inventory"))
    if panel_id == PANEL_CHARACTERS:
        return bool(context.get("characters"))
    if panel_id == PANEL_WORLD:
        return bool(context.get("world") or context.get("locationNode"))
    if panel_id == PANEL_NOTES:
        return bool(
            context.get("currentQuests")
            or context.get("devPlotTree")
            or context.get("historyQuests"),
        )
    return False


def _summarize_status(context: dict) -> str:
    status = context.get("status") or {}
    team_count = len(status.get("team") or [])
    enemy_encounters = status.get("enemy") or []
    enemy_count = sum(len(enc.get("members") or []) for enc in enemy_encounters if isinstance(enc, dict))
    in_combat = status.get("inCombat")
    parts = [f"team {team_count} 人"]
    if enemy_count:
        parts.append(f"enemy {enemy_count} 人（{len(enemy_encounters)} 场遭遇）")
    if in_combat:
        parts.append(f"战斗中 participants={status.get('participants', -1)}")
    return "，".join(parts)


def _summarize_inventory(context: dict) -> str:
    inventory = context.get("inventory") or {}
    categories = inventory.get("categories") or {}
    counts = []
    for key, items in categories.items():
        if isinstance(items, list) and items:
            counts.append(f"{key} {len(items)}")
    wealth = inventory.get("wealth") or context.get("wealth") or "未知"
    summary = "，".join(counts) if counts else "无物品"
    return f"wealth={wealth}；{summary}"


def _summarize_characters(context: dict) -> str:
    characters = context.get("characters") or {}
    names = []
    for key in ("party", "chapter"):
        for item in characters.get(key) or []:
            if isinstance(item, dict) and item.get("name"):
                names.append(str(item["name"]))
    if not names:
        return "无人物档案"
    shown = "、".join(names[:8])
    if len(names) > 8:
        shown += f" 等共 {len(names)} 人"
    return shown


def _summarize_world(context: dict) -> str:
    location = context.get("location") or "未知地点"
    node = context.get("locationNode") or {}
    description = node.get("description") or context.get("locationDescription") or ""
    if description:
        return f"当前：{location}（{description[:40]}…）" if len(description) > 40 else f"当前：{location}（{description}）"
    return f"当前：{location}"


def _summarize_notes(context: dict) -> str:
    quests = context.get("currentQuests") or []
    has_plot = bool(context.get("devPlotTree"))
    parts = [f"当前任务 {len(quests)} 条"]
    if has_plot:
        parts.append("含 devPlotTree")
    return "，".join(parts)


def _summarize_panel(context: dict, panel_id: str) -> str:
    if panel_id == PANEL_STATUS:
        return _summarize_status(context)
    if panel_id == PANEL_INVENTORY:
        return _summarize_inventory(context)
    if panel_id == PANEL_CHARACTERS:
        return _summarize_characters(context)
    if panel_id == PANEL_WORLD:
        return _summarize_world(context)
    if panel_id == PANEL_NOTES:
        return _summarize_notes(context)
    return ""


def build_panel_index(context: dict | None) -> str:
    if not context:
        return "（无存档面板数据）"
    lines = [
        "以下面板数据存在于当前存档，系统每轮会自动挂载与本回合相关的完整数据。",
        "未出现在下方「已挂载面板」中的面板，本轮不可引用其具体字段。",
        "",
    ]
    for panel_id, label in PANEL_LABELS.items():
        if not _panel_available(context, panel_id):
            continue
        lines.append(f"- **{label}** (`{panel_id}`)：{_summarize_panel(context, panel_id)}")
    return "\n".join(lines)


def resolve_panels_for_turn(
    channel: str,
    context: dict | None,
    last_user: str = "",
    *,
    explicit: list[str] | None = None,
) -> list[str]:
    if explicit is not None:
        return [panel for panel in explicit if _panel_available(context, panel)]

    selected = set(CHANNEL_DEFAULT_PANELS.get(channel, (PANEL_STATUS, PANEL_INVENTORY)))
    if context and context.get("inCombat"):
        selected.update((PANEL_STATUS, PANEL_INVENTORY))

    text = (last_user or "").lower()
    for panel_id, keywords in PANEL_KEYWORDS.items():
        if any(keyword.lower() in text for keyword in keywords):
            selected.add(panel_id)

    ordered = [panel for panel in PANEL_LABELS if panel in selected and _panel_available(context, panel)]
    return ordered


def extract_panel_payload(context: dict, panel_id: str) -> dict | list | None:
    if panel_id == PANEL_STATUS:
        return context.get("status")
    if panel_id == PANEL_INVENTORY:
        return context.get("inventory")
    if panel_id == PANEL_CHARACTERS:
        return context.get("characters")
    if panel_id == PANEL_WORLD:
        world = context.get("world")
        if isinstance(world, dict) and world:
            return world
        return {
            "defaultLocationId": None,
            "location": context.get("location"),
            "locationDescription": context.get("locationDescription"),
            "locationNode": context.get("locationNode"),
        }
    if panel_id == PANEL_NOTES:
        return {
            "currentQuests": context.get("currentQuests") or [],
            "historyQuests": context.get("historyQuests") or {"pages": []},
            "devPlotTree": context.get("devPlotTree"),
            "defaultDevPlotEntryId": context.get("defaultDevPlotEntryId"),
        }
    return None


def format_game_meta(context: dict | None) -> str:
    if not context:
        return "（未提供游戏状态）"
    meta = {
        "saveName": context.get("saveName"),
        "location": context.get("location"),
        "locationDescription": context.get("locationDescription"),
        "inCombat": context.get("inCombat", False),
        "participants": context.get("participants", -1),
        "wealth": context.get("wealth") or (context.get("inventory") or {}).get("wealth"),
    }
    return f"```json\n{json.dumps(meta, ensure_ascii=False, indent=2)}\n```"


def format_game_panels_block(
    context: dict | None,
    *,
    channel: str = "game",
    last_user: str = "",
    panels: list[str] | None = None,
) -> str:
    if not context:
        return "（未提供游戏状态，请仅依据对话历史推进，勿擅自假设具体数值。）"

    resolved = resolve_panels_for_turn(channel, context, last_user, explicit=panels)
    sections = [
        "## 面板索引\n\n" + build_panel_index(context),
        "## 当前概要\n\n" + format_game_meta(context),
    ]

    if resolved:
        sections.append("## 已挂载面板（本轮可引用）")
        for panel_id in resolved:
            payload = extract_panel_payload(context, panel_id)
            if payload is None:
                continue
            label = PANEL_LABELS.get(panel_id, panel_id)
            sections.append(
                f"### {label} (`{panel_id}`)\n\n"
                f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```",
            )
    else:
        sections.append("## 已挂载面板（本轮可引用）\n\n（本轮无完整面板挂载，仅可使用「当前概要」。）")

    return "\n\n".join(sections)


def format_game_context(context: dict | None) -> str:
    return format_game_panels_block(context)
