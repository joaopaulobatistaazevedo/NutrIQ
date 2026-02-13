import json
from pathlib import Path
from typing import Any, Dict


BASE_DIR = Path(__file__).resolve().parent.parent


def load_prompt(prompt_path: str) -> str:
    full_path = BASE_DIR / prompt_path
    return full_path.read_text(encoding="utf-8")


def safe_json_loads(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}

    text = raw.strip()
    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}
