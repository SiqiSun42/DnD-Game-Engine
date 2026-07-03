def _page_for_pos(pos: int, markers: list[tuple[int, int]]) -> int:
    page = markers[0][1] if markers else 1
    for offset, page_num in markers:
        if offset <= pos:
            page = page_num
        else:
            break
    return page


def chunk_book(
    book_id: str,
    book_title: str,
    pages: list[dict],
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict]:
    if not pages:
        return []

    text_parts: list[str] = []
    markers: list[tuple[int, int]] = []
    cursor = 0

    for page in pages:
        if text_parts:
            text_parts.append("\n\n")
            cursor += 2
        markers.append((cursor, page["page"]))
        text_parts.append(page["text"])
        cursor += len(page["text"])

    full_text = "".join(text_parts)
    if not full_text.strip():
        return []

    chunks: list[dict] = []
    start = 0
    index = 0

    while start < len(full_text):
        end = min(start + chunk_size, len(full_text))
        piece = full_text[start:end].strip()
        if piece:
            page_start = _page_for_pos(start, markers)
            page_end = _page_for_pos(max(end - 1, start), markers)
            chunks.append({
                "id": f"{book_id}_{index:05d}",
                "book_id": book_id,
                "book_title": book_title,
                "text": piece,
                "page_start": page_start,
                "page_end": page_end,
            })
            index += 1
        if end >= len(full_text):
            break
        start = max(end - chunk_overlap, start + 1)

    return chunks
