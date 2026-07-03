from config import PROMPT_ROOT


def load_prompt(relative_path: str) -> str:
    path = PROMPT_ROOT / relative_path
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def append_rag_context(base_prompt: str, rag_context: str, section_title: str = "相关规则摘录") -> str:
    if not rag_context.strip():
        return base_prompt
    return f"{base_prompt.rstrip()}\n\n## {section_title}\n\n{rag_context.strip()}"
