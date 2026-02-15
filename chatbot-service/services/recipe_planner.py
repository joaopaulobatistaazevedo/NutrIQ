from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from pathlib import Path
from threading import Lock
from typing import Any

CHATBOT_SERVICE_DIR = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = CHATBOT_SERVICE_DIR.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.append(str(WORKSPACE_ROOT))

from recipe_scraper.models import RecipeRecord
from recipe_scraper.normalization import normalize_ingredient_line
from recipe_scraper.scraper import RecipeScraper, flatten_scrape_result, load_recipes_from_json
from recipe_scraper.sources import default_sources
from recipe_scraper.storage import load_recipes, upsert_recipes


class RecipePlannerService:
    SLOT_SEQUENCE = ["Pequeno-almoço", "Almoço", "Jantar"]

    # Keywords for meal categorisation
    BREAKFAST_KEYWORDS = {
        "papas", "aveia", "panquecas", "iogurte", "batido", "muesli",
        "torrada", "omelete", "fruta", "granola", "cereais",
    }
    LIGHT_KEYWORDS = {
        "salada", "grelhado", "vapor", "sopa", "creme", "cozido",
        "leve", "peixe", "frango",
    }

    def __init__(self) -> None:
        self._recipes: list[RecipeRecord] = []
        self._lock = Lock()
        self._db_path = WORKSPACE_ROOT / "data" / "recipes.db"
        self._json_path = WORKSPACE_ROOT / "data" / "recipes_scraped.json"

    # ──────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────

    def generate_weekly_plan(self, constraints: dict[str, Any]) -> dict[str, Any]:
        recipes = self._load_recipes_pool()
        planning_days = self._safe_days(constraints.get("planning_days"))

        goal = str(constraints.get("goal") or "maintain").strip() or "maintain"
        calories_offset = constraints.get("calories_offset", 0)
        try:
            calories_offset = int(calories_offset)
        except (TypeError, ValueError):
            calories_offset = 0

        missing_ingredients = constraints.get("missing_ingredients", [])

        liked = self._normalize_values(constraints.get("favorite_foods") or [])
        # Merge explicit dislikes with out-of-stock ingredients
        disliked = self._normalize_values(
            (constraints.get("disliked_ingredients") or []) + (missing_ingredients or [])
        )

        if not recipes:
            return {"status": "empty", "days": []}

        candidates = [
            recipe for recipe in recipes
            if recipe.title and recipe.url and self._is_recipe_allowed(recipe, disliked)
        ]

        # ── Goal-aware calorie adjustment ─────────────────────────────────
        # calories_offset > 0 = overate; < 0 = skipped meals / ate less
        #
        # Only reduce to lighter meals when user overate AND goal is lose/maintain.
        # For gain goals, or when user ate less, prefer calorie-dense / hearty recipes.
        needs_light_meals = (
            calories_offset > 300
            and goal in ("lose_weight", "maintain")
        )
        needs_dense_meals = (
            (calories_offset < -200 and goal in ("gain_weight", "gain_muscle"))
            or goal in ("gain_weight", "gain_muscle")  # always prefer dense for gain goals
        )

        ranked = self._rank_recipes(
            candidates, liked,
            prioritize_light=needs_light_meals,
            prioritize_dense=needs_dense_meals,
        )

        days_payload = self._build_days_payload(ranked, planning_days)

        adjustment_note = ""
        if needs_light_meals:
            adjustment_note = "Refeições mais leves priorizadas para compensar excesso calórico."
        elif needs_dense_meals and calories_offset < -200:
            adjustment_note = "Refeições mais calóricas priorizadas para compensar refeições saltadas."

        return {
            "status": "generated",
            "goal": goal,
            "planning_days": planning_days,
            "calories_adjustment_active": needs_light_meals or needs_dense_meals,
            "days": days_payload,
            "notes": adjustment_note or "Plano ajustado com base em preferências e inventário.",
        }

    # ──────────────────────────────────────────────────────────────────────
    # Categorisation & ranking
    # ──────────────────────────────────────────────────────────────────────

    def _categorize_recipe(self, recipe: RecipeRecord) -> str:
        title = recipe.title.lower()
        if any(kw in title for kw in self.BREAKFAST_KEYWORDS):
            return "Pequeno-almoço"
        return "Principal"

    def _rank_recipes(
        self,
        recipes: list[RecipeRecord],
        liked_ingredients: list[str],
        prioritize_light: bool = False,
        prioritize_dense: bool = False,
    ) -> list[tuple[RecipeRecord, float]]:
        ranked: list[tuple[RecipeRecord, float]] = []
        likes_total = len(liked_ingredients)

        # Dense/hearty recipe keywords for gain goals
        DENSE_KEYWORDS = {
            "arroz", "massa", "batata", "batata-doce", "feijão", "grão",
            "lentilhas", "frango", "atum", "salmão", "ovos", "queijo",
            "manteiga de amendoim", "nozes", "azeite", "abacate",
        }

        for recipe in recipes:
            score = 0.0
            if likes_total > 0:
                matched = self._liked_matches(recipe, liked_ingredients)
                score = matched / likes_total

            # Bonus for quick prep time — practical for weekdays
            time_minutes = recipe.total_time_minutes or 999
            if time_minutes <= 30:
                score += 0.20
            elif time_minutes <= 45:
                score += 0.10

            # Calorie-profile bonuses — mutually exclusive flags
            if prioritize_light and any(kw in recipe.title.lower() for kw in self.LIGHT_KEYWORDS):
                score += 0.50
            elif prioritize_dense:
                ingredient_text = " ".join(recipe.ingredients).lower()
                dense_hits = sum(1 for kw in DENSE_KEYWORDS if kw in ingredient_text)
                score += min(0.50, dense_hits * 0.12)

            # Ingredient breadth bonus: 5–12 ingredients = complete but not complex
            n_ing = len(recipe.ingredients)
            if 5 <= n_ing <= 12:
                score += 0.10

            ranked.append((recipe, score))

        # Primary sort: score desc. Tie-break: prep time asc, then alpha title
        ranked.sort(
            key=lambda item: (
                -item[1],
                item[0].total_time_minutes or 999,
                len(item[0].ingredients),
                item[0].title.lower(),
            )
        )
        return ranked

    # ──────────────────────────────────────────────────────────────────────
    # Day payload builder
    # ──────────────────────────────────────────────────────────────────────

    def _build_days_payload(
        self,
        ranked: list[tuple[RecipeRecord, float]],
        planning_days: int,
    ) -> list[dict[str, Any]]:
        if not ranked:
            return []

        # Separate pools to avoid e.g. serving bacalhau for breakfast
        breakfast_pool = [r for r in ranked if self._categorize_recipe(r[0]) == "Pequeno-almoço"]
        main_pool = [r for r in ranked if self._categorize_recipe(r[0]) == "Principal"]

        # Fallback when one pool is empty
        if not breakfast_pool:
            breakfast_pool = main_pool
        if not main_pool:
            main_pool = breakfast_pool

        # Insert neutral variety: sample low-score recipes into early positions
        neutral_main = [r for r in main_pool if r[1] == 0.0]
        preferred_main = [r for r in main_pool if r[1] > 0.0]
        ordered_main = preferred_main + neutral_main if preferred_main else list(main_pool)

        if neutral_main and len(ordered_main) >= 4:
            sampled = random.sample(neutral_main, min(2, len(neutral_main)))
            for candidate in sampled:
                ordered_main.insert(min(len(ordered_main), 2), candidate)

        week_start = self._current_week_start()
        used_urls: set[str] = set()

        days: list[dict[str, Any]] = []
        main_cursor = 0
        breakfast_cursor = 0

        for offset in range(planning_days):
            meal_date = week_start + timedelta(days=offset)
            day_meals: list[dict[str, Any]] = []

            for slot in self.SLOT_SEQUENCE:
                if slot == "Pequeno-almoço":
                    pool = breakfast_pool
                    cursor = breakfast_cursor
                else:
                    pool = ordered_main
                    cursor = main_cursor

                # Pick best available recipe not yet used this week
                selection = next(
                    (r for r in pool[cursor:] if r[0].url not in used_urls),
                    pool[cursor % len(pool)],  # fallback: allow reuse if pool exhausted
                )
                used_urls.add(selection[0].url)

                if slot == "Pequeno-almoço":
                    breakfast_cursor += 1
                else:
                    main_cursor += 1

                day_meals.append(
                    {
                        "slot": slot,
                        "title": selection[0].title,
                        "url": selection[0].url,
                        "source": selection[0].source,
                        "score": round(selection[1], 3),
                        "duration_minutes": selection[0].total_time_minutes,
                        "ingredients_preview": selection[0].ingredients[:5],
                    }
                )

            days.append(
                {
                    "date": meal_date.isoformat(),
                    "day_label": self._weekday_label(meal_date),
                    "meals": day_meals,
                }
            )
        return days

    # ──────────────────────────────────────────────────────────────────────
    # Recipe pool loading
    # ──────────────────────────────────────────────────────────────────────

    def _load_recipes_pool(self) -> list[RecipeRecord]:
        with self._lock:
            if self._recipes:
                return list(self._recipes)

            loaded: list[RecipeRecord] = []
            if self._db_path.exists():
                try:
                    loaded = load_recipes(str(self._db_path))
                except Exception:
                    loaded = []

            if not loaded and self._json_path.exists():
                try:
                    loaded = load_recipes_from_json(str(self._json_path))
                except Exception:
                    loaded = []

            if not loaded:
                loaded = self._scrape_now()

            self._recipes = loaded
            return list(self._recipes)

    def _scrape_now(self) -> list[RecipeRecord]:
        try:
            scraper = RecipeScraper(timeout_seconds=15.0, debug=False)
            result = scraper.scrape_sources(
                sources=default_sources(),
                max_recipes_per_source=40,
                max_pages_per_list_url=1,
            )
            recipes = flatten_scrape_result(result)
            if recipes:
                try:
                    upsert_recipes(str(self._db_path), recipes)
                except Exception:
                    pass
            return recipes
        except Exception:
            return []

    # ──────────────────────────────────────────────────────────────────────
    # Filtering helpers
    # ──────────────────────────────────────────────────────────────────────

    def _is_recipe_allowed(self, recipe: RecipeRecord, disliked_ingredients: list[str]) -> bool:
        if not disliked_ingredients:
            return True
        normalized_lines = [normalize_ingredient_line(line) for line in recipe.ingredients]
        for disliked in disliked_ingredients:
            for line in normalized_lines:
                if disliked and line and (disliked in line or line in disliked):
                    return False
        return True

    def _liked_matches(self, recipe: RecipeRecord, liked_ingredients: list[str]) -> int:
        if not liked_ingredients:
            return 0
        normalized_lines = [normalize_ingredient_line(line) for line in recipe.ingredients]
        return sum(
            1 for liked in liked_ingredients
            if any(liked in line or line in liked for line in normalized_lines)
        )

    def _normalize_values(self, values: list[Any]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values:
            if not isinstance(value, str):
                continue
            token = normalize_ingredient_line(value)
            if not token or token in seen:
                continue
            seen.add(token)
            normalized.append(token)
        return normalized

    # ──────────────────────────────────────────────────────────────────────
    # Date helpers
    # ──────────────────────────────────────────────────────────────────────

    def _safe_days(self, raw_days: Any) -> int:
        try:
            parsed = int(raw_days)
        except (TypeError, ValueError):
            return 7
        return max(1, min(parsed, 7))

    def _current_week_start(self) -> date:
        today = date.today()
        return today - timedelta(days=today.weekday())

    def _weekday_label(self, value: date) -> str:
        labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        return labels[value.weekday()]