import random
import re
from dataclasses import dataclass


CHINESE_COUNT = {
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}

FULLWIDTH_DIGIT = str.maketrans("０１２３４５６７８９", "0123456789")
ROLL_COUNT_DIGIT = re.compile(r"(?:投|掷)掷?\s*(\d+)\s*次")
ROLL_COUNT_CHINESE = re.compile(r"(?:投|掷)掷?\s*([一二两三四五六七八九十]+)\s*次")
ROLL_ONCE = re.compile(r"投一次|投1次|投\s*一\s*次")
CHECK_MARKER = re.compile(r"【鉴定】|鉴定")


@dataclass(frozen=True)
class DiceRollSpec:
    id: str
    sides: int


@dataclass(frozen=True)
class DiceRollResult:
    id: str
    sides: int
    value: int


def _normalize_roll_text(text: str) -> str:
    return (text or "").strip().translate(FULLWIDTH_DIGIT)


def _parse_chinese_count(token: str) -> int | None:
    if token in CHINESE_COUNT:
        return CHINESE_COUNT[token]
    if token == "十":
        return 10
    if len(token) == 2 and token[0] == "十" and token[1] in CHINESE_COUNT:
        return 10 + CHINESE_COUNT[token[1]]
    if len(token) == 2 and token[0] in CHINESE_COUNT and token[1] == "十":
        return CHINESE_COUNT[token[0]] * 10
    return None


def _parse_count(text: str) -> int | None:
    digit_matches = list(ROLL_COUNT_DIGIT.finditer(text))
    if digit_matches:
        return max(1, int(digit_matches[-1].group(1)))

    chinese_matches = list(ROLL_COUNT_CHINESE.finditer(text))
    if chinese_matches:
        count = _parse_chinese_count(chinese_matches[-1].group(1))
        if count is not None:
            return max(1, count)

    if re.match(r"^\s*(?:投|掷)", text) and ROLL_ONCE.search(text):
        return 1

    return None


def _parse_sides(text: str) -> int:
    match = re.search(r"d(\d+)", text, re.IGNORECASE)
    if match:
        return max(1, int(match.group(1)))

    match = re.search(r"(\d+)\s*面", text)
    if match:
        return max(1, int(match.group(1)))

    return 20


def _has_check_marker(text: str) -> bool:
    return bool(CHECK_MARKER.search(text))


def parse_roll_request(text: str) -> list[DiceRollSpec] | None:
    cleaned = _normalize_roll_text(text)
    if not cleaned:
        return None

    has_throw = bool(re.search(r"(?:投|掷)", cleaned))
    has_check = _has_check_marker(cleaned)

    if not has_throw and not has_check:
        return None

    count = _parse_count(cleaned)
    if count is None and has_check:
        count = 1
    if count is None:
        return None

    sides = _parse_sides(cleaned)
    return [DiceRollSpec(id=f"roll{index}", sides=sides) for index in range(1, count + 1)]


def execute_rolls(specs: list[DiceRollSpec]) -> list[DiceRollResult]:
    results: list[DiceRollResult] = []
    for spec in specs:
        value = random.randint(1, spec.sides)
        results.append(DiceRollResult(id=spec.id, sides=spec.sides, value=value))
    return results


def format_dice_results_block(results: list[DiceRollResult]) -> str:
    if not results:
        return ""

    lines = [
        "## 本轮系统骰结果（只读）",
        "",
        f"共 {len(results)} 次投掷。以下数字已由系统随机生成并锁定。",
        "你必须原样使用这些值进行叙述，每一轮对应一个 id。",
        "禁止自行随机、修改、重掷，或在思考中重新生成数字。",
        "",
    ]
    for item in results:
        lines.append(f"- {item.id}（d{item.sides}）：{item.value}")
    lines.append("")
    lines.append("请按 roll1 → roll2 → … 的顺序逐轮输出：数字、区间判断、朋友反应、敌人反应。")
    return "\n".join(lines)
