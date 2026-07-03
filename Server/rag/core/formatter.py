def format_segment(segment: dict, index: int) -> str:
    book_title = segment.get("book_title") or segment.get("book_id") or "未知来源"
    page_start = segment.get("page_start")
    page_end = segment.get("page_end")
    if page_start and page_end and page_start != page_end:
        source = f"{book_title} P.{page_start}-{page_end}"
    elif page_start:
        source = f"{book_title} P.{page_start}"
    else:
        source = book_title
    text = (segment.get("text") or "").strip()
    return f"### 摘录 {index + 1}（{source}）\n{text}"


def format_segments(segments: list[dict]) -> str:
    if not segments:
        return ""
    return "\n\n".join(format_segment(segment, i) for i, segment in enumerate(segments))
