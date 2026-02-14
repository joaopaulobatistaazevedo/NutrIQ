from __future__ import annotations

import re
import unicodedata


def normalize_text(text: str) -> str:
    raw = unicodedata.normalize("NFKD", text)
    ascii_text = raw.encode("ascii", "ignore").decode("ascii")
    compact = re.sub(r"[^a-zA-Z0-9\s]", " ", ascii_text).lower()
    return re.sub(r"\s+", " ", compact).strip()
