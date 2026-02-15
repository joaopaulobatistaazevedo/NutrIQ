import json
import logging
import re
import sys
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, Optional
from urllib import error, request
from urllib.parse import quote_plus

from config.settings import get_settings

logger = logging.getLogger(__name__)


class BackendService:
    CARD_ACCENTS = ["is-pingo", "is-continente", "is-lidl"]
    FRESH_TOKENS = {
        "frango",
        "peru",
        "peixe",
        "atum",
        "sardinha",
        "salmao",
        "ovos",
        "ovo",
        "arroz",
        "batata",
        "batata doce",
        "aveia",
        "iogurte",
        "queijo fresco",
        "banana",
        "maca",
        "pera",
        "laranja",
        "brocolos",
        "espinafres",
        "alface",
        "tomate",
        "cebola",
        "alho",
        "cenoura",
        "feijao",
        "grao",
        "lentilhas",
    }
    PROCESSED_TOKENS = {
        "pizza",
        "hamburguer",
        "salsicha",
        "nuggets",
        "bolacha",
        "bolachas",
        "refrigerante",
        "sumo",
        "ketchup",
        "maionese",
        "molho",
        "ultraprocessado",
        "congelado",
        "bacon",
    }

    DAY_TO_OFFSET = {
        "MONDAY": 0,
        "TUESDAY": 1,
        "WEDNESDAY": 2,
        "THURSDAY": 3,
        "FRIDAY": 4,
        "SATURDAY": 5,
        "SUNDAY": 6,
    }

    OFFSET_TO_LABEL = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

    MEAL_TYPE_TO_SLOT = {
        "BREAKFAST": "Pequeno-almoço",
        "LUNCH": "Almoço",
        "DINNER": "Jantar",
        "SNACK": "Snack",
    }

    SLOT_ORDER = {
        "Pequeno-almoço": 0,
        "Almoço": 1,
        "Jantar": 2,
        "Snack": 3,
    }

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

    GOAL_ALIASES = {
        "LOSE_WEIGHT": "LOSE_WEIGHT",
        "EMAGRECER": "LOSE_WEIGHT",
        "PERDER_PESO": "LOSE_WEIGHT",
        "LOSEWEIGHT": "LOSE_WEIGHT",
        "MAINTAIN": "MAINTAIN",
        "MANTER": "MAINTAIN",
        "MANTER_A_FORMA": "MAINTAIN",
        "GAIN_WEIGHT": "BULK",
        "GAIN_MUSCLE": "BULK",
        "GANHAR_PESO": "BULK",
        "GANHAR_MASSA": "BULK",
        "GANHAR_MASSA_MUSCULAR": "BULK",
        "BULK": "BULK",
    }

    RESTRICTION_ALIASES = {
        "VEGETARIANO": "VEGETARIAN",
        "VEGETARIANA": "VEGETARIAN",
        "GLUTENFREE": "GLUTEN_FREE",
        "SEM_GLUTEN": "GLUTEN_FREE",
        "LACTOSEFREE": "LACTOSE_FREE",
        "SEM_LACTOSE": "LACTOSE_FREE",
        "LOWCARB": "LOW_CARB",
        "BAIXO_CARBO": "LOW_CARB",
        "LOWFAT": "LOW_FAT",
        "BAIXA_GORDURA": "LOW_FAT",
        "HIGHPROTEIN": "HIGH_PROTEIN",
        "ALTA_PROTEINA": "HIGH_PROTEIN",
    }

    ALLERGEN_ALIASES = {
        "CRUSTACEOS": "CRUSTACEANS",
        "OVOS": "EGGS",
        "PEIXE": "FISH",
        "AMENDOINS": "PEANUTS",
        "SOJA": "SOYBEANS",
        "LEITE": "MILK",
        "FRUTOS_SECOS": "NUTS",
        "AIPO": "CELERY",
        "MOSTARDA": "MUSTARD",
        "SULFITOS": "SULPHITES",
        "MOLUSCOS": "MOLLUSCS",
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

        if self._update_profile(auth_token, payload):
            return True

        # Fallback: alguns backends rejeitam campos opcionais novos.
        # Tentamos payloads mais restritos para não bloquear o onboarding.
        fallback_payloads = self._build_profile_fallback_payloads(payload)
        for fallback in fallback_payloads:
            if self._update_profile(auth_token, fallback):
                return True

        return False

    def persist_generated_meal_plan(
        self,
        auth_token: Optional[str],
        meal_plan: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        if not auth_token or not isinstance(meal_plan, dict):
            return None

        if meal_plan.get("status") != "generated":
            return None

        week_start = str(meal_plan.get("week_start") or "").strip()
        if not week_start:
            return None

        created_plan = self._create_meal_plan(auth_token, week_start)
        if not created_plan:
            created_plan = self._request_json(
                auth_token,
                method="GET",
                path="/api/meal-plans/active",
            )
            if not isinstance(created_plan, dict):
                return None

        plan_id = created_plan.get("id")
        if not isinstance(plan_id, int):
            return None

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

                recipe_id = self._resolve_or_create_recipe_id(auth_token, meal, meal_type)
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

        if added <= 0:
            # Avoid leaving an empty ACTIVE plan that would shadow valid local plans in the UI.
            self._request_json(
                auth_token,
                method="DELETE",
                path=f"/api/meal-plans/{plan_id}",
            )
            return None

        return self.fetch_active_meal_plan(auth_token)

    def fetch_active_meal_plan(self, auth_token: Optional[str]) -> Optional[Dict[str, Any]]:
        if not auth_token:
            return None

        active_plan = self._request_json(
            auth_token,
            method="GET",
            path="/api/meal-plans/active",
        )
        if not isinstance(active_plan, dict):
            return None

        return self._to_ui_plan(active_plan)

    def generate_and_persist_shopping_cart(
        self,
        auth_token: Optional[str],
        meal_plan: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        if not auth_token or not isinstance(meal_plan, dict):
            return None

        # Source of truth: plano ativo persistido no backend.
        if not isinstance(meal_plan.get("days"), list) or not meal_plan.get("days"):
            persisted_plan = self.fetch_active_meal_plan(auth_token)
            if isinstance(persisted_plan, dict):
                meal_plan = persisted_plan

        ingredient_demand = self._extract_ingredient_demand_from_plan(auth_token, meal_plan)
        if not ingredient_demand:
            logger.warning("Shopping cart generation aborted: no ingredient demand extracted from meal plan.")
            return None

        scraper_report = self._run_supermarket_scraper(ingredient_demand)
        if not scraper_report:
            logger.warning(
                "Shopping cart generation aborted: supermarket scraper returned no report."
            )
            return None

        # Atualiza a BD para manter histórico e disponibilidade no frontend.
        self._request_json(
            auth_token,
            method="POST",
            path="/api/prices/import",
            payload=scraper_report,
        )

        fresh_prices = self._extract_prices_from_scraper_report(scraper_report)
        if not fresh_prices:
            logger.warning(
                "Shopping cart generation failed: fresh scraper report contains no priced items."
            )
            return None

        market_names = self._extract_market_names_from_scraper_report(scraper_report)
        cart_snapshot = self._build_cart_snapshot(
            fresh_prices,
            ingredient_demand,
            meal_plan,
            market_names=market_names,
        )

        if not cart_snapshot:
            logger.warning(
                "Shopping cart generation failed: no market snapshot could be built from fresh scraper prices."
            )
            return None

        saved = self._request_json(
            auth_token,
            method="PUT",
            path="/api/shopping-cart",
            payload=cart_snapshot,
        )
        return saved if isinstance(saved, dict) else cart_snapshot

    def _extract_prices_from_scraper_report(self, report: Dict[str, Any]) -> list[Dict[str, Any]]:
        if not isinstance(report, dict):
            return []

        results_by_market = report.get("results_by_market")
        if not isinstance(results_by_market, dict):
            return []

        prices: list[Dict[str, Any]] = []
        for fallback_market_name, entries in results_by_market.items():
            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                if not bool(entry.get("found")):
                    continue

                ingredient = entry.get("ingredient")
                ingredient_name = ""
                normalized_name = ""
                if isinstance(ingredient, dict):
                    ingredient_name = str(ingredient.get("name") or "").strip()
                    normalized_name = self._normalize_ingredient(
                        ingredient.get("normalized_name") or ingredient_name
                    )

                ingredient_name = ingredient_name or str(entry.get("ingredient_name") or "").strip()
                normalized_name = normalized_name or self._normalize_ingredient(ingredient_name)
                if not normalized_name:
                    continue

                price = self._safe_float(entry.get("price"), default=0.0)
                if price <= 0:
                    continue

                market_name = str(
                    entry.get("supermarket") or fallback_market_name or "Supermercado"
                ).strip() or "Supermercado"
                product_name = str(
                    entry.get("product_name")
                    or entry.get("productName")
                    or ingredient_name
                    or normalized_name
                ).strip()
                if not product_name:
                    product_name = ingredient_name or normalized_name

                prices.append(
                    {
                        "supermarket": market_name,
                        "ingredientNormalized": normalized_name,
                        "ingredientName": ingredient_name or normalized_name,
                        "productName": product_name,
                        "productUrl": str(
                            entry.get("product_url") or entry.get("productUrl") or ""
                        ).strip(),
                        "imageUrl": str(
                            entry.get("image_url") or entry.get("imageUrl") or ""
                        ).strip(),
                        "price": price,
                        "currency": str(entry.get("currency") or "EUR").strip() or "EUR",
                        "calories": self._safe_float(entry.get("calories"), default=0.0),
                        "source": str(entry.get("source") or "scraper_report").strip(),
                        "note": entry.get("note"),
                    }
                )

        return prices

    def _extract_market_names_from_scraper_report(self, report: Dict[str, Any]) -> list[str]:
        if not isinstance(report, dict):
            return []

        market_names: list[str] = []
        seen: set[str] = set()

        markets = report.get("markets")
        if isinstance(markets, list):
            for entry in markets:
                name = ""
                if isinstance(entry, dict):
                    name = str(entry.get("name") or "").strip()
                else:
                    name = str(entry or "").strip()
                if not name or name in seen:
                    continue
                seen.add(name)
                market_names.append(name)

        results_by_market = report.get("results_by_market")
        if isinstance(results_by_market, dict):
            for raw_name in results_by_market.keys():
                name = str(raw_name or "").strip()
                if not name or name in seen:
                    continue
                seen.add(name)
                market_names.append(name)

        return market_names

    def _build_profile_update_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}

        max_budget = data.get("max_weekly_budget")
        if isinstance(max_budget, (int, float)):
            payload["maxWeeklyBudget"] = float(max_budget)

        goal = self._normalize_goal(data.get("goal"))
        if goal:
            payload["goal"] = goal

        restrictions = self._normalize_items(
            data.get("restrictions"),
            self.VALID_RESTRICTIONS,
            aliases=self.RESTRICTION_ALIASES,
        )
        if restrictions:
            payload["restrictions"] = restrictions

        allergens = self._normalize_items(
            data.get("allergens"),
            self.VALID_ALLERGENS,
            aliases=self.ALLERGEN_ALIASES,
        )
        if allergens:
            payload["allergens"] = allergens

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

    def _normalize_items(
        self,
        raw: Any,
        allowed_values: set[str],
        aliases: Optional[Dict[str, str]] = None,
    ) -> list[str]:
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
            if aliases and key in aliases:
                key = aliases[key]
            if key in allowed_values:
                normalized.append(key)

        return sorted(set(normalized))

    def _normalize_goal(self, raw: Any) -> Optional[str]:
        if not isinstance(raw, str):
            return None
        key = raw.strip().upper().replace("-", "_").replace(" ", "_")
        key = self.GOAL_ALIASES.get(key, key)
        return key if key in {"LOSE_WEIGHT", "MAINTAIN", "BULK"} else None

    def _build_profile_fallback_payloads(self, payload: Dict[str, Any]) -> list[Dict[str, Any]]:
        fallbacks: list[Dict[str, Any]] = []

        # Primeiro remove os campos mais suscetíveis de não existir no schema do backend.
        optional_food_fields = {
            key: value
            for key, value in payload.items()
            if key not in {"favoriteFoods", "dislikedIngredients"}
        }
        if optional_food_fields and optional_food_fields != payload:
            fallbacks.append(optional_food_fields)

        # Depois tenta só os campos clássicos de onboarding suportados historicamente.
        conservative_keys = ("maxWeeklyBudget", "restrictions", "allergens")
        conservative = {key: payload[key] for key in conservative_keys if key in payload}
        if conservative and conservative not in fallbacks:
            fallbacks.append(conservative)

        # Último recurso: tentar cada campo isoladamente.
        for key, value in payload.items():
            single = {key: value}
            if single not in fallbacks:
                fallbacks.append(single)

        return fallbacks

    def _extract_ingredient_demand_from_plan(
        self,
        auth_token: str,
        meal_plan: Dict[str, Any],
    ) -> Dict[str, Dict[str, Any]]:
        demand: Dict[str, Dict[str, Any]] = {}

        recipe_ids: set[int] = set()
        for day in meal_plan.get("days") or []:
            if not isinstance(day, dict):
                continue
            for meal in day.get("meals") or []:
                if not isinstance(meal, dict):
                    continue
                recipe_id = meal.get("recipe_id", meal.get("recipeId"))
                if isinstance(recipe_id, int) and recipe_id > 0:
                    recipe_ids.add(recipe_id)
                elif isinstance(recipe_id, str) and recipe_id.isdigit():
                    recipe_ids.add(int(recipe_id))

        if recipe_ids:
            for recipe_id in sorted(recipe_ids):
                recipe = self._request_json(
                    auth_token,
                    method="GET",
                    path=f"/api/recipes/{recipe_id}",
                )
                if not isinstance(recipe, dict):
                    continue
                ingredients = recipe.get("ingredients")
                if not isinstance(ingredients, list):
                    ingredients = []

                for entry in ingredients:
                    if not isinstance(entry, dict):
                        continue
                    raw_name = str(
                        entry.get("ingredientName")
                        or entry.get("name")
                        or ""
                    ).strip()
                    name = self._clean_ingredient_name(raw_name)
                    if not name:
                        continue

                    normalized = self._normalize_ingredient(name)
                    if not normalized:
                        continue

                    quantity = self._safe_float(entry.get("quantity"), default=1.0)
                    if quantity <= 0:
                        quantity = 1.0

                    current = demand.get(normalized)
                    if current is None:
                        demand[normalized] = {
                            "ingredient_name": name,
                            "quantity": quantity,
                            "unit": str(entry.get("unit") or "").strip() or None,
                        }
                    else:
                        current["quantity"] = float(current.get("quantity") or 0.0) + quantity

                # Fallback for mirrored MySQL recipes where ingredients are not structured.
                for raw_name in self._extract_ingredients_from_recipe_description(recipe):
                    name = self._clean_ingredient_name(raw_name)
                    if not name:
                        continue
                    normalized = self._normalize_ingredient(name)
                    if not normalized or normalized in demand:
                        continue
                    demand[normalized] = {
                        "ingredient_name": name,
                        "quantity": 1.0,
                        "unit": None,
                    }

        for day in meal_plan.get("days") or []:
            if not isinstance(day, dict):
                continue
            for meal in day.get("meals") or []:
                if not isinstance(meal, dict):
                    continue
                inline_ingredients = meal.get("ingredients")
                if isinstance(inline_ingredients, list):
                    for raw_ingredient in inline_ingredients:
                        name = ""
                        quantity = 1.0
                        unit = None
                        if isinstance(raw_ingredient, dict):
                            name = self._clean_ingredient_name(
                                raw_ingredient.get("name")
                                or raw_ingredient.get("ingredientName")
                            )
                            parsed_quantity = self._safe_float(raw_ingredient.get("quantity"), default=1.0)
                            quantity = parsed_quantity if parsed_quantity > 0 else 1.0
                            raw_unit = str(raw_ingredient.get("unit") or "").strip()
                            unit = raw_unit or None
                        else:
                            name = self._clean_ingredient_name(raw_ingredient)

                        if not name:
                            continue
                        normalized = self._normalize_ingredient(name)
                        if not normalized:
                            continue

                        current = demand.get(normalized)
                        if current is None:
                            demand[normalized] = {
                                "ingredient_name": name,
                                "quantity": quantity,
                                "unit": unit,
                            }
                        else:
                            current["quantity"] = float(current.get("quantity") or 0.0) + quantity
                            if current.get("unit") != unit:
                                current["unit"] = current.get("unit") or unit

                preview = meal.get("ingredients_preview")
                if not isinstance(preview, list):
                    continue
                for raw_name in preview:
                    name = self._clean_ingredient_name(raw_name)
                    if not name:
                        continue
                    normalized = self._normalize_ingredient(name)
                    if not normalized:
                        continue
                    if normalized in demand:
                        continue
                    current = demand.get(normalized)
                    if current is None:
                        demand[normalized] = {
                            "ingredient_name": name,
                            "quantity": 1.0,
                            "unit": None,
                        }
                    else:
                        current["quantity"] = float(current.get("quantity") or 0.0) + 1.0

        return demand

    def _extract_ingredients_from_recipe_description(self, recipe: Dict[str, Any]) -> list[str]:
        description = str(recipe.get("description") or "").strip()
        if not description:
            return []

        match = re.search(r"\bingredientes?\s*:\s*(.+)$", description, flags=re.IGNORECASE)
        if not match:
            return []

        chunk = match.group(1).strip()
        chunk = chunk.split("|", 1)[0].strip()
        if not chunk:
            return []

        items: list[str] = []
        for token in re.split(r"[;,]", chunk):
            cleaned = self._clean_ingredient_name(token)
            if cleaned:
                items.append(cleaned)
        return items

    def _run_supermarket_scraper(
        self,
        ingredient_demand: Dict[str, Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        workspace_root = self._resolve_scraper_workspace_root()
        if workspace_root is None:
            logger.warning(
                "Shopping cart generation: scraper workspace not found (missing supermarket_scraper or examples/markets.json)."
            )
            return None

        if str(workspace_root) not in sys.path:
            sys.path.insert(0, str(workspace_root))

        markets_path = workspace_root / "examples" / "markets.json"
        if not markets_path.exists():
            logger.warning(
                "Shopping cart generation: markets config not found at %s.",
                markets_path,
            )
            return None

        try:
            from supermarket_scraper.models import IngredientNeed
            from supermarket_scraper.report import build_json_report
            from supermarket_scraper.scraper import SupermarketScraper, load_market_configs

            ingredients = [
                IngredientNeed(
                    name=item["ingredient_name"],
                    normalized_name=normalized,
                    quantity=float(item.get("quantity") or 1.0),
                    unit=item.get("unit"),
                )
                for normalized, item in ingredient_demand.items()
                if item.get("ingredient_name")
            ]
            if not ingredients:
                return None

            markets = load_market_configs(markets_path)
            total_tasks = max(1, len(ingredients) * len(markets))
            dynamic_workers = max(8, min(len(ingredients), 48))
            effective_workers = min(total_tasks, dynamic_workers)

            logger.info(
                "Shopping cart generation: running supermarket scraper with %s ingredients, %s markets, %s workers.",
                len(ingredients),
                len(markets),
                effective_workers,
            )
            scraper = SupermarketScraper(
                timeout_seconds=6.5,
                max_workers=effective_workers,
                connect_timeout_seconds=2.0,
                delay_scale=0.02,
                max_product_pages=0,
                max_search_candidates=24,
                disable_nutrition_tab=True,
                selectors_only=True,
                request_retries=0,
            )
            matches = scraper.scrape(ingredients=ingredients, markets=markets)
            return build_json_report(ingredients=ingredients, markets=markets, matches=matches)
        except Exception:
            logger.exception("Shopping cart generation: supermarket scraper execution failed.")
            return None

    def _resolve_scraper_workspace_root(self) -> Optional[Path]:
        service_root = Path(__file__).resolve().parents[1]

        candidates = [
            service_root.parent,
            service_root,
            Path.cwd().resolve(),
        ]

        seen: set[str] = set()
        for candidate in candidates:
            candidate_path = candidate.resolve()
            marker = str(candidate_path)
            if marker in seen:
                continue
            seen.add(marker)

            if (
                (candidate_path / "supermarket_scraper").is_dir()
                and (candidate_path / "examples" / "markets.json").exists()
            ):
                return candidate_path

        return None

    def _build_cart_snapshot(
        self,
        prices: list[Dict[str, Any]],
        ingredient_demand: Dict[str, Dict[str, Any]],
        meal_plan: Dict[str, Any],
        market_names: Optional[list[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        budget_limit = self._safe_float(meal_plan.get("max_weekly_budget"), default=0.0)
        goal_daily_calories = self._safe_float(meal_plan.get("goal_daily_calories"), default=0.0)
        planning_days = self._safe_int(meal_plan.get("planning_days"), default=7)
        if planning_days <= 0:
            planning_days = 7
        target_weekly_calories = goal_daily_calories * planning_days if goal_daily_calories > 0 else 0.0

        best_by_market: Dict[str, Dict[str, Dict[str, Any]]] = {}

        for entry in prices:
            if not isinstance(entry, dict):
                continue

            supermarket = str(entry.get("supermarket") or "").strip()
            if not supermarket:
                continue

            normalized = self._normalize_ingredient(
                entry.get("ingredientNormalized")
                or entry.get("ingredientName")
                or ""
            )
            if not normalized or normalized not in ingredient_demand:
                continue

            price = self._safe_float(entry.get("price"), default=0.0)
            if price <= 0:
                continue

            market_bucket = best_by_market.setdefault(supermarket, {})
            previous = market_bucket.get(normalized)
            if previous is None or price < self._safe_float(previous.get("price"), default=0.0):
                market_bucket[normalized] = entry

        if not best_by_market:
            return None

        if isinstance(market_names, list):
            for market_name in market_names:
                normalized_name = str(market_name or "").strip()
                if normalized_name:
                    best_by_market.setdefault(normalized_name, {})

        demand_keys = list(ingredient_demand.keys())
        lists: Dict[str, Dict[str, Any]] = {}
        comparison: list[Dict[str, Any]] = []
        best_market_key = ""
        best_market_total = float("inf")
        best_market_score = float("inf")

        for index, (market_name, market_map) in enumerate(best_by_market.items()):
            subtotal = 0.0
            covered = 0
            calories_total = 0.0
            health_points = 0.0
            items: list[Dict[str, Any]] = []

            for item_index, ingredient_key in enumerate(demand_keys):
                found = market_map.get(ingredient_key)
                if not found:
                    continue

                covered += 1
                demand = ingredient_demand[ingredient_key]
                unit_price = self._safe_float(found.get("price"), default=0.0)
                # Scraper price already reflects the required demand for this ingredient.
                subtotal += unit_price
                item_calories = self._safe_float(found.get("calories"), default=0.0)
                calories_total += max(0.0, item_calories)

                ingredient_name = str(demand.get("ingredient_name") or ingredient_key).strip() or ingredient_key
                product_name = str(found.get("productName") or ingredient_name).strip() or ingredient_name
                slug_market = self._slugify(market_name) or "market"
                slug_ingredient = self._slugify(ingredient_key) or "ingredient"
                health_points += self._health_signal(ingredient_name, product_name)

                items.append(
                    {
                        "id": f"{slug_market}-{slug_ingredient}-{item_index}",
                        "ingredientName": ingredient_name,
                        "name": product_name,
                        "unitInfo": str(found.get("note") or found.get("source") or "preço importado").strip(),
                        "unitPrice": unit_price,
                        "discount": 0,
                        "quantity": 1,
                        "checked": False,
                        "currency": str(found.get("currency") or "EUR").strip() or "EUR",
                        "productUrl": str(found.get("productUrl") or "").strip(),
                        "imageUrl": str(found.get("imageUrl") or "").strip(),
                    }
                )

            market_key = self._slugify(market_name) or f"market_{index}"
            lists[market_key] = {
                "name": market_name,
                "accentClass": self.CARD_ACCENTS[index % len(self.CARD_ACCENTS)],
                "items": items,
            }

            comparison_item = {
                "marketKey": market_key,
                "supermarket": market_name,
                "total": round(subtotal, 2),
                "missingCount": max(0, len(demand_keys) - covered),
                "coveredCount": covered,
                "totalIngredients": len(demand_keys),
                "calories": round(calories_total, 0),
                "healthScore": round((health_points / max(1, covered)) * 100, 2),
            }

            missing_count = max(0, len(demand_keys) - covered)
            budget_penalty = 0.0
            if budget_limit > 0 and subtotal > budget_limit:
                budget_penalty = (subtotal - budget_limit) * 8.0

            calorie_penalty = 0.0
            if target_weekly_calories > 0:
                if calories_total <= 0:
                    calorie_penalty = 12.0
                else:
                    calorie_penalty = (
                        abs(calories_total - target_weekly_calories)
                        / max(1.0, target_weekly_calories)
                    ) * 20.0

            coverage_penalty = float(missing_count) * 25.0
            health_bonus = max(0.0, health_points) * 1.25
            market_score = subtotal + budget_penalty + calorie_penalty + coverage_penalty - health_bonus

            comparison_item["marketScore"] = round(market_score, 3)
            comparison_item["budgetPenalty"] = round(budget_penalty, 3)
            comparison_item["caloriePenalty"] = round(calorie_penalty, 3)
            comparison.append(comparison_item)

            if market_score < best_market_score:
                best_market_score = market_score
                best_market_total = subtotal
                best_market_key = market_key
            elif covered == len(demand_keys) and subtotal < best_market_total and best_market_key == "":
                best_market_total = subtotal
                best_market_key = market_key

        comparison.sort(
            key=lambda item: (
                self._safe_float(item.get("marketScore"), default=float("inf")),
                self._safe_float(item.get("total"), default=float("inf")),
            )
        )

        if not best_market_key and comparison:
            best_market_key = str(comparison[0].get("marketKey") or "")
            best_market_total = self._safe_float(comparison[0].get("total"), default=0.0)

        optimized_total = 0.0
        missing_ingredients: list[str] = []
        for ingredient_key in demand_keys:
            prices_for_ingredient: list[float] = []
            for market_map in best_by_market.values():
                candidate = market_map.get(ingredient_key)
                if not candidate:
                    continue
                value = self._safe_float(candidate.get("price"), default=0.0)
                if value > 0:
                    prices_for_ingredient.append(value)

            if not prices_for_ingredient:
                missing_ingredients.append(
                    str(ingredient_demand[ingredient_key].get("ingredient_name") or ingredient_key)
                )
                continue

            optimized_total += min(prices_for_ingredient)

        active_list_id = best_market_key or (next(iter(lists.keys())) if lists else "")
        if not active_list_id:
            return None

        return {
            "lists": lists,
            "activeListId": active_list_id,
            "comparison": comparison,
            "totalsByMarket": [
                {
                    "marketKey": str(entry.get("marketKey") or ""),
                    "supermarket": str(entry.get("supermarket") or ""),
                    "totalPrice": self._safe_float(entry.get("total"), default=0.0),
                    "totalCalories": self._safe_float(entry.get("calories"), default=0.0),
                }
                for entry in comparison
            ],
            "optimizedTotal": round(optimized_total, 2),
            "cartSource": "meal-plan",
            "lastGeneratedSignature": self._plan_signature(meal_plan.get("days") or []),
            "missingIngredients": missing_ingredients,
            "strategy": {
                "type": "balanced_cheapest_healthy",
                "budgetLimit": budget_limit if budget_limit > 0 else None,
                "goalDailyCalories": goal_daily_calories if goal_daily_calories > 0 else None,
                "planningDays": planning_days,
            },
            "savedAt": datetime.utcnow().isoformat() + "Z",
        }

    def _plan_signature(self, meal_days: Iterable[Dict[str, Any]]) -> str:
        parts: list[str] = []
        for day in meal_days:
            if not isinstance(day, dict):
                continue
            date_text = str(day.get("date") or "")
            meals = day.get("meals") if isinstance(day.get("meals"), list) else []
            meal_signature = "|".join(
                f"{meal.get('meal_id', '')}:{meal.get('recipe_id', meal.get('recipeId', ''))}:{meal.get('title', '')}"
                for meal in meals
                if isinstance(meal, dict)
            )
            parts.append(f"{date_text}=>{meal_signature}")
        return "#".join(parts)

    def _normalize_ingredient(self, raw: Any) -> str:
        text = str(raw or "").strip()
        if not text:
            return ""
        decomposed = unicodedata.normalize("NFKD", text)
        without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
        compact = re.sub(r"[^a-z0-9\s]", " ", without_marks.lower())
        return re.sub(r"\s+", " ", compact).strip()

    def _clean_ingredient_name(self, raw: Any) -> str:
        text = str(raw or "").strip()
        if not text:
            return ""

        text = re.sub(r"\([^)]*\)", " ", text)
        text = text.replace("q.b.", " ").replace("q.b", " ").replace("qb", " ")
        text = re.sub(r"^[\-\*\u2022\s]+", "", text)
        text = re.sub(
            r"^\s*(?:\d+\s*/\s*\d+|\d+(?:[.,]\d+)?)\s*"
            r"(?:(?:kg|g|gr|gramas?|ml|l|dl|cl|un|unid(?:ade)?s?|dentes?|"
            r"colher(?:es)?(?:\s+de\s+(?:sopa|cha|chá))?|"
            r"chavenas?|chávenas?|xicaras?|xícaras?)\b)?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r"\s+", " ", text).strip(" ,.;:-")
        return text

    def _slugify(self, raw: Any) -> str:
        token = self._normalize_ingredient(raw)
        if not token:
            return ""
        return token.replace(" ", "_")

    def _health_signal(self, ingredient_name: str, product_name: str) -> float:
        ingredient = self._normalize_ingredient(ingredient_name)
        product = self._normalize_ingredient(product_name)
        text = f"{ingredient} {product}".strip()

        signal = 0.0
        if any(token in text for token in self.FRESH_TOKENS):
            signal += 1.0
        if any(token in text for token in self.PROCESSED_TOKENS):
            signal -= 1.0
        if "integral" in text:
            signal += 0.5
        if "sem acucar" in text or "sem açúcar" in text:
            signal += 0.5
        return signal

    def _create_meal_plan(self, auth_token: str, week_start: str) -> Optional[Dict[str, Any]]:
        response = self._request_json(
            auth_token,
            method="POST",
            path="/api/meal-plans",
            payload={"weekStart": week_start},
        )
        return response if isinstance(response, dict) else None

    def _resolve_or_create_recipe_id(
        self,
        auth_token: str,
        meal: Dict[str, Any],
        meal_type: str,
    ) -> Optional[int]:
        recipe_id = self._resolve_recipe_id(auth_token, meal)
        if recipe_id is not None:
            return recipe_id
        return self._create_recipe_from_generated_meal(auth_token, meal, meal_type)

    def _resolve_recipe_id(self, auth_token: str, meal: Dict[str, Any]) -> Optional[int]:
        raw_id = meal.get("recipe_id")
        if isinstance(raw_id, int):
            return raw_id if self._recipe_exists(auth_token, raw_id) else None
        if isinstance(raw_id, str) and raw_id.isdigit():
            parsed = int(raw_id)
            return parsed if self._recipe_exists(auth_token, parsed) else None

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

    def _recipe_exists(self, auth_token: str, recipe_id: int) -> bool:
        if recipe_id <= 0:
            return False

        recipe = self._request_json(
            auth_token,
            method="GET",
            path=f"/api/recipes/{recipe_id}",
        )
        return isinstance(recipe, dict) and isinstance(recipe.get("id"), int)

    def _create_recipe_from_generated_meal(
        self,
        auth_token: str,
        meal: Dict[str, Any],
        meal_type: str,
    ) -> Optional[int]:
        title = str(meal.get("title") or "").strip()
        if not title:
            return None

        duration = self._safe_int(meal.get("duration_minutes"), default=0)
        calories = self._safe_float(meal.get("calories_per_serving"), default=0.0)
        protein = self._safe_float(meal.get("protein_g"), default=0.0)
        carbs = self._safe_float(meal.get("carbs_g"), default=0.0)
        fat = self._safe_float(meal.get("fat_g"), default=0.0)

        source = str(meal.get("source") or "").strip()
        url = str(meal.get("url") or "").strip()
        description_bits = ["Receita gerada automaticamente pelo nutricionista virtual."]
        if source:
            description_bits.append(f"Fonte: {source}.")
        if url:
            description_bits.append(f"URL: {url}")

        payload: Dict[str, Any] = {
            "name": title,
            "description": " ".join(description_bits).strip(),
            "mealType": meal_type,
            "prepTimeMin": max(duration, 0),
            "cookTimeMin": 0,
            "servings": 1,
            "ingredients": [],
            "steps": [
                {
                    "stepOrder": 1,
                    "description": "Preparar e servir conforme instruções da receita.",
                    "durationMinutes": max(duration, 0),
                }
            ],
            "nutritionalInfo": {
                "calories": max(calories, 0.0),
                "proteinG": max(protein, 0.0),
                "carbsG": max(carbs, 0.0),
                "fatG": max(fat, 0.0),
            },
        }

        created = self._request_json(
            auth_token,
            method="POST",
            path="/api/recipes",
            payload=payload,
        )
        if isinstance(created, dict) and isinstance(created.get("id"), int):
            return created["id"]
        return None

    def _slot_to_meal_type(self, slot: Any) -> Optional[str]:
        value = str(slot or "").strip().casefold()
        mapping = {
            "pequeno-almoço": "BREAKFAST",
            "pequeno almoço": "BREAKFAST",
            "breakfast": "BREAKFAST",
            "almoço": "LUNCH",
            "almoco": "LUNCH",
            "lunch": "LUNCH",
            "jantar": "DINNER",
            "dinner": "DINNER",
            "snack": "SNACK",
        }
        return mapping.get(value)

    def _safe_int(self, raw: Any, default: int = 0) -> int:
        try:
            return int(raw)
        except (TypeError, ValueError):
            return default

    def _safe_float(self, raw: Any, default: float = 0.0) -> float:
        try:
            return float(raw)
        except (TypeError, ValueError):
            return default

    def _to_ui_plan(self, plan: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        week_start_raw = self._normalize_week_start(plan.get("weekStart"))
        if not week_start_raw:
            return None

        try:
            week_start_date = datetime.fromisoformat(week_start_raw).date()
        except (TypeError, ValueError):
            return None

        grouped: Dict[str, list[Dict[str, Any]]] = {}
        meals = plan.get("meals") if isinstance(plan.get("meals"), list) else []

        for meal in meals:
            if not isinstance(meal, dict):
                continue

            day_of_week = str(meal.get("dayOfWeek") or "").upper()
            meal_type = str(meal.get("mealType") or "").upper()

            offset = self.DAY_TO_OFFSET.get(day_of_week)
            slot = self.MEAL_TYPE_TO_SLOT.get(meal_type)
            if offset is None or slot is None:
                continue

            meal_date = week_start_date + timedelta(days=offset)
            date_iso = meal_date.isoformat()

            grouped.setdefault(date_iso, []).append(
                {
                    "slot": slot,
                    "title": str(meal.get("recipeName") or "Refeição").strip() or "Refeição",
                    "source": "backend",
                    "recipe_id": meal.get("recipeId"),
                    "meal_id": meal.get("id"),
                    "completed": bool(meal.get("completed")),
                    "completed_at": meal.get("completedAt"),
                }
            )

        days = []
        for offset in range(7):
            meal_date = week_start_date + timedelta(days=offset)
            date_iso = meal_date.isoformat()
            day_meals = grouped.get(date_iso, [])
            day_meals.sort(key=lambda item: self.SLOT_ORDER.get(str(item.get("slot")), 99))

            days.append(
                {
                    "date": date_iso,
                    "day_label": self.OFFSET_TO_LABEL[offset],
                    "meals": day_meals,
                }
            )

        total_meals = sum(len(day.get("meals") or []) for day in days)
        if total_meals <= 0:
            return None

        return {
            "status": "generated",
            "source": "backend_active_plan",
            "week_start": week_start_raw,
            "total_cost": self._safe_float(plan.get("totalCost"), default=0.0),
            "days": days,
        }

    def _normalize_week_start(self, raw_week_start: Any) -> str:
        if isinstance(raw_week_start, str):
            return raw_week_start.strip()

        if isinstance(raw_week_start, list) and len(raw_week_start) >= 3:
            try:
                year = int(raw_week_start[0])
                month = int(raw_week_start[1])
                day = int(raw_week_start[2])
                return f"{year:04d}-{month:02d}-{day:02d}"
            except (TypeError, ValueError):
                return ""

        return ""

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
        except error.HTTPError as exc:
            details = ""
            try:
                details = exc.read().decode("utf-8").strip()
            except Exception:
                details = ""
            logger.warning(
                "Backend HTTP error on %s %s: status=%s body=%s",
                method,
                path,
                exc.code,
                (details[:400] if details else "<empty>"),
            )
            return None
        except error.URLError as exc:
            logger.warning("Backend URL error on %s %s: %s", method, path, exc)
            return None
        except TimeoutError:
            logger.warning("Backend timeout on %s %s", method, path)
            return None
        except ValueError:
            logger.warning("Backend returned invalid JSON on %s %s", method, path)
            try:
                detail = exc.read().decode("utf-8", errors="ignore")
            except Exception:
                detail = ""
            logger.warning(
                "Backend HTTPError %s em %s %s payload=%s detail=%s",
                exc.code,
                method,
                path,
                payload,
                detail,
            )
            return None
        except error.URLError as exc:
            logger.warning("Backend URLError em %s %s: %s", method, path, exc)
            return None
        except TimeoutError:
            logger.warning("Backend timeout em %s %s", method, path)
            return None
        except ValueError as exc:
            logger.warning("Backend resposta JSON inválida em %s %s: %s", method, path, exc)
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