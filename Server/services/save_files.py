import json
from pathlib import Path

from config import PROJECT_ROOT

SAVES_ROOT = PROJECT_ROOT / "Data" / "Saves"


def load_save_json_files(save_name: str) -> dict[str, object]:
    if not save_name or not save_name.strip():
        return {}
    save_dir = SAVES_ROOT / save_name.strip()
    if not save_dir.is_dir():
        return {}

    result: dict[str, object] = {}
    for path in sorted(save_dir.rglob("*.json")):
        if not path.is_file():
            continue
        rel = path.relative_to(save_dir).as_posix()
        try:
            result[rel] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
    return result
