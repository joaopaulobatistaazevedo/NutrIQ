import json
from typing import Any, Dict, Iterable, Optional
from urllib import error, request

from config.settings import get_settings


class BackendService:
    VALID_RESTRICTIONS = {
        "VEGETARIAN",
        "VEGAN",
        "GLUTEN_FREE",
        "LACTOSE_FREE",
        "HALAL",
        "KOSHER",
        "LOW_CARB",
        "LOW_FAT",
        "HIGH_PROTEIN",
    }

    VALID_ALLERGENS = {
        "GLUTEN",
        "CRUSTACEANS",
        "EGGS",
        "FISH",
        "PEANUTS",
        "SOYBEANS",
        "MILK",
        "NUTS",
        "CELERY",
        "MUSTARD",
        "SESAME",
        "SULPHITES",
        "LUPIN",
        "MOLLUSCS",
    }

    def __init__(self) -> None:
        self.settings = get_settings()

    def persist_user_chat_data(self, auth_token: Optional[str], data: Dict[str, Any]) -> bool:
        if not auth_token:
            return False

        payload = self._build_profile_update_payload(data)
        if not payload:
            return False

        return self._update_profile(auth_token, payload)

    def _build_profile_update_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}

        max_budget = data.get("max_weekly_budget")
        if isinstance(max_budget, (int, float)):
            payload["maxWeeklyBudget"] = float(max_budget)

        restrictions = self._normalize_items(data.get("restrictions"), self.VALID_RESTRICTIONS)
        if restrictions:
            payload["restrictions"] = restrictions

        allergens = self._normalize_items(data.get("allergens"), self.VALID_ALLERGENS)
        if allergens:
            payload["allergens"] = allergens

        # ignorados e nunca chegavam ao backend
        favorite_foods = self._normalize_string_list(data.get("favorite_foods"))
        if favorite_foods:
            payload["favoriteFoods"] = favorite_foods

        disliked_ingredients = self._normalize_string_list(data.get("disliked_ingredients"))
        if disliked_ingredients:
            payload["dislikedIngredients"] = disliked_ingredients

        return payload

    def _normalize_string_list(self, raw: Any) -> list[str]:
        """Normaliza uma lista de strings, removendo vazios e duplicados."""
        if raw is None:
            return []
        items = raw if isinstance(raw, list) else [raw]
        seen: set[str] = set()
        result = []
        for item in items:
            if not isinstance(item, str):
                continue
            clean = item.strip()
            if clean and clean not in seen:
                seen.add(clean)
                result.append(clean)
        return result

    def _normalize_items(self, raw: Any, allowed_values: set[str]) -> list[str]:
        if raw is None:
            return []

        items: Iterable[Any]
        if isinstance(raw, list):
            items = raw
        else:
            items = [raw]

        normalized = []
        for item in items:
            if not isinstance(item, str):
                continue
            key = item.strip().upper().replace("-", "_").replace(" ", "_")
            if key in allowed_values:
                normalized.append(key)

        return sorted(set(normalized))

    def _update_profile(self, auth_token: str, payload: Dict[str, Any]) -> bool:
        base_url = self.settings.backend_api_url.rstrip("/")
        endpoint = f"{base_url}/api/users/me/profile"

        req = request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            method="PUT",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_token}",
            },
        )

        try:
            with request.urlopen(req, timeout=self.settings.backend_timeout_seconds) as response:
                return 200 <= response.status < 300
        except (error.HTTPError, error.URLError, TimeoutError):
            return False