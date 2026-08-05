import gc
import io

from app.config import settings

MAX_SOURCE_CHARS = 150_000  # Cap source text at ~150k chars (~30,000 words) to protect 512 MB RAM limit


def extract_text_from_pdf(file_bytes: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text: list[str] = []
    total_len = 0

    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if text:
            pages_text.append(text)
            total_len += len(text)
            if total_len >= MAX_SOURCE_CHARS:
                break

    full_text = "\n\n".join(pages_text)
    if len(full_text) > MAX_SOURCE_CHARS:
        full_text = full_text[:MAX_SOURCE_CHARS]

    del reader
    del pages_text
    gc.collect()

    return full_text


def _merge_splits(splits: list[str], separator: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    docs: list[str] = []
    current_doc: list[str] = []
    total = 0
    sep_len = len(separator)

    for d in splits:
        len_d = len(d)
        if total + len_d + (sep_len if current_doc else 0) > chunk_size:
            if total > 0:
                doc_str = separator.join(current_doc).strip()
                if doc_str:
                    docs.append(doc_str)
                while current_doc and (
                    total > chunk_overlap
                    or total + len_d + (sep_len if current_doc else 0) > chunk_size
                ):
                    popped = current_doc.pop(0)
                    total -= len(popped) + (sep_len if len(current_doc) > 0 else 0)
        current_doc.append(d)
        total += len_d + (sep_len if len(current_doc) > 1 else 0)

    if current_doc:
        doc_str = separator.join(current_doc).strip()
        if doc_str:
            docs.append(doc_str)

    return docs


def _recursive_split(
    text: str, chunk_size: int, chunk_overlap: int, separators: list[str]
) -> list[str]:
    final_chunks: list[str] = []

    separator = separators[-1]
    new_separators = []
    for i, s in enumerate(separators):
        if s == "":
            separator = s
            break
        if s in text:
            separator = s
            new_separators = separators[i + 1:]
            break

    splits = text.split(separator) if separator else list(text)

    good_splits: list[str] = []
    for s in splits:
        if len(s) < chunk_size:
            good_splits.append(s)
        else:
            if good_splits:
                merged = _merge_splits(good_splits, separator, chunk_size, chunk_overlap)
                final_chunks.extend(merged)
                good_splits = []
            if not new_separators:
                final_chunks.append(s[:chunk_size])
            else:
                other_chunks = _recursive_split(s, chunk_size, chunk_overlap, new_separators)
                final_chunks.extend(other_chunks)

    if good_splits:
        merged = _merge_splits(good_splits, separator, chunk_size, chunk_overlap)
        final_chunks.extend(merged)

    return final_chunks


def chunk_text(text: str, chunk_size: int | None = None, chunk_overlap: int | None = None) -> list[str]:
    c_size = chunk_size or settings.CHUNK_SIZE
    c_overlap = chunk_overlap or settings.CHUNK_OVERLAP
    separators = ["\n\n", "\n", ". ", " ", ""]

    chunks = _recursive_split(text, c_size, c_overlap, separators)
    cleaned = [c.strip() for c in chunks if c.strip()]
    gc.collect()
    return cleaned

