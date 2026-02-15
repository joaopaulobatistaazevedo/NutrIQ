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


from __future__ import annotations
import random
import sys
from datetime import date, timedelta
from pathlib import Path
from threading import Lock
from typing import Any

# ... (imports mantidos)

class RecipePlannerService:
    SLOT_SEQUENCE = ["Pequeno-almoço", "Almoço", "Jantar"]
    
    # Palavras-chave para categorização
    BREAKFAST_KEYWORDS = {"papas", "aveia", "panquecas", "iogurte", "batido", "muesli", "torrada", "omelete", "fruta", "granola", "cereais"}
    LIGHT_KEYWORDS = {"salada", "grelhado", "vapor", "sopa", "creme", "cozido", "leve", "peixe", "frango"}

    def __init__(self) -> None:
        self._recipes: list[RecipeRecord] = []
        self._lock = Lock()
        self._db_path = Path("recipes.db")
        self._json_path = Path("recipes_scraped.json")

    def generate_weekly_plan(self, constraints: dict[str, Any]) -> dict[str, Any]:
        recipes = self._load_recipes_pool()
        planning_days = self._safe_days(constraints.get("planning_days"))
        
        # Novos inputs dinâmicos
        calories_offset = constraints.get("calories_offset", 0)
        missing_ingredients = constraints.get("missing_ingredients", [])
        
        liked = self._normalize_values(constraints.get("favorite_foods") or [])
        # Fundir ingredientes que não gosta com ingredientes que faltam no supermercado
        disliked = self._normalize_values((constraints.get("disliked_ingredients") or []) + missing_ingredients)

        if not recipes:
            return {"status": "empty", "days": []}

        # Filtrar candidatos base (exclui logo o que o user não gosta ou o que falta no stock)
        candidates = [
            recipe for recipe in recipes 
            if recipe.title and recipe.url and self._is_recipe_allowed(recipe, disliked)
        ]

        # Se houver um offset calórico positivo alto (> 300kcal), priorizar receitas leves
        needs_light_meals = calories_offset > 300
        ranked = self._rank_recipes(candidates, liked, prioritize_light=needs_light_meals)
        
        days_payload = self._build_days_payload(ranked, planning_days)

        return {
            "status": "generated",
            "planning_days": planning_days,
            "calories_adjustment_active": needs_light_meals,
            "days": days_payload,
            "notes": "Plano ajustado dinamicamente com base em preferências e inventário."
        }

    def _categorize_recipe(self, recipe: RecipeRecord) -> str:
        title = recipe.title.lower()
        if any(kw in title for kw in self.BREAKFAST_KEYWORDS):
            return "Pequeno-almoço"
        return "Principal"

    def _rank_recipes(self, recipes: list[RecipeRecord], liked_ingredients: list[str], prioritize_light: bool = False) -> list[tuple[RecipeRecord, float]]:
        ranked = []
        for recipe in recipes:
            score = 0.0
            # Relevância por ingredientes favoritos
            if liked_ingredients:
                matched = self._liked_matches(recipe, liked_ingredients)
                score = matched / len(liked_ingredients)
            
            # Bonus por ser "leve" se o utilizador abusou nas calorias
            if prioritize_light:
                if any(kw in recipe.title.lower() for kw in self.LIGHT_KEYWORDS):
                    score += 0.5 

            ranked.append((recipe, score))

        return sorted(ranked, key=lambda x: x[1], reverse=True)

    def _build_days_payload(self, ranked: list[tuple[RecipeRecord, float]], planning_days: int) -> list[dict[str, Any]]:
        # Separar pools para evitar bacalhau ao pequeno-almoço
        breakfast_pool = [r for r in ranked if self._categorize_recipe(r[0]) == "Pequeno-almoço"]
        main_pool = [r for r in ranked if self._categorize_recipe(r[0]) == "Principal"]

        # Fallback se um pool estiver vazio
        if not breakfast_pool: breakfast_pool = main_pool
        if not main_pool: main_pool = breakfast_pool

        days = []
        used_urls = set()
        
        for offset in range(planning_days):
            meal_date = date.today() + timedelta(days=offset)
            day_meals = []
            
            for slot in self.SLOT_SEQUENCE:
                pool = breakfast_pool if slot == "Pequeno-almoço" else main_pool
                
                # Selecionar a melhor que ainda não foi usada
                selection = next((r for r in pool if r[0].url not in used_urls), pool[0])
                used_urls.add(selection[0].url)
                
                day_meals.append({
                    "slot": slot,
                    "title": selection[0].title,
                    "url": selection[0].url,
                    "score": round(selection[1], 2)
                })
            
            days.append({
                "date": meal_date.isoformat(),
                "meals": day_meals
            })
        return days

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

    def _rank_recipes(
        self,
        recipes: list[RecipeRecord],
        liked_ingredients: list[str],
    ) -> list[tuple[RecipeRecord, float]]:
        ranked: list[tuple[RecipeRecord, float]] = []
        likes_total = len(liked_ingredients)

        for recipe in recipes:
            score = 0.0
            if likes_total > 0:
                matched = self._liked_matches(recipe, liked_ingredients)
                score = matched / likes_total
            ranked.append((recipe, score))

        ranked.sort(
            key=lambda item: (
                -item[1],
                (item[0].total_time_minutes or 999),
                len(item[0].ingredients),
                item[0].title.lower(),
            )
        )
        return ranked

    def _build_days_payload(
        self,
        ranked: list[tuple[RecipeRecord, float]],
        planning_days: int,
    ) -> list[dict[str, Any]]:
        if not ranked:
            return []

        week_start = self._current_week_start()
        neutral_pool = [item for item in ranked if item[1] == 0.0]
        preferred_pool = [item for item in ranked if item[1] > 0.0]
        ordered = preferred_pool + neutral_pool if preferred_pool else list(ranked)

        meals_per_week = planning_days * len(self.SLOT_SEQUENCE)
        selected = self._pick_recipes_with_rotation(ordered, neutral_pool, meals_per_week)

        days: list[dict[str, Any]] = []
        cursor = 0
        for offset in range(planning_days):
            meal_date = week_start + timedelta(days=offset)
            day_meals = []
            for slot in self.SLOT_SEQUENCE:
                recipe, score = selected[cursor % len(selected)]
                cursor += 1
                day_meals.append(
                    {
                        "slot": slot,
                        "title": recipe.title,
                        "url": recipe.url,
                        "source": recipe.source,
                        "score": round(score, 3),
                        "duration_minutes": recipe.total_time_minutes,
                        "ingredients_preview": recipe.ingredients[:5],
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

    def _pick_recipes_with_rotation(
        self,
        ordered: list[tuple[RecipeRecord, float]],
        neutral_pool: list[tuple[RecipeRecord, float]],
        total: int,
    ) -> list[tuple[RecipeRecord, float]]:
        if not ordered:
            return []

        picked: list[tuple[RecipeRecord, float]] = []
        seen_urls: set[str] = set()

        i = 0
        while len(picked) < total and i < len(ordered):
            recipe, score = ordered[i]
            i += 1
            if recipe.url in seen_urls:
                continue
            seen_urls.add(recipe.url)
            picked.append((recipe, score))

        if neutral_pool and len(picked) >= 4:
            sampled = random.sample(neutral_pool, min(2, len(neutral_pool)))
            for candidate in sampled:
                picked.insert(min(len(picked), 2), candidate)

        return picked or ordered[: min(total, len(ordered))]

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
        matches = 0
        for liked in liked_ingredients:
            if any(liked in line or line in liked for line in normalized_lines):
                matches += 1
        return matches

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
