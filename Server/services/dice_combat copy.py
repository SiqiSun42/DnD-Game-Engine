import random
from dataclasses import dataclass


COMBAT_DICE_SPECS: tuple[tuple[str, int], ...] = (
    ("d20", 20),
    ("d4", 4),
    ("d6(1)", 6),
    ("d6(2)", 6),
    ("d8", 8),
    ("d10", 10),
    ("d12", 12),
)

COMBAT_DICE_ERROR = "Error: 无法生成骰子（参与人数无效）"

PRIMARY_SET_TITLE = "第一组（主要动作 / 先攻顺序）"
PRIMARY_SET_NOTE = "用于标准行动、攻击检定、先攻顺序等。"

BONUS_SET_TITLE = "第二组（附加动作）"
BONUS_SET_NOTE = "用于附加行动、附赠动作等。未使用时请勿引用。"


@dataclass(frozen=True)
class CombatDiceLine:
    label: str
    sides: int
    values: tuple[int, ...]


@dataclass(frozen=True)
class CombatDiceRollSets:
    primary: tuple[CombatDiceLine, ...]
    bonus: tuple[CombatDiceLine, ...]


def is_valid_combat_roll_count(count: int) -> bool:
    try:
        return int(count) >= 1
    except (TypeError, ValueError):
        return False


def roll_combat_value(sides: int) -> int:
    return random.randint(1, max(1, sides))


def _roll_combat_lines(count: int) -> list[CombatDiceLine]:
    roll_count = int(count)
    lines: list[CombatDiceLine] = []
    for label, sides in COMBAT_DICE_SPECS:
        values = tuple(roll_combat_value(sides) for _ in range(roll_count))
        lines.append(CombatDiceLine(label=label, sides=sides, values=values))
    return lines


def execute_combat_rolls(count: int) -> CombatDiceRollSets | None:
    if not is_valid_combat_roll_count(count):
        return None
    return CombatDiceRollSets(
        primary=tuple(_roll_combat_lines(count)),
        bonus=tuple(_roll_combat_lines(count)),
    )


def format_combat_dice_line(line: CombatDiceLine) -> str:
    joined = ",".join(str(value) for value in line.values)
    return f"{line.label}:{{{joined}}}"


def _format_combat_dice_set(title: str, note: str, lines: tuple[CombatDiceLine, ...]) -> str:
    body = "\n".join(format_combat_dice_line(line) for line in lines)
    return f"## {title}\n{note}\n\n{body}"


def format_combat_dice_block(
    count: int,
    roll_sets: CombatDiceRollSets | None = None,
) -> str:
    if not is_valid_combat_roll_count(count):
        return COMBAT_DICE_ERROR
    results = roll_sets if roll_sets is not None else execute_combat_rolls(count)
    if not results:
        return COMBAT_DICE_ERROR
    return "\n\n".join([
        _format_combat_dice_set(PRIMARY_SET_TITLE, PRIMARY_SET_NOTE, results.primary),
        _format_combat_dice_set(BONUS_SET_TITLE, BONUS_SET_NOTE, results.bonus),
    ])
