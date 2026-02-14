"""
supermarket_scraper_service.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Calls the Java recipe/ingredient service to fetch real-time supermarket
prices before meal planning runs.

Java API assumptions (adjust endpoints to match your service):
  GET  /api/recipes              → list[RecipeDTO]
  GET  /api/recipes/{id}         → RecipeDTO
  POST /api/ingredients/prices   → body: list[str] → dict[str, float]  (€ / 100g or unit)
  GET  /api/recipes/{id}/cost    → {"cost_per_serving": float, "currency": "EUR"}

RecipeDTO expected shape:
  {
    "id": str,
    "title": str,
    "url": str,
    "source": str,
    "calories_per_serving": float | None,
    "protein_g": float | None,
    "fat_g": float | None,
    "carbs_g": float | None,
    "ingredients": list[str],
    "total_time_minutes": int | None,
    "servings": int | None
  }
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib import error, request
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


class PricedRecipe:
    """Lightweight container for a recipe enriched with cost data."""

    __slots__ = (
        "id",
        "title",
        "url",
        "source",
        "calories_per_serving",
        "protein_g",
        "fat_g",
        "carbs_g",
        "ingredients",
        "total_time_minutes",
        "servings",
        "cost_per_serving",
    )

    def __init__(
        self,
        id: str,
        title: str,
        url: str,
        source: str,
        calories_per_serving: float | None,
        protein_g: float | None,
        fat_g: float | None,
        carbs_g: float | None,
        ingredients: list[str],
        total_time_minutes: int | None,
        servings: int | None,
        cost_per_serving: float,
    ) -> None:
        self.id = id
        self.title = title
        self.url = url
        self.source = source
        self.calories_per_serving = calories_per_serving
        self.protein_g = protein_g
        self.fat_g = fat_g
        self.carbs_g = carbs_g
        self.ingredients = ingredients
        self.total_time_minutes = total_time_minutes
        self.servings = servings
        self.cost_per_serving = cost_per_serving  # € per serving, 0.0 if unknown

    @classmethod
    def from_dto(cls, dto: dict[str, Any], cost_per_serving: float = 0.0) -> "PricedRecipe":
        return cls(
            id=str(dto.get("id", "")),
            title=str(dto.get("title", "")),
            url=str(dto.get("url", "")),
            source=str(dto.get("source", "")),
            calories_per_serving=_to_float(dto.get("calories_per_serving")),
            protein_g=_to_float(dto.get("protein_g")),
            fat_g=_to_float(dto.get("fat_g")),
            carbs_g=_to_float(dto.get("carbs_g")),
            ingredients=dto.get("ingredients") or [],
            total_time_minutes=_to_int(dto.get("total_time_minutes")),
            servings=_to_int(dto.get("servings")),
            cost_per_serving=cost_per_serving,
        )


class SupermarketScraperService:
    """
    Fetches all recipes from the Java service and enriches each one with
    real supermarket ingredient prices (cost per serving in €).

    The Java service is responsible for:
    - Holding the recipe catalogue (ingredients lists, macros, etc.)
    - Querying the supermarket price API for each ingredient

    This class simply orchestrates the calls and assembles PricedRecipe objects
    ready for the genetic algorithm.
    """

    DEFAULT_COST_FALLBACK = 2.50  # € per serving when price data unavailable
    _TIMEOUT = 10.0  # seconds per HTTP call

    def __init__(self, java_base_url: str, auth_token: str | None = None) -> None:
        self._base = java_base_url.rstrip("/")
        self._auth_token = auth_token

    # ──────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────

    def fetch_priced_recipes(self) -> list[PricedRecipe]:
        """
        Main entry point.  Returns a list of PricedRecipe objects with
        cost_per_serving populated from live supermarket data.

        Steps:
          1. Fetch all recipe stubs from Java (id + basic metadata)
          2. For each recipe, fetch its cost_per_serving from Java
             (Java internally calls the supermarket scraper)
          3. Assemble PricedRecipe objects

        Falls back gracefully: if a cost cannot be fetched the recipe is
        kept with cost_per_serving = DEFAULT_COST_FALLBACK so it still
        participates in planning.
        """
        logger.info("Fetching recipe catalogue from Java service at %s", self._base)
        recipes_raw = self._get_json("/api/recipes")
        if not isinstance(recipes_raw, list):
            logger.warning("Unexpected response from /api/recipes; got %s", type(recipes_raw))
            return []

        priced: list[PricedRecipe] = []
        for dto in recipes_raw:
            if not isinstance(dto, dict) or not dto.get("id"):
                continue

            recipe_id = str(dto["id"])
            cost = self._fetch_cost_per_serving(recipe_id)
            priced.append(PricedRecipe.from_dto(dto, cost_per_serving=cost))

        logger.info("Loaded %d priced recipes from Java service", len(priced))
        return priced

    def fetch_ingredient_prices(self, ingredient_names: list[str]) -> dict[str, float]:
        """
        Ask Java to return current supermarket prices for a list of
        ingredient names.  Returns a dict {ingredient_name: price_eur}.
        Missing entries default to 0.0.
        """
        if not ingredient_names:
            return {}

        payload = json.dumps(ingredient_names).encode("utf-8")
        try:
            data = self._post_json("/api/ingredients/prices", payload)
            if isinstance(data, dict):
                return {k: float(v) for k, v in data.items() if isinstance(v, (int, float))}
        except Exception as exc:
            logger.warning("Could not fetch ingredient prices: %s", exc)
        return {}

    # ──────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────────────────

    def _fetch_cost_per_serving(self, recipe_id: str) -> float:
        try:
            data = self._get_json(f"/api/recipes/{recipe_id}/cost")
            if isinstance(data, dict):
                cost = data.get("cost_per_serving")
                if cost is not None:
                    return float(cost)
        except Exception as exc:
            logger.debug("Cost fetch failed for recipe %s: %s", recipe_id, exc)
        return self.DEFAULT_COST_FALLBACK

    def _get_json(self, path: str) -> Any:
        url = urljoin(self._base + "/", path.lstrip("/"))
        req = request.Request(url, headers=self._default_headers())
        with request.urlopen(req, timeout=self._TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _post_json(self, path: str, body: bytes) -> Any:
        url = urljoin(self._base + "/", path.lstrip("/"))
        headers = {**self._default_headers(), "Content-Type": "application/json"}
        req = request.Request(url, data=body, headers=headers, method="POST")
        with request.urlopen(req, timeout=self._TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _default_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Accept": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"
        return headers


# ──────────────────────────────────────────────────────────────────────────
# Tiny type-coercion helpers
# ──────────────────────────────────────────────────────────────────────────

def _to_float(val: Any) -> float | None:
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None


def _to_int(val: Any) -> int | None:
    try:
        return int(val) if val is not None else None
    except (TypeError, ValueError):
        return None