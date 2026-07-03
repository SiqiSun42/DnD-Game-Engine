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


def append_rag_miss_notice(base_prompt: str) -> str:
    notice = (
        "## 本次检索状态\n\n"
        "规则书中未检索到与当前问题直接相关的摘录。"
    )
    return f"{base_prompt.rstrip()}\n\n{notice}"


def build_consult_system_prompt(base_prompt: str, rag_context: str, rag_hit: bool) -> str:
    if rag_hit and rag_context.strip():
        return append_rag_context(base_prompt, rag_context)
    return append_rag_miss_notice(base_prompt)

