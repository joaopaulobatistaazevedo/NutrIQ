"""
goal_meal_planner.py
━━━━━━━━━━━━━━━━━━━
Orchestrates the full goal-aware meal planning pipeline:

  1. Fetch PricedRecipes from the Java service (live supermarket prices)
  2. Fall back to the existing scraper-based recipe pool if Java is unavailable
  3. Run the genetic algorithm with the user's goal and preferences
  4. Return a structured weekly plan payload

This replaces the old `RecipePlannerService.generate_weekly_plan()` while
keeping the same output shape so the rest of the codebase (openai_service,
main) needs minimal changes.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from config.settings import get_settings
from services.genetic_algorithm import GOAL_PROFILES, SLOTS, MealPlanGA, MealSlot
from services.supermarket_scraper_service import PricedRecipe, SupermarketScraperService

logger = logging.getLogger(__name__)

# Weekday labels in Portuguese
_WEEKDAY_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


class GoalMealPlannerService:
    """
    High-level service that the OpenAI service calls to produce a weekly plan.

    Usage:
        planner = GoalMealPlannerService()
        plan = planner.generate_goal_plan(constraints)
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self._scraper_service: SupermarketScraperService | None = None
        self._cached_priced_recipes: list[PricedRecipe] | None = None

    # ──────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────

    def scrape_and_cache_prices(self, auth_token: str | None = None) -> int:
        """
        Called BEFORE generate_goal_plan so prices are fresh.
        Returns the number of priced recipes fetched.

        The chatbot service should call this right after detecting a
        meal-plan request, so the user sees "a recolher preços..." feedback
        while this runs, then the GA fires.
        """
        try:
            svc = SupermarketScraperService(
                java_base_url=self.settings.java_service_url,
                auth_token=auth_token,
            )
            priced = svc.fetch_priced_recipes()
            if priced:
                self._cached_priced_recipes = priced
                logger.info("Cached %d priced recipes from Java service", len(priced))
                return len(priced)
        except Exception as exc:
            logger.warning("Java service unavailable – falling back to scraper: %s", exc)

        # Fallback: wrap old scraper recipes as PricedRecipes with default cost
        self._cached_priced_recipes = self._load_fallback_recipes()
        return len(self._cached_priced_recipes)

    def generate_goal_plan(self, constraints: dict[str, Any]) -> dict[str, Any]:
        """
        Build and return a weekly meal plan optimised for the user's goal.

        constraints keys (mirrors existing meal_plan_draft["constraints"]):
          max_weekly_budget    : float | None
          planning_days        : int | None  (1–7, default 7)
          favorite_foods       : list[str]
          disliked_ingredients : list[str]
          new_liked_ingredients: list[str]
          requested_extra_ingredients: list[str]
          restrictions         : list[str]
          allergens            : list[str]
          goal                 : str  ← NEW  ("lose_weight"|"gain_weight"|"maintain"|"gain_muscle")
        """
        goal = _normalise_goal(constraints.get("goal"))
        planning_days = _safe_int(constraints.get("planning_days"), default=7, lo=1, hi=7)
        max_budget = _safe_float(constraints.get("max_weekly_budget"), default=0.0)
        tdee = _safe_float(constraints.get("tdee"), default=2200.0)
        body_weight_kg = _safe_float(
            constraints.get("body_weight_kg")
            or constraints.get("weight_kg")
            or constraints.get("weight"),
            default=70.0,
        )

        liked = _flat_tokens(
            constraints.get("favorite_foods"),
            constraints.get("new_liked_ingredients"),
            constraints.get("requested_extra_ingredients"),
        )
        disliked = _flat_tokens(constraints.get("disliked_ingredients"))

        recipes = self._get_recipes()
        if not recipes:
            return _empty_plan(planning_days, goal, disliked, liked, "Sem receitas disponíveis.")

        # Filter disliked + dietary restrictions / allergens
        allowed = _filter_recipes(
            recipes,
            disliked,
            restrictions=constraints.get("restrictions") or [],
            allergens=constraints.get("allergens") or [],
        )
        if not allowed:
            logger.warning("All recipes filtered out – relaxing disliked filter")
            allowed = recipes  # last resort

        # Run genetic algorithm
        try:
            ga = MealPlanGA(
                recipes=allowed,
                goal=goal,
                planning_days=planning_days,
                liked=liked,
                disliked=disliked,
                max_weekly_budget=max_budget,
                tdee=tdee,
                body_weight_kg=body_weight_kg,
            )
            best_slots = ga.run()
        except Exception as exc:
            logger.error("GA failed: %s", exc)
            return _empty_plan(planning_days, goal, disliked, liked, f"Erro no algoritmo: {exc}")

        days_payload = _build_days_payload(best_slots, planning_days)
        total_cost = sum(ms.recipe.cost_per_serving for ms in best_slots)
        goal_profile = GOAL_PROFILES[goal]
        goal_daily_calories = max(1200.0, tdee + float(goal_profile.get("calorie_delta", 0.0)))

        return {
            "status": "generated",
            "goal": goal,
            "goal_daily_calories": round(goal_daily_calories, 0),
            "planning_days": planning_days,
            "week_start": _current_week_start().isoformat(),
            "max_weekly_budget": max_budget or None,
            "estimated_weekly_cost": round(total_cost, 2),
            "excluded_ingredients": disliked,
            "liked_ingredients": liked,
            "source": "java_service_with_ga",
            "total_candidates": len(allowed),
            "days": days_payload,
            "notes": (
                f"Plano gerado com algoritmo genético para objetivo '{goal}'. "
                f"Custo estimado: €{total_cost:.2f}."
            ),
        }

    # ──────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────────────────────

    def _get_recipes(self) -> list[PricedRecipe]:
        if self._cached_priced_recipes:
            return self._cached_priced_recipes
        # If scrape_and_cache_prices wasn't called, attempt it now
        self.scrape_and_cache_prices()
        return self._cached_priced_recipes or []

    def _load_fallback_recipes(self) -> list[PricedRecipe]:
        """Wrap old RecipeRecord objects as PricedRecipes with a default cost."""
        try:
            import pathlib, sys

            # Ensure workspace root is importable before importing recipe_scraper
            chatbot_dir = pathlib.Path(__file__).resolve().parents[1]
            workspace = chatbot_dir.parent
            if str(workspace) not in sys.path:
                sys.path.append(str(workspace))

            from recipe_scraper.scraper import RecipeScraper, flatten_scrape_result, load_recipes_from_json
            from recipe_scraper.sources import default_sources
            from recipe_scraper.storage import load_recipes

            db = workspace / "data" / "recipes.db"
            js = workspace / "data" / "recipes_scraped.json"

            raw: list = []
            if db.exists():
                try:
                    raw = load_recipes(str(db))
                except Exception:
                    pass
            if not raw and js.exists():
                try:
                    raw = load_recipes_from_json(str(js))
                except Exception:
                    pass
            if not raw:
                scraper = RecipeScraper(timeout_seconds=15.0, debug=False)
                result = scraper.scrape_sources(
                    sources=default_sources(),
                    max_recipes_per_source=40,
                    max_pages_per_list_url=1,
                )
                raw = flatten_scrape_result(result)

            return [
                PricedRecipe(
                    id=getattr(r, "id", "") or "",
                    title=r.title or "",
                    url=r.url or "",
                    source=r.source or "",
                    calories_per_serving=getattr(r, "calories", None),
                    protein_g=getattr(r, "protein_g", None),
                    fat_g=getattr(r, "fat_g", None),
                    carbs_g=getattr(r, "carbs_g", None),
                    ingredients=r.ingredients or [],
                    total_time_minutes=r.total_time_minutes,
                    servings=getattr(r, "servings", None),
                    cost_per_serving=SupermarketScraperService.DEFAULT_COST_FALLBACK,
                )
                for r in raw
                if r.title and r.url
            ]
        except Exception as exc:
            logger.error("Fallback recipe load failed: %s", exc)
            return []


