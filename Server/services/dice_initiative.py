import random
from dataclasses import dataclass


@dataclass(frozen=True)
class InitiativeDiceLine:
    label: str
    sides: int
    values: tuple[int, ...]


def roll_initiative_value(sides: int) -> int:
    return random.randint(1, max(1, sides))


def execute_initiative_rolls(count: int) -> InitiativeDiceLine | None:
    if not isinstance(count, int) or count < 1:
        return None
    
    values = tuple(roll_initiative_value(20) for _ in range(count))
    return InitiativeDiceLine(label="d20", sides=20, values=values)


def format_initiative_line(line: InitiativeDiceLine) -> str:
    joined = ",".join(str(value) for value in line.values)
    return f"{line.label}:{{{joined}}}"


def format_initiative_block(count: int) -> str:
    line = execute_initiative_rolls(count)
    if not line:
        return "Error: 无法生成先攻骰子"
    
    return f"## 先攻顺序判定\n用于先攻顺序判定。\n\n{format_initiative_line(line)}"