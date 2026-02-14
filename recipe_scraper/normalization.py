from __future__ import annotations

import re
import unicodedata

STOPWORDS = {
    "de",
    "da",
    "do",
    "das",
    "dos",
    "com",
    "para",
    "q.b",
    "qb",
    "a",
    "o",
    "e",
}


def normalize_text(value: str) -> str:
    raw = unicodedata.normalize("NFKD", value)
    ascii_text = raw.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", ascii_text).lower()
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_ingredient_line(line: str) -> str:
    text = normalize_text(line)
    text = re.sub(r"\b\d+(?:[.,]\d+)?\b", " ", text)
    tokens = [token for token in text.split() if token not in STOPWORDS]
    return " ".join(tokens).strip()


def normalize_ingredient_query(items: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        value = normalize_ingredient_line(item)
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized
