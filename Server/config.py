import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}


DEEPSEEK_THINKING_ENABLED = _env_flag("DEEPSEEK_THINKING_ENABLED")
_user_prompt_patch = os.getenv("DEEPSEEK_USER_PROMPT_PATCH")
if _user_prompt_patch is None:
    _user_prompt_patch = os.getenv("DEEPSEEK_MERGE_SYSTEM_INTO_USER", "false")
DEEPSEEK_USER_PROMPT_PATCH = _user_prompt_patch.lower() in {"1", "true", "yes", "on"}

PROJECT_ROOT = Path(__file__).resolve().parent.parent
UI_ROOT = PROJECT_ROOT / "UI"
PROMPT_ROOT = PROJECT_ROOT / "Prompt"
