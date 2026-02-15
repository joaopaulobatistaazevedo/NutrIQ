import json
import threading
import time
from pathlib import Path
from typing import Any, Dict


class UserMemoryStore:
    def __init__(self, file_path: Path, max_users: int = 1000, max_recipe_ids_per_user: int = 120) -> None:
        self._file_path = file_path
        self._max_users = max(100, max_users)
        self._max_recipe_ids_per_user = max(20, max_recipe_ids_per_user)
        self._lock = threading.Lock()
        self._data: Dict[str, Dict[str, Any]] = {}
        self._load()

    def get(self, user_id: str) -> Dict[str, Any]:
        key = (user_id or "anonymous").strip() or "anonymous"
        with self._lock:
            existing = self._data.get(key)
            if isinstance(existing, dict):
                return dict(existing)

            created = self._default_memory()
            self._data[key] = created
            self._enforce_limits_locked()
            self._save_locked()
            return dict(created)

    def upsert(self, user_id: str, memory: Dict[str, Any]) -> Dict[str, Any]:
        key = (user_id or "anonymous").strip() or "anonymous"
        sanitized = self._sanitize_memory(memory)
        with self._lock:
            self._data[key] = sanitized
            self._enforce_limits_locked()
            self._save_locked()
            return dict(sanitized)

    def _default_memory(self) -> Dict[str, Any]:
        return {
            "favorite_foods": [],
            "disliked_ingredients": [],
            "recent_recipe_ids": [],
            "goal": "maintain",
            "planning_days": 7,
            "max_weekly_budget": None,
            "updated_at": int(time.time()),
        }

    def _sanitize_memory(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        default = self._default_memory()

        if not isinstance(raw, dict):
            return default

        memory = dict(default)
        for key in ("favorite_foods", "disliked_ingredients"):
            values = raw.get(key)
            if isinstance(values, list):
                memory[key] = [str(v).strip() for v in values if str(v).strip()][:80]

        values = raw.get("recent_recipe_ids")
        if isinstance(values, list):
            unique: list[int] = []
            seen: set[int] = set()
            for value in values:
                parsed = self._parse_positive_int(value)
                if parsed is None or parsed in seen:
                    continue
                seen.add(parsed)
                unique.append(parsed)
            memory["recent_recipe_ids"] = unique[-self._max_recipe_ids_per_user :]

        goal = raw.get("goal")
        if isinstance(goal, str) and goal.strip():
            memory["goal"] = goal.strip()

        planning_days = self._parse_positive_int(raw.get("planning_days"))
        if planning_days is not None:
            memory["planning_days"] = max(1, min(7, planning_days))

        budget = raw.get("max_weekly_budget")
        if isinstance(budget, (int, float)):
            memory["max_weekly_budget"] = float(budget)

        memory["updated_at"] = int(time.time())
        return memory

    def _parse_positive_int(self, value: Any) -> int | None:
        if isinstance(value, int):
            return value if value > 0 else None
        if isinstance(value, str) and value.isdigit():
            parsed = int(value)
            return parsed if parsed > 0 else None
        return None

    def _load(self) -> None:
        if not self._file_path.exists():
            self._file_path.parent.mkdir(parents=True, exist_ok=True)
            self._file_path.write_text("{}", encoding="utf-8")
            self._data = {}
            return

        try:
            raw = json.loads(self._file_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                sanitized: Dict[str, Dict[str, Any]] = {}
                for key, value in raw.items():
                    if not isinstance(key, str):
                        continue
                    sanitized[key] = self._sanitize_memory(value if isinstance(value, dict) else {})
                self._data = sanitized
            else:
                self._data = {}
        except Exception:
            self._data = {}

    def _save_locked(self) -> None:
        self._file_path.parent.mkdir(parents=True, exist_ok=True)
        self._file_path.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _enforce_limits_locked(self) -> None:
        if len(self._data) <= self._max_users:
            return

        ordered = sorted(
            self._data.items(),
            key=lambda item: int((item[1] or {}).get("updated_at") or 0),
            reverse=True,
        )
        kept = ordered[: self._max_users]
        self._data = {key: value for key, value in kept}
