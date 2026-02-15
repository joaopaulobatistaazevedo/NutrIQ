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
        Always fetches fresh prices from the Java service before plan generation.
        The cache is intentionally invalidated on every call so that every plan
        recalculation reflects current supermarket availability and prices.
        Returns the number of priced recipes fetched.
        """
        # Always clear the cache — stale prices must not be reused across recalcs
        self._cached_priced_recipes = None

        try:
            svc = SupermarketScraperService(
                java_base_url=self.settings.java_service_url,
                auth_token=auth_token,
            )
            priced = svc.fetch_priced_recipes()
            if priced:
                self._cached_priced_recipes = priced
                logger.info("Refreshed supermarket cache: %d priced recipes", len(priced))
                return len(priced)
            logger.warning("Java service returned empty recipe list; falling back to last-known data")
        except Exception as exc:
            logger.warning("Java service unavailable; planner will use fallback mode: %s", exc)

        # Keep cache empty so _get_recipes falls back to local data
        self._cached_priced_recipes = []
        return 0

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
          goal                 : str  ("lose_weight"|"gain_weight"|"maintain"|"gain_muscle")
          calories_offset      : int  (positive = overate; negative = skipped meals / ate less)
        """
        goal = _normalise_goal(constraints.get("goal"))
        requested_planning_days = _safe_int(constraints.get("planning_days"), default=7, lo=1, hi=14)
        planning_days = requested_planning_days
        week_start = _resolve_week_start(constraints)
        today = date.today()
        planning_start = max(today, week_start)
        week_offset = _safe_int(constraints.get("week_offset"), default=0, lo=0, hi=52)
        max_budget = _safe_float(constraints.get("max_weekly_budget"), default=0.0)
        tdee = _safe_float(constraints.get("tdee"), default=2200.0)
        body_weight_kg = _safe_float(
            constraints.get("body_weight_kg")
            or constraints.get("weight_kg")
            or constraints.get("weight"),
            default=70.0,
        )

        # ── Goal-aware calorie offset ────────────────────────────────────
        # calories_offset > 0  = user ate extra calories (overate)
        # calories_offset < 0  = user ate fewer calories (skipped a meal, etc.)
        #
        # How to respond depends on the user's goal:
        #   lose_weight / maintain + overate   → distribute a small deficit over the week
        #   lose_weight / maintain + ate less  → keep targets normal (don't under-eat further)
        #   gain_weight / gain_muscle + overate→ keep targets normal (surplus is fine)
        #   gain_weight / gain_muscle + ate less → distribute a small extra surplus over the week
        raw_offset = _safe_float(constraints.get("calories_offset"), default=0.0)
        calories_offset = int(round(raw_offset))

        calorie_adjustment_per_day = 0.0
        adjustment_reason = ""

        if calories_offset != 0 and planning_days > 0:
            spread_days = min(planning_days, 4)  # spread the correction over max 4 days
            daily_correction = calories_offset / spread_days

            if calories_offset > 0:
                # User overate
                if goal in ("lose_weight", "maintain"):
                    # Gently reduce upcoming meals to compensate — capped at -200 kcal/day
                    calorie_adjustment_per_day = -min(abs(daily_correction), 200.0)
                    adjustment_reason = "compensação de excesso calórico"
                else:
                    # gain_weight / gain_muscle: extra food is welcome, keep target
                    calorie_adjustment_per_day = 0.0
                    adjustment_reason = ""
            else:
                # User ate less (skipped meal, small portions, etc.)
                if goal in ("gain_weight", "gain_muscle"):
                    # Add extra calories to help reach the surplus — capped at +250 kcal/day
                    calorie_adjustment_per_day = min(abs(daily_correction), 250.0)
                    adjustment_reason = "compensação de défice calórico para objetivo de ganho"
                else:
                    # lose_weight / maintain + ate less: don't reduce further, keep target
                    calorie_adjustment_per_day = 0.0
                    adjustment_reason = ""

        liked = _flat_tokens(
            constraints.get("favorite_foods"),
            constraints.get("new_liked_ingredients"),
            constraints.get("requested_extra_ingredients"),
        )
        disliked = _flat_tokens(constraints.get("disliked_ingredients"))
        exclude_recipe_ids = _flat_recipe_ids(constraints.get("exclude_recipe_ids"))

        recipes = self._get_recipes()
        if not recipes:
            return _empty_plan(
                planning_days,
                goal,
                disliked,
                liked,
                "Sem receitas disponíveis no backend neste momento.",
                week_start=week_start,
                planning_start=planning_start,
            )

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

        if exclude_recipe_ids:
            filtered = [r for r in allowed if str(r.id) not in exclude_recipe_ids]
            if filtered:
                allowed = filtered
            else:
                logger.info("Exclusion list removed all recipes; ignoring previous-plan exclusions")

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
                excluded_recipe_ids=list(exclude_recipe_ids),
                calorie_adjustment_per_day=calorie_adjustment_per_day,
            )
            best_slots = ga.run()
        except Exception as exc:
            logger.error("GA failed: %s", exc)
            return _empty_plan(
                planning_days,
                goal,
                disliked,
                liked,
                f"Erro no algoritmo: {exc}",
                week_start=week_start,
                planning_start=planning_start,
            )

        days_payload = _build_days_payload(best_slots, planning_days, planning_start)
        total_cost = sum(ms.recipe.cost_per_serving for ms in best_slots)
        goal_profile = GOAL_PROFILES[goal]
        goal_daily_calories = max(1200.0, tdee + float(goal_profile.get("calorie_delta", 0.0)) + calorie_adjustment_per_day)

        plan = {
            "status": "generated",
            "goal": goal,
            "goal_daily_calories": round(goal_daily_calories, 0),
            "planning_days": planning_days,
            "requested_planning_days": requested_planning_days,
            "planning_start": planning_start.isoformat(),
            "week_start": week_start.isoformat(),
            "requested_week_offset": week_offset,
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

        if calories_offset != 0 and calorie_adjustment_per_day != 0.0:
            plan["calorie_adjustment_applied"] = round(calorie_adjustment_per_day, 0)
            plan["calorie_adjustment_reason"] = adjustment_reason
        elif calories_offset != 0:
            # Offset present but no adjustment made (e.g. gain user who overate)
            plan["calorie_adjustment_applied"] = 0.0
            plan["calorie_adjustment_reason"] = "ajuste não necessário para o objetivo actual"

        return plan

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

def _build_days_payload(
    slots: list[MealSlot],
    planning_days: int,
    planning_start: date,
) -> list[dict[str, Any]]:
    # Group slots by day index
    by_day: dict[int, list[MealSlot]] = {}
    for ms in slots:
        by_day.setdefault(ms.day, []).append(ms)

    days: list[dict[str, Any]] = []
    for offset in range(planning_days):
        meal_date = planning_start + timedelta(days=offset)
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
                "ingredients": ms.recipe.ingredients,
                "ingredients_preview": ms.recipe.ingredients,
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
    planning_days: int,
    goal: str,
    disliked: list[str],
    liked: list[str],
    reason: str,
    week_start: date,
    planning_start: date,
) -> dict[str, Any]:
    return {
        "status": "empty",
        "goal": goal,
        "planning_days": planning_days,
        "planning_start": planning_start.isoformat(),
        "week_start": week_start.isoformat(),
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


def _flat_recipe_ids(values: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(values, (int, str)):
        values = [values]
    if not isinstance(values, list):
        return result

    for value in values:
        if isinstance(value, int) and value > 0:
            result.add(str(value))
        elif isinstance(value, str):
            cleaned = value.strip()
            if cleaned.isdigit() and int(cleaned) > 0:
                result.add(cleaned)
    return result


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


def _parse_iso_date(raw: Any) -> date | None:
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _resolve_week_start(constraints: dict[str, Any]) -> date:
    explicit_week_start = _parse_iso_date(constraints.get("week_start"))
    if explicit_week_start is not None:
        return explicit_week_start - timedelta(days=explicit_week_start.weekday())

    week_offset = _safe_int(constraints.get("week_offset"), default=0, lo=0, hi=52)
    base = _current_week_start()
    return base + timedelta(days=week_offset * 7)


def _current_week_start() -> date:
    today = date.today()
    return today - timedelta(days=today.weekday())
