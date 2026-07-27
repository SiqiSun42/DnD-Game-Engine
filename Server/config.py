import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "").rstrip("/")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "")
DEEPSEEK_COMBAT_MODEL = os.getenv("DEEPSEEK_COMBAT_MODEL", "")

def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}


DEEPSEEK_THINKING_ENABLED = _env_flag("DEEPSEEK_THINKING_ENABLED")
_user_prompt_patch = os.getenv("DEEPSEEK_USER_PROMPT_PATCH")
if _user_prompt_patch is None:
    _user_prompt_patch = os.getenv("DEEPSEEK_MERGE_SYSTEM_INTO_USER", "false")
DEEPSEEK_USER_PROMPT_PATCH = _user_prompt_patch.lower() in {"1", "true", "yes", "on"}

_ollama_max_tokens = os.getenv("OLLAMA_MAX_TOKENS", "").strip()
OLLAMA_MAX_TOKENS = int(_ollama_max_tokens) if _ollama_max_tokens.isdigit() else None

PROJECT_ROOT = Path(__file__).resolve().parent.parent
UI_ROOT = PROJECT_ROOT / "UI"
PROMPT_ROOT = PROJECT_ROOT / "Prompt"
