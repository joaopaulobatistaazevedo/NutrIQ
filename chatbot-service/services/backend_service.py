import json
from datetime import datetime
from typing import Any, Dict, Iterable, Optional
from urllib import error, request
from urllib.parse import quote_plus

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

    def persist_generated_meal_plan(self, auth_token: Optional[str], meal_plan: Dict[str, Any]) -> bool:
        if not auth_token or not isinstance(meal_plan, dict):
            return False

        if meal_plan.get("status") != "generated":
            return False

        week_start = str(meal_plan.get("week_start") or "").strip()
        if not week_start:
            return False

        created_plan = self._create_meal_plan(auth_token, week_start)
        if not created_plan:
            return False

        plan_id = created_plan.get("id")
        if not isinstance(plan_id, int):
            return False

        added = 0
        for day in meal_plan.get("days") or []:
            if not isinstance(day, dict):
                continue

            day_of_week = self._iso_date_to_day_of_week(day.get("date"))
            if not day_of_week:
                continue

            for meal in day.get("meals") or []:
                if not isinstance(meal, dict):
                    continue

                meal_type = self._slot_to_meal_type(meal.get("slot"))
                if not meal_type:
                    continue

                recipe_id = self._resolve_recipe_id(auth_token, meal)
                if recipe_id is None:
                    continue

                payload = {
                    "recipeId": recipe_id,
                    "dayOfWeek": day_of_week,
                    "mealType": meal_type,
                }
                response = self._request_json(
                    auth_token,
                    method="POST",
                    path=f"/api/meal-plans/{plan_id}/meals",
                    payload=payload,
                )
                if response is not None:
                    added += 1

        return added > 0

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

    def _create_meal_plan(self, auth_token: str, week_start: str) -> Optional[Dict[str, Any]]:
        response = self._request_json(
            auth_token,
            method="POST",
            path="/api/meal-plans",
            payload={"weekStart": week_start},
        )
        return response if isinstance(response, dict) else None

    def _resolve_recipe_id(self, auth_token: str, meal: Dict[str, Any]) -> Optional[int]:
        raw_id = meal.get("recipe_id")
        if isinstance(raw_id, int):
            return raw_id
        if isinstance(raw_id, str) and raw_id.isdigit():
            return int(raw_id)

        title = str(meal.get("title") or "").strip()
        if not title:
            return None

        query = quote_plus(title)
        matches = self._request_json(
            auth_token,
            method="GET",
            path=f"/api/recipes/search?q={query}",
        )
        if not isinstance(matches, list) or not matches:
            return None

        normalized = title.casefold()
        best = next(
            (
                item
                for item in matches
                if isinstance(item, dict)
                and str(item.get("name") or "").strip().casefold() == normalized
                and isinstance(item.get("id"), int)
            ),
            None,
        )
        if best:
            return best["id"]

        first = matches[0]
        if isinstance(first, dict) and isinstance(first.get("id"), int):
            return first["id"]
        return None

    def _slot_to_meal_type(self, slot: Any) -> Optional[str]:
        value = str(slot or "").strip().casefold()
        mapping = {
            "pequeno-almoço": "BREAKFAST",
            "pequeno almoço": "BREAKFAST",
            "almoço": "LUNCH",
            "almoco": "LUNCH",
            "jantar": "DINNER",
            "snack": "SNACK",
        }
        return mapping.get(value)

    def _iso_date_to_day_of_week(self, raw_date: Any) -> Optional[str]:
        try:
            parsed = datetime.fromisoformat(str(raw_date)).date()
        except (TypeError, ValueError):
            return None

        return [
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
        ][parsed.weekday()]

    def _request_json(
        self,
        auth_token: str,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Any:
        base_url = self.settings.backend_api_url.rstrip("/")
        endpoint = f"{base_url}{path}"

        data = None
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Accept": "application/json",
        }
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(endpoint, data=data, method=method, headers=headers)
        try:
            with request.urlopen(req, timeout=self.settings.backend_timeout_seconds) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except (error.HTTPError, error.URLError, TimeoutError, ValueError):
            return None

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