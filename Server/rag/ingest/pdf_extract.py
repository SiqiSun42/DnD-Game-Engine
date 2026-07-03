from pathlib import Path

import fitz


def extract_pages(pdf_path: str | Path) -> list[dict]:
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path}")

    doc = fitz.open(path)
    pages = []
    for index in range(doc.page_count):
        text = doc[index].get_text("text").strip()
        if text:
            pages.append({"page": index + 1, "text": text})
    doc.close()
    return pages
