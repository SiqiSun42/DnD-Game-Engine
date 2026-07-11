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


def roll_combat_value(sides: int) -> int:
    return random.randint(1, max(1, sides))


def _roll_combat_lines() -> list[CombatDiceLine]:
    lines: list[CombatDiceLine] = []
    for label, sides in COMBAT_DICE_SPECS:
        value = roll_combat_value(sides)
        lines.append(CombatDiceLine(label=label, sides=sides, values=(value,)))
    return lines


def execute_single_roll() -> CombatDiceRollSets:
    return CombatDiceRollSets(
        primary=tuple(_roll_combat_lines()),
        bonus=tuple(_roll_combat_lines()),
    )


def format_combat_dice_line(line: CombatDiceLine) -> str:
    joined = ",".join(str(value) for value in line.values)
    return f"{line.label}:{{{joined}}}"


def _format_combat_dice_set(title: str, note: str, lines: tuple[CombatDiceLine, ...]) -> str:
    body = "\n".join(format_combat_dice_line(line) for line in lines)
    return f"## {title}\n{note}\n\n{body}"


def format_single_dice_block() -> str:
    results = execute_single_roll()
    return "\n\n".join([
        _format_combat_dice_set(PRIMARY_SET_TITLE, PRIMARY_SET_NOTE, results.primary),
        _format_combat_dice_set(BONUS_SET_TITLE, BONUS_SET_NOTE, results.bonus),
    ])