# ═══════════════════════════════════════════════════════════════════════════
# Payload builders
# ═══════════════════════════════════════════════════════════════════════════

def _build_days_payload(slots: list[MealSlot], planning_days: int) -> list[dict[str, Any]]:
    week_start = _current_week_start()
    # Group slots by day index
    by_day: dict[int, list[MealSlot]] = {}
    for ms in slots:
        by_day.setdefault(ms.day, []).append(ms)

    days: list[dict[str, Any]] = []
    for offset in range(planning_days):
        meal_date = week_start + timedelta(days=offset)
        day_slots = by_day.get(offset, [])
        meals = [
            {
                "slot": ms.slot,
                "recipe_id": ms.recipe.id,
                "title": ms.recipe.title,
                "url": ms.recipe.url,
                "source": ms.recipe.source,
                "calories_per_serving": ms.recipe.calories_per_serving,
                "protein_g": ms.recipe.protein_g,
                "fat_g": ms.recipe.fat_g,
                "carbs_g": ms.recipe.carbs_g,
                "cost_per_serving_eur": round(ms.recipe.cost_per_serving, 2),
                "duration_minutes": ms.recipe.total_time_minutes,
                "ingredients_preview": ms.recipe.ingredients[:5],
            }
            for ms in sorted(day_slots, key=lambda s: SLOTS.index(s.slot) if s.slot in SLOTS else 99)
        ]
        days.append(
            {
                "date": meal_date.isoformat(),
                "day_label": _WEEKDAY_PT[meal_date.weekday()],
                "meals": meals,
            }
        )
    return days


def _empty_plan(
    planning_days: int, goal: str, disliked: list[str], liked: list[str], reason: str
) -> dict[str, Any]:
    return {
        "status": "empty",
        "goal": goal,
        "planning_days": planning_days,
        "week_start": _current_week_start().isoformat(),
        "excluded_ingredients": disliked,
        "liked_ingredients": liked,
        "days": [],
        "notes": reason,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Small utilities
# ═══════════════════════════════════════════════════════════════════════════

def _normalise_goal(raw: Any) -> str:
    mapping = {
        "lose_weight": "lose_weight",
        "emagrecer": "lose_weight",
        "perder peso": "lose_weight",
        "gain_weight": "gain_weight",
        "ganhar peso": "gain_weight",
        "maintain": "maintain",
        "manter": "maintain",
        "manter a forma": "maintain",
        "gain_muscle": "gain_muscle",
        "ganhar massa": "gain_muscle",
        "ganhar massa muscular": "gain_muscle",
    }
    if not raw:
        return "maintain"
    key = str(raw).lower().strip()
    return mapping.get(key, "maintain")


def _flat_tokens(*lists: Any) -> list[str]:
    out: list[str] = []
    for lst in lists:
        if not lst:
            continue
        if isinstance(lst, str):
            out.append(lst.lower().strip())
        elif isinstance(lst, list):
            out.extend(str(x).lower().strip() for x in lst if x)
    return [t for t in out if t]


def _filter_recipes(
    recipes: list[PricedRecipe],
    disliked: list[str],
    restrictions: list[str],
    allergens: list[str],
) -> list[PricedRecipe]:
    blocked_tokens = {t.lower() for t in disliked + allergens}

    def _allowed(r: PricedRecipe) -> bool:
        text = " ".join(r.ingredients).lower()
        return not any(tok and tok in text for tok in blocked_tokens)

    return [r for r in recipes if _allowed(r)]


def _safe_int(val: Any, default: int, lo: int, hi: int) -> int:
    try:
        v = int(val)
        return max(lo, min(hi, v))
    except (TypeError, ValueError):
        return default


def _safe_float(val: Any, default: float) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _current_week_start() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())