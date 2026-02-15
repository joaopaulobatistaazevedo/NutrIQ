"""
genetic_algorithm.py
━━━━━━━━━━━━━━━━━━━
Goal-aware genetic algorithm for weekly meal plan optimisation.

Implements a weighted multi-criteria fitness:
  0.30 × objective nutrition
  0.25 × food preferences
  0.20 × budget
  0.15 × professional source validation
  0.10 × nutritional quality
  + practicality bonus (max +50)

Hard constraints (invalid plan => -1000):
  - daily calories within ±15% of target
  - weekly cost <= budget (if budget provided)
  - no excluded ingredients
  - at least 3 and at most 6 meals/day
  - daily protein >= 0.8 × protein target
  - each main meal >= 400 kcal and >= 12g protein
"""

from __future__ import annotations

import random
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from services.supermarket_scraper_service import PricedRecipe


GOAL_PROFILES: dict[str, dict[str, Any]] = {
    "lose_weight": {
        "calorie_delta": -400,
        "protein_g_per_kg": 1.8,
        "macro_ranges": {
            "protein": (0.30, 0.35),
            "fat": (0.20, 0.25),
            "carb": (0.40, 0.50),
        },
        "slot_protein_min": 20,
    },
    "gain_weight": {
        "calorie_delta": 400,
        "protein_g_per_kg": 1.6,
        "macro_ranges": {
            "protein": (0.20, 0.25),
            "fat": (0.25, 0.30),
            "carb": (0.50, 0.55),
        },
        "slot_protein_min": 20,
    },
    "maintain": {
        "calorie_delta": 0,
        "protein_g_per_kg": 1.4,
        "macro_ranges": {
            "protein": (0.25, 0.30),
            "fat": (0.25, 0.30),
            "carb": (0.45, 0.50),
        },
        "slot_protein_min": 20,
    },
    "gain_muscle": {
        "calorie_delta": 300,
        "protein_g_per_kg": 2.0,
        "macro_ranges": {
            "protein": (0.30, 0.35),
            "fat": (0.20, 0.25),
            "carb": (0.45, 0.50),
        },
        "slot_protein_min": 25,
    },
}

SLOT_CALORIE_SPLIT: dict[str, float] = {
    "Pequeno-almoço": 0.25,
    "Almoço": 0.40,
    "Jantar": 0.35,
}

SLOTS = list(SLOT_CALORIE_SPLIT.keys())

BREAKFAST_KEYWORDS = {
    "aveia", "iogurte", "panqueca", "panquecas", "muesli", "granola", "torrada",
    "omelete", "papas", "batido", "fruta", "cereais", "crepe", "crepes",
    "overnight oats", "smoothie", "tosta", "waffle", "waffles", "croissant",
    "bagel", "tosta mista", "toast", "pão com", "pao com",
}

SNACK_KEYWORDS = {
    "snack", "barra", "barrita", "bolacha", "bolachas", "cookie", "cookies",
    "queque", "queques", "muffin", "muffins", "croissant", "donut", "doughnut",
    "tosta", "torrada", "sandes", "sanduiche", "sanduíche", "wrap",
    "chips", "aperitivo",
}

MAIN_ONLY_KEYWORDS = {
    "bacalhau", "bife", "costela", "feijoada", "cozido", "arroz de",
    "frango assado", "frango no forno", "massa com", "esparguete",
    "risotto", "lasanha", "moussaka", "stew", "estufado",
    "carne de porco", "lombo", "entrecosto", "churrasco",
    "caril", "curry", "guisado", "salmão no forno", "salmao no forno",
}

DESSERT_KEYWORDS = {
    "bolo", "tarte", "torta", "pudim", "mousse", "brownie",
    "cookie", "cupcake", "cheesecake", "gelado", "sobremesa",
    "doce", "brigadeiro", "tiramisu", "pavlova", "muffin", "donut",
    "chocolate quente", "leite creme", "arroz doce", "panna cotta",
}


@dataclass
class MealSlot:
    day: int
    slot: str
    recipe: PricedRecipe


@dataclass
class Individual:
    slots: list[MealSlot]
    fitness: float = field(default=0.0, compare=False)


def _safe_float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalise_text_list(items: list[str] | None) -> list[str]:
    if not items:
        return []
    return [str(item).lower().strip() for item in items if str(item).strip()]


def _macro_ratio(recipe: PricedRecipe) -> tuple[float, float, float]:
    calories = max(_safe_float(recipe.calories_per_serving), 1.0)
    protein_ratio = (_safe_float(recipe.protein_g) * 4.0) / calories
    fat_ratio = (_safe_float(recipe.fat_g) * 9.0) / calories
    carb_ratio = (_safe_float(recipe.carbs_g) * 4.0) / calories
    return protein_ratio, fat_ratio, carb_ratio


def slot_fitness(
    recipe: PricedRecipe,
    slot: str,
    profile: dict[str, Any],
    liked: list[str],
    disliked: list[str],
) -> float:
    """Compatibility helper retained for external callers/tests."""
    liked_norm = _normalise_text_list(liked)
    disliked_norm = _normalise_text_list(disliked)

    calories = _safe_float(recipe.calories_per_serving)
    protein = _safe_float(recipe.protein_g)
    cost = max(_safe_float(recipe.cost_per_serving), 0.01)

    target_daily = profile.get("daily_calories", 2200)
    target_slot = target_daily * SLOT_CALORIE_SPLIT.get(slot, 1 / 3)
    diff = abs(target_slot - calories)

    if target_slot <= 0:
        cal_score = 0.0
    else:
        pct = diff / target_slot
        if pct <= 0.05:
            cal_score = 100.0
        elif pct <= 0.10:
            cal_score = 80.0
        elif pct <= 0.15:
            cal_score = 50.0
        else:
            cal_score = 0.0

    ingredient_text = " ".join(recipe.ingredients).lower()
    liked_hits = sum(1 for token in liked_norm if token and token in ingredient_text)
    disliked_hits = sum(1 for token in disliked_norm if token and token in ingredient_text)

    pref_score = min(30.0, liked_hits * 12.0) - (100.0 if disliked_hits else 0.0)
    protein_density = protein / max(calories, 1.0)
    score = (0.6 * cal_score + 0.4 * max(0.0, pref_score) + protein_density * 100.0) / cost
    return max(0.0, score)


class MealPlanGA:
    def __init__(
        self,
        recipes: list[PricedRecipe],
        goal: str,
        planning_days: int,
        liked: list[str],
        disliked: list[str],
        max_weekly_budget: float = 0.0,
        excluded_recipe_ids: list[str] | None = None,
        population_size: int = 120,
        generations: int = 180,
        elite_k: int = 12,
        mutation_rate: float = 0.22,
        tdee: float | None = None,
        body_weight_kg: float | None = None,
        calorie_adjustment_per_day: float = 0.0,
    ) -> None:
        planning_days_sanitized = max(1, min(planning_days, 14))
        requested_exclusions = {str(x).strip() for x in (excluded_recipe_ids or []) if str(x).strip()}
        usable = [r for r in recipes if r.title and str(r.id).strip() not in requested_exclusions]
        if len(usable) < max(9, planning_days_sanitized * 2):
            usable = [r for r in recipes if r.title]
        self.recipes = usable
        if not self.recipes:
            raise ValueError("No valid recipes supplied to MealPlanGA.")

        self.goal = goal if goal in GOAL_PROFILES else "maintain"
        self.profile = GOAL_PROFILES[self.goal]
        self.planning_days = planning_days_sanitized

        self.liked = _normalise_text_list(liked)
        self.disliked = _normalise_text_list(disliked)

        self.budget = max(_safe_float(max_weekly_budget), 0.0)
        self.pop_size = max(population_size, 20)
        self.generations = max(generations, 30)
        self.elite_k = max(1, min(elite_k, self.pop_size // 2))
        self.mutation_rate = min(max(mutation_rate, 0.0), 1.0)

        base_tdee = _safe_float(tdee)
        if base_tdee <= 0:
            base_tdee = 2200.0

        base_weight = _safe_float(body_weight_kg)
        if base_weight <= 0:
            base_weight = 70.0

        self.daily_calorie_target = max(1200.0, base_tdee + float(self.profile["calorie_delta"]) + calorie_adjustment_per_day)
        self.daily_protein_target = max(60.0, base_weight * float(self.profile["protein_g_per_kg"]))

        self.profile = {
            **self.profile,
            "daily_calories": self.daily_calorie_target,
            "daily_protein_target": self.daily_protein_target,
        }

        self._recipe_by_id = {r.id: r for r in self.recipes}
        self._has_liked_candidates = False
        if self.liked:
            self._has_liked_candidates = any(
                any(token and token in self._recipe_text(recipe) for token in self.liked)
                for recipe in self.recipes
            )

        # ── Slot-aware recipe categorisation ────────────────────────────
        # Each slot has a calorie target window and keyword signals.
        # A recipe is "breakfast-appropriate" if it satisfies calorie range
        # AND doesn't contain dinner/lunch-only signals.
        # A recipe is "main-meal-appropriate" if it's not a light breakfast item.

        breakfast_cal_lo = self.daily_calorie_target * SLOT_CALORIE_SPLIT["Pequeno-almoço"] * 0.60
        breakfast_cal_hi = self.daily_calorie_target * SLOT_CALORIE_SPLIT["Pequeno-almoço"] * 1.80

        def _is_breakfast(r: PricedRecipe) -> bool:
            text = self._recipe_text(r)
            # Hard reject: clearly a dinner dish or dessert
            if any(kw in text for kw in MAIN_ONLY_KEYWORDS):
                return False
            if any(kw in text for kw in DESSERT_KEYWORDS):
                return False
            # Positive signal: has breakfast keyword
            if any(kw in text for kw in BREAKFAST_KEYWORDS):
                return True
            # Fallback: only lighter/high-protein recipes can pass as breakfast
            cal = _safe_float(r.calories_per_serving)
            if cal > 0:
                return breakfast_cal_lo <= cal <= breakfast_cal_hi and _safe_float(r.protein_g) >= 6.0
            return False

        def _is_main_meal(r: PricedRecipe) -> bool:
            text = self._recipe_text(r)
            # Hard reject desserts from main meal slots
            if any(kw in text for kw in DESSERT_KEYWORDS):
                return False
            # Hard reject explicit snacks from lunch/dinner slots
            if any(kw in text for kw in SNACK_KEYWORDS):
                return False
            # Explicit breakfast items should not appear as main meals
            if any(kw in text for kw in BREAKFAST_KEYWORDS):
                return False
            return True

        self._breakfast_pool: list[PricedRecipe] = [r for r in self.recipes if _is_breakfast(r)]
        self._main_pool: list[PricedRecipe] = [r for r in self.recipes if _is_main_meal(r)]

        # Ensure minimum pool sizes — expand gracefully if filtering is too aggressive
        if len(self._breakfast_pool) < 5:
            # Fallback: any recipe with calories in breakfast range
            self._breakfast_pool = [
                r for r in self.recipes
                if not any(kw in self._recipe_text(r) for kw in DESSERT_KEYWORDS)
                and not any(kw in self._recipe_text(r) for kw in MAIN_ONLY_KEYWORDS)
                and (_safe_float(r.calories_per_serving) <= breakfast_cal_hi or _safe_float(r.calories_per_serving) == 0)
            ] or list(self.recipes)

        if len(self._main_pool) < 5:
            self._main_pool = [
                r for r in self.recipes
                if not any(kw in self._recipe_text(r) for kw in DESSERT_KEYWORDS)
                and not any(kw in self._recipe_text(r) for kw in BREAKFAST_KEYWORDS)
            ]
            if not self._main_pool:
                # Last resort to keep GA runnable in sparse datasets
                self._main_pool = [
                    r for r in self.recipes
                    if not any(kw in self._recipe_text(r) for kw in DESSERT_KEYWORDS)
                ] or list(self.recipes)

    def run(self) -> list[MealSlot]:
        population = self._seed_population()
        self._evaluate_all(population)

        best = max(population, key=lambda x: x.fitness)
        stagnant = 0

        for _ in range(self.generations):
            population.sort(key=lambda x: x.fitness, reverse=True)
            current_best = population[0]

            if best.fitness <= 0:
                improved = current_best.fitness > best.fitness
            else:
                improved = ((current_best.fitness - best.fitness) / abs(best.fitness)) > 0.005

            if improved:
                best = deepcopy(current_best)
                stagnant = 0
            else:
                stagnant += 1

            if best.fitness >= 950.0 or stagnant >= 20:
                break

            elites = [deepcopy(ind) for ind in population[: self.elite_k]]
            offspring: list[Individual] = []

            while len(offspring) < (self.pop_size - len(elites)):
                parent_a = self._tournament(population)
                parent_b = self._tournament(population)
                child = self._crossover(parent_a, parent_b)
                child = self._mutate(child)
                child = self._repair(child)
                offspring.append(child)

            population = elites + offspring
            self._evaluate_all(population)

        population.sort(key=lambda x: x.fitness, reverse=True)
        feasible = self._pick_feasible_individual(population)
        if feasible is not None:
            return feasible.slots

        # Last-resort safety: enforce slot compatibility even when no candidate
        # can satisfy all hard constraints (e.g. sparse/low-quality datasets).
        fallback = self._enforce_slot_compatibility(deepcopy(population[0]))
        return fallback.slots

    def _pick_feasible_individual(self, population: list[Individual]) -> Individual | None:
        for candidate in population:
            repaired = self._repair(deepcopy(candidate))
            if not self._violates_hard_constraints(repaired):
                return repaired
        return None

    def _enforce_slot_compatibility(self, ind: Individual) -> Individual:
        grouped = self._group_by_day(ind.slots)
        repaired_slots: list[MealSlot] = []
        usage: dict[str, int] = {}

        for day in range(self.planning_days):
            day_slots = grouped.get(day, [])
            by_slot = {ms.slot: ms for ms in day_slots if ms.slot in SLOTS}
            day_used: set[str] = set()

            for slot in SLOTS:
                existing = by_slot.get(slot)
                if existing and self._slot_recipe_is_compatible(slot, existing.recipe):
                    recipe = existing.recipe
                else:
                    slot_pool = self._breakfast_pool if slot == "Pequeno-almoço" else self._main_pool
                    compatible = [r for r in slot_pool if self._slot_recipe_is_compatible(slot, r)]
                    recipe = self._pick_low_repetition_recipe(day_used, usage, compatible or slot_pool)

                rid = str(recipe.id or recipe.url or "")
                if rid in day_used:
                    slot_pool = self._breakfast_pool if slot == "Pequeno-almoço" else self._main_pool
                    compatible = [r for r in slot_pool if self._slot_recipe_is_compatible(slot, r)]
                    recipe = self._pick_low_repetition_recipe(day_used, usage, compatible or slot_pool)
                    rid = str(recipe.id or recipe.url or "")

                repaired_slots.append(MealSlot(day=day, slot=slot, recipe=recipe))
                day_used.add(rid)
                usage[rid] = usage.get(rid, 0) + 1

        ind.slots = repaired_slots
        return ind

    def _slot_recipe_is_compatible(self, slot: str, recipe: PricedRecipe) -> bool:
        calories = _safe_float(recipe.calories_per_serving)
        protein = _safe_float(recipe.protein_g)

        if slot == "Pequeno-almoço":
            return self._is_breakfast_appropriate(recipe) and (calories == 0 or calories >= 180.0) and protein >= 8.0

        return self._is_main_appropriate(recipe) and calories >= 350.0 and protein >= 12.0

    def _seed_population(self) -> list[Individual]:
        heuristic_count = max(1, int(self.pop_size * 0.30))
        random_count = self.pop_size - heuristic_count

        population = [self._random_individual() for _ in range(random_count)]
        population.extend(self._heuristic_individual() for _ in range(heuristic_count))
        return population

    def _random_individual(self) -> Individual:
        slots: list[MealSlot] = []
        for day in range(self.planning_days):
            for slot in SLOTS:
                pool = self._breakfast_pool if slot == "Pequeno-almoço" else self._main_pool
                slots.append(MealSlot(day=day, slot=slot, recipe=random.choice(pool)))
        return Individual(slots=slots)

    def _heuristic_individual(self) -> Individual:
        def individual_recipe_score(recipe: PricedRecipe) -> float:
            calories = _safe_float(recipe.calories_per_serving)
            protein = _safe_float(recipe.protein_g)
            cost = max(_safe_float(recipe.cost_per_serving), 0.01)
            p_ratio, f_ratio, c_ratio = _macro_ratio(recipe)

            ranges = self.profile["macro_ranges"]
            macro_fit = (
                self._range_score(p_ratio, *ranges["protein"])
                + self._range_score(f_ratio, *ranges["fat"])
                + self._range_score(c_ratio, *ranges["carb"])
            ) / 3.0

            target_slot = self.daily_calorie_target / len(SLOTS)
            cal_fit = max(0.0, 1.0 - abs(calories - target_slot) / max(target_slot, 1.0))
            protein_density = protein / max(calories, 1.0)

            # Preferred-ingredient bonus
            ingredient_text = " ".join(recipe.ingredients).lower()
            pref_bonus = min(0.3, sum(0.1 for t in self.liked if t and t in ingredient_text))

            return (macro_fit * 0.4 + cal_fit * 0.4 + protein_density * 2.0 + pref_bonus) / cost

        def slot_top(pool: list[PricedRecipe]) -> list[PricedRecipe]:
            top = sorted(pool, key=individual_recipe_score, reverse=True)
            return top[: max(10, len(top) // 3)] if top else pool

        breakfast_top = slot_top(self._breakfast_pool)
        main_top = slot_top(self._main_pool)

        slots: list[MealSlot] = []
        for day in range(self.planning_days):
            for slot in SLOTS:
                pool = breakfast_top if slot == "Pequeno-almoço" else main_top
                slots.append(MealSlot(day=day, slot=slot, recipe=random.choice(pool)))
        return Individual(slots=slots)

    def _evaluate_all(self, population: list[Individual]) -> None:
        for ind in population:
            ind.fitness = self._fitness(ind)

    def _fitness(self, ind: Individual) -> float:
        if not ind.slots:
            return -1000.0

        if self._violates_hard_constraints(ind):
            return -1000.0

        score_obj = self._score_objective_nutrition(ind)
        score_pref = self._score_preferences(ind)
        score_budget = self._score_budget(ind)
        score_validation = self._score_source_validation(ind)
        score_quality = self._score_nutritional_quality(ind)
        score_variety = self._score_weekly_variety(ind)
        bonus_practicality = self._score_practicality_bonus(ind)
        slot_penalty = self._slot_context_penalty(ind)

        weighted_100 = (
            0.28 * score_obj
            + 0.23 * score_pref
            + 0.18 * score_budget
            + 0.13 * score_validation
            + 0.10 * score_quality
            + 0.08 * score_variety
        )
        repeat_penalty = self._repeat_penalty(ind)

        return (weighted_100 * 10.0) + bonus_practicality - repeat_penalty - slot_penalty

    def _violates_hard_constraints(self, ind: Individual) -> bool:
        days = self._group_by_day(ind.slots)

        if self.budget > 0:
            weekly_cost = sum(max(_safe_float(ms.recipe.cost_per_serving), 0.0) for ms in ind.slots)
            if weekly_cost > self.budget:
                return True

        excluded = set(self.disliked)
        if excluded:
            for ms in ind.slots:
                ingredient_text = " ".join(ms.recipe.ingredients).lower()
                if any(tok and tok in ingredient_text for tok in excluded):
                    return True

        if self.liked and self._has_liked_candidates:
            liked_slot_count = 0
            for ms in ind.slots:
                ingredient_text = self._recipe_text(ms.recipe)
                if any(tok and tok in ingredient_text for tok in self.liked):
                    liked_slot_count += 1
            if liked_slot_count <= 0:
                return True

        for day_slots in days.values():
            if len(day_slots) < 3 or len(day_slots) > 6:
                return True

            day_calories = sum(_safe_float(ms.recipe.calories_per_serving) for ms in day_slots)
            if self.daily_calorie_target > 0:
                if abs(day_calories - self.daily_calorie_target) / self.daily_calorie_target > 0.15:
                    return True

            day_protein = sum(_safe_float(ms.recipe.protein_g) for ms in day_slots)
            if day_protein < (self.daily_protein_target * 0.8):
                return True

            for ms in day_slots:
                calories = _safe_float(ms.recipe.calories_per_serving)
                protein = _safe_float(ms.recipe.protein_g)
                if ms.slot == "Pequeno-almoço":
                    if not self._is_breakfast_appropriate(ms.recipe):
                        return True
                    if (calories > 0 and calories < 180.0) or protein < 8.0:
                        return True
                else:
                    if not self._is_main_appropriate(ms.recipe):
                        return True
                    if calories < 350.0 or protein < 12.0:
                        return True

        return False

    def _score_objective_nutrition(self, ind: Individual) -> float:
        days = self._group_by_day(ind.slots)
        if not days:
            return 0.0

        per_day_scores: list[float] = []
        ranges = self.profile["macro_ranges"]

        for day_slots in days.values():
            calories = sum(_safe_float(ms.recipe.calories_per_serving) for ms in day_slots)
            protein_g = sum(_safe_float(ms.recipe.protein_g) for ms in day_slots)
            fat_g = sum(_safe_float(ms.recipe.fat_g) for ms in day_slots)
            carb_g = sum(_safe_float(ms.recipe.carbs_g) for ms in day_slots)

            cal_score = self._calorie_target_points(calories, self.daily_calorie_target)

            protein_bonus = 0.0
            if abs(protein_g - self.daily_protein_target) <= 10.0:
                protein_bonus = 30.0

            macro_bonus = 0.0
            p_ratio, f_ratio, c_ratio = self._macro_ratio_from_day(protein_g, fat_g, carb_g, calories)
            if (
                ranges["protein"][0] <= p_ratio <= ranges["protein"][1]
                and ranges["fat"][0] <= f_ratio <= ranges["fat"][1]
                and ranges["carb"][0] <= c_ratio <= ranges["carb"][1]
            ):
                macro_bonus = 20.0

            satiety_bonus = 0.0
            if self.goal == "lose_weight":
                satiety_bonus = min(10.0, (protein_g / max(calories, 1.0)) * 1000.0)
            elif self.goal == "gain_weight":
                avg_density = sum(
                    _safe_float(ms.recipe.calories_per_serving) / max(_safe_float(ms.recipe.total_time_minutes), 1.0)
                    for ms in day_slots
                ) / max(len(day_slots), 1)
                satiety_bonus = min(10.0, avg_density)

            daily_raw = cal_score + protein_bonus + macro_bonus + satiety_bonus
            per_day_scores.append(min(100.0, daily_raw))

        return sum(per_day_scores) / len(per_day_scores)

    def _score_preferences(self, ind: Individual) -> float:
        slots = ind.slots
        if not slots:
            return 0.0

        points = 0.0
        preferred_recipe_count = 0

        for ms in slots:
            ingredient_text = " ".join(ms.recipe.ingredients).lower()
            liked_hits = sum(1 for token in self.liked if token and token in ingredient_text)

            if liked_hits >= 3:
                points += 30.0
                preferred_recipe_count += 1
            elif liked_hits >= 1:
                points += 15.0
                preferred_recipe_count += 1

        if preferred_recipe_count / len(slots) > 0.60:
            points += 10.0
        elif self.liked:
            preferred_ratio = preferred_recipe_count / len(slots)
            if preferred_ratio >= 0.40:
                points += 8.0
            elif preferred_ratio >= 0.25:
                points += 4.0

        recipe_count: dict[str, int] = {}
        for ms in slots:
            rid = ms.recipe.id or ms.recipe.url
            recipe_count[rid] = recipe_count.get(rid, 0) + 1
        for count in recipe_count.values():
            if count > 2:
                points -= 20.0

        unique_recipes = len(recipe_count)
        if len(slots) >= 21 and unique_recipes >= 15:
            points += 15.0

        return max(0.0, min(100.0, points / max(len(slots), 1) * 4.0))

    def _score_budget(self, ind: Individual) -> float:
        if self.budget <= 0:
            return 70.0

        total_cost = sum(max(_safe_float(ms.recipe.cost_per_serving), 0.0) for ms in ind.slots)
        if total_cost > self.budget:
            return 0.0

        utilisation = (total_cost / self.budget) * 100.0
        if 85.0 <= utilisation <= 95.0:
            points = 100.0
        elif 70.0 <= utilisation < 85.0:
            points = 80.0
        elif 95.0 < utilisation <= 100.0:
            points = 70.0
        else:
            points = 40.0

        total_protein = sum(_safe_float(ms.recipe.protein_g) for ms in ind.slots)
        total_calories = sum(_safe_float(ms.recipe.calories_per_serving) for ms in ind.slots)

        euro_per_100g_protein = total_cost / max(total_protein / 100.0, 0.01)
        euro_per_1000kcal = total_cost / max(total_calories / 1000.0, 0.01)

        if euro_per_100g_protein <= 2.5:
            points += 20.0
        if euro_per_1000kcal <= 2.0:
            points += 15.0

        return max(0.0, min(100.0, points))

    def _score_source_validation(self, ind: Individual) -> float:
        def source_points(source: str) -> int:
            s = source.lower()
            if any(k in s for k in ["nutricionista", "nutritionist", "dietitian", " rd ", "rd"]):
                return 25
            if any(k in s for k in ["dgs", "who", "apn", "hospital", "clínica", "clinica"]):
                return 20
            if any(k in s for k in ["personal trainer", "fitness coach", " pt "]):
                return 15
            if any(k in s for k in ["health", "saude", "saúde", "nutrition"]):
                return 10
            return 0

        slots = ind.slots
        if not slots:
            return 0.0

        values = [source_points(ms.recipe.source or "") for ms in slots]
        avg = sum(values) / len(values)
        points = (avg / 25.0) * 100.0

        nutritionist_ratio = sum(1 for v in values if v == 25) / len(values)
        professional_ratio = sum(1 for v in values if v >= 15) / len(values)

        if nutritionist_ratio >= 0.50:
            points += 50.0
        if professional_ratio >= 0.70:
            points += 30.0

        return max(0.0, min(100.0, points))

    def _score_nutritional_quality(self, ind: Individual) -> float:
        days = self._group_by_day(ind.slots)
        if not days:
            return 0.0

        macro_points_total = 0.0
        protein_distribution_total = 0.0

        healthy_protein_min = 0.25 if self.goal == "lose_weight" else (0.30 if self.goal == "gain_muscle" else 0.15)

        for day_slots in days.values():
            calories = sum(_safe_float(ms.recipe.calories_per_serving) for ms in day_slots)
            protein_g = sum(_safe_float(ms.recipe.protein_g) for ms in day_slots)
            fat_g = sum(_safe_float(ms.recipe.fat_g) for ms in day_slots)
            carb_g = sum(_safe_float(ms.recipe.carbs_g) for ms in day_slots)

            p_ratio, f_ratio, c_ratio = self._macro_ratio_from_day(protein_g, fat_g, carb_g, calories)
            healthy_ranges = {
                "protein": (healthy_protein_min, 0.35),
                "fat": (0.20, 0.35),
                "carb": (0.45, 0.65),
            }

            macro_score = self._macro_quality_points(p_ratio, f_ratio, c_ratio, healthy_ranges)
            macro_points_total += macro_score

            per_meal_threshold = 25.0 if self.goal == "gain_muscle" else 20.0
            day_dist = 0.0
            protein_values = []
            for ms in day_slots:
                p = _safe_float(ms.recipe.protein_g)
                protein_values.append(p)
                if p >= per_meal_threshold:
                    day_dist += 40.0
                elif 15.0 <= p < 20.0:
                    day_dist += 25.0
                elif 10.0 <= p < 15.0:
                    day_dist += 10.0

            day_dist = day_dist / max(len(day_slots), 1)
            if protein_values and max(protein_values) > (sum(protein_values) * 0.5):
                day_dist = max(0.0, day_dist - 20.0)

            protein_distribution_total += day_dist

        macro_component = (macro_points_total / len(days)) * 0.60
        distribution_component = (protein_distribution_total / len(days)) * 0.40

        return max(0.0, min(100.0, macro_component + distribution_component))

    def _recipe_text(self, recipe: PricedRecipe) -> str:
        title = (recipe.title or "").lower()
        ingredients = " ".join(recipe.ingredients or []).lower()
        return f"{title} {ingredients}".strip()

    def _is_breakfast_appropriate(self, recipe: PricedRecipe) -> bool:
        text = self._recipe_text(recipe)
        if any(kw in text for kw in DESSERT_KEYWORDS):
            return False
        if any(kw in text for kw in MAIN_ONLY_KEYWORDS):
            return False
        return True

    def _is_main_appropriate(self, recipe: PricedRecipe) -> bool:
        text = self._recipe_text(recipe)
        if any(kw in text for kw in DESSERT_KEYWORDS):
            return False
        if any(kw in text for kw in SNACK_KEYWORDS):
            return False
        if any(kw in text for kw in BREAKFAST_KEYWORDS):
            cal = _safe_float(recipe.calories_per_serving)
            main_cal_lo = self.daily_calorie_target * SLOT_CALORIE_SPLIT["Almoço"] * 0.55
            return cal >= main_cal_lo
        return True

    def _slot_context_penalty(self, ind: Individual) -> float:
        """
        Penalises plans where a recipe is clearly wrong for its meal slot.
        Uses the same pool membership logic as __init__ to stay consistent.

        Penalty per violation:
          - Breakfast slot with a main-meal-only recipe: 80 pts
          - Breakfast/lunch/dinner slot with a dessert: 60 pts
          - Main-meal slot with a breakfast-only recipe that is too light: 40 pts
        """
        _main_only_kw = MAIN_ONLY_KEYWORDS
        _breakfast_only_kw = BREAKFAST_KEYWORDS
        _snack_kw = SNACK_KEYWORDS
        _dessert_kw = DESSERT_KEYWORDS

        breakfast_cal_hi = self.daily_calorie_target * SLOT_CALORIE_SPLIT["Pequeno-almoço"] * 1.80
        main_cal_lo = self.daily_calorie_target * SLOT_CALORIE_SPLIT["Almoço"] * 0.55

        penalty = 0.0
        for ms in ind.slots:
            text = self._recipe_text(ms.recipe)
            cal = _safe_float(ms.recipe.calories_per_serving)

            is_dessert = any(kw in text for kw in _dessert_kw)
            is_main_only = any(kw in text for kw in _main_only_kw)
            is_breakfast_only = any(kw in text for kw in _breakfast_only_kw)
            is_snack_like = any(kw in text for kw in _snack_kw)

            if ms.slot == "Pequeno-almoço":
                if is_dessert:
                    penalty += 60.0
                elif is_main_only:
                    penalty += 80.0
                elif cal > 0 and cal > breakfast_cal_hi:
                    # Recipe is way too calorie-dense for breakfast
                    penalty += 40.0

            elif ms.slot in ("Almoço", "Jantar"):
                if is_dessert:
                    penalty += 100.0
                elif is_snack_like:
                    penalty += 90.0
                elif is_breakfast_only and cal > 0 and cal < main_cal_lo:
                    # Pure breakfast item (e.g. oatmeal) as a main meal
                    penalty += 80.0
                elif is_breakfast_only:
                    penalty += 60.0

        return min(800.0, penalty)

    def _score_weekly_variety(self, ind: Individual) -> float:
        """
        Rewards plans that use a wide variety of unique recipes across the week.
        A plan where every dinner is the same recipe scores near 0;
        a plan with no repeats at all scores 100.

        Also penalises same-slot repeats on consecutive days
        (e.g. identical lunch Monday and Tuesday).
        """
        if not ind.slots:
            return 0.0

        total = len(ind.slots)
        recipe_ids = [str(ms.recipe.id or ms.recipe.url or "") for ms in ind.slots]
        unique_count = len(set(recipe_ids))

        # Uniqueness ratio: 0–70 points
        uniqueness_score = (unique_count / max(total, 1)) * 70.0

        # Consecutive same-slot same-recipe penalty: up to −30 pts
        by_slot: dict[str, dict[int, str]] = {}
        for ms in ind.slots:
            by_slot.setdefault(ms.slot, {})[ms.day] = str(ms.recipe.id or ms.recipe.url or "")

        consecutive_hits = 0
        for slot_map in by_slot.values():
            for day in range(1, self.planning_days):
                if slot_map.get(day - 1) == slot_map.get(day) and slot_map.get(day):
                    consecutive_hits += 1

        consecutive_penalty = min(30.0, consecutive_hits * 10.0)

        # Breakfast variety bonus: if all breakfasts differ (+15 pts extra)
        breakfast_ids = [
            str(ms.recipe.id or ms.recipe.url or "")
            for ms in ind.slots if ms.slot == "Pequeno-almoço"
        ]
        breakfast_bonus = 15.0 if len(set(breakfast_ids)) == len(breakfast_ids) else 0.0

        raw = uniqueness_score - consecutive_penalty + breakfast_bonus
        return max(0.0, min(100.0, raw))

    def _score_practicality_bonus(self, ind: Individual) -> float:
        days = self._group_by_day(ind.slots)
        if not days:
            return 0.0

        bonus = 0.0
        all_times: list[float] = []
        fast_count = 0
        total_meals = 0

        for day_idx, day_slots in days.items():
            for ms in day_slots:
                t = _safe_float(ms.recipe.total_time_minutes)
                all_times.append(t)
                total_meals += 1

                if t <= 40.0:
                    fast_count += 1

                if day_idx <= 4:
                    if t <= 30.0:
                        bonus += 10.0
                    elif t <= 60.0:
                        bonus += 5.0

        avg_time = sum(all_times) / max(len(all_times), 1)
        if avg_time <= 45.0:
            bonus += 20.0

        if total_meals > 0 and (fast_count / total_meals) >= 0.60:
            bonus += 15.0

        return max(0.0, min(50.0, bonus))

    def _repeat_penalty(self, ind: Individual) -> float:
        recipe_count: dict[str, int] = {}
        for ms in ind.slots:
            rid = str(ms.recipe.id or ms.recipe.url or "")
            recipe_count[rid] = recipe_count.get(rid, 0) + 1

        penalty = 0.0
        for count in recipe_count.values():
            if count <= 1:
                continue
            penalty += (count - 1) * 20.0
            if count >= 4:
                penalty += 25.0

        by_slot: dict[str, dict[int, str]] = {slot: {} for slot in SLOTS}
        for ms in ind.slots:
            rid = str(ms.recipe.id or ms.recipe.url or "")
            by_slot.setdefault(ms.slot, {})[ms.day] = rid

        for slot, mapping in by_slot.items():
            for day in range(1, self.planning_days):
                prev_id = mapping.get(day - 1)
                curr_id = mapping.get(day)
                if prev_id and curr_id and prev_id == curr_id:
                    penalty += 15.0

        return min(300.0, penalty)

    def _tournament(self, population: list[Individual], k: int = 4) -> Individual:
        sampled = random.sample(population, min(k, len(population)))
        return max(sampled, key=lambda x: x.fitness)

    def _crossover(self, p1: Individual, p2: Individual) -> Individual:
        if random.random() > 0.78:
            return deepcopy(p1)

        day_count = self.planning_days
        if day_count < 2:
            return deepcopy(p1)

        a = random.randint(0, day_count - 2)
        b = random.randint(a + 1, day_count - 1)

        p1_days = self._group_by_day(p1.slots)
        p2_days = self._group_by_day(p2.slots)

        child_slots: list[MealSlot] = []
        for day in range(day_count):
            source_days = p2_days if a <= day <= b else p1_days
            selected = source_days.get(day, [])
            for ms in selected:
                child_slots.append(MealSlot(day=day, slot=ms.slot, recipe=ms.recipe))

        return Individual(slots=child_slots)

    def _mutate(self, ind: Individual) -> Individual:
        if random.random() > self.mutation_rate:
            return ind

        mode = random.random()
        slots = ind.slots

        if not slots:
            return ind

        if mode < 0.50:
            idx = random.randrange(len(slots))
            current = slots[idx]
            day_used = {
                str(ms.recipe.id or ms.recipe.url or "")
                for ms in slots
                if ms.day == current.day
            }
            slot_pool = self._breakfast_pool if current.slot == "Pequeno-almoço" else self._main_pool
            pool = [
                recipe
                for recipe in slot_pool
                if str(recipe.id or recipe.url or "") not in day_used
            ]
            slots[idx].recipe = random.choice(pool or slot_pool)
        elif mode < 0.80:
            day = random.randrange(self.planning_days)
            day_indices = [i for i, ms in enumerate(slots) if ms.day == day]
            if len(day_indices) >= 2:
                i1, i2 = random.sample(day_indices, 2)
                slots[i1], slots[i2] = slots[i2], slots[i1]
                slots[i1].day = day
                slots[i2].day = day
        else:
            if self.planning_days >= 2:
                d1, d2 = random.sample(range(self.planning_days), 2)
                for ms in slots:
                    if ms.day == d1:
                        ms.day = -1
                    elif ms.day == d2:
                        ms.day = d1
                for ms in slots:
                    if ms.day == -1:
                        ms.day = d2

        return ind

    def _repair(self, ind: Individual) -> Individual:
        grouped = self._group_by_day(ind.slots)
        repaired_slots: list[MealSlot] = []
        usage: dict[str, int] = {}
        for ms in ind.slots:
            rid = str(ms.recipe.id or ms.recipe.url or "")
            usage[rid] = usage.get(rid, 0) + 1

        for day in range(self.planning_days):
            day_slots = grouped.get(day, [])
            day_used: set[str] = set()

            slot_map = {ms.slot: ms for ms in day_slots if ms.slot in SLOTS}
            for slot in SLOTS:
                # Determine the correct pool for this slot to avoid e.g. lunch
                # recipes appearing in the breakfast slot during repair.
                slot_pool = self._breakfast_pool if slot == "Pequeno-almoço" else self._main_pool
                ms = slot_map.get(slot)
                if ms is None:
                    candidate = self._pick_low_repetition_recipe(day_used, usage, slot_pool)
                    repaired_slots.append(MealSlot(day=day, slot=slot, recipe=candidate))
                    rid = str(candidate.id or candidate.url or "")
                    day_used.add(rid)
                    usage[rid] = usage.get(rid, 0) + 1
                else:
                    rid = str(ms.recipe.id or ms.recipe.url or "")
                    if rid in day_used:
                        candidate = self._pick_low_repetition_recipe(day_used, usage, slot_pool)
                        repaired_slots.append(MealSlot(day=day, slot=slot, recipe=candidate))
                        rid = str(candidate.id or candidate.url or "")
                        usage[rid] = usage.get(rid, 0) + 1
                    else:
                        repaired_slots.append(MealSlot(day=day, slot=slot, recipe=ms.recipe))
                    day_used.add(rid)

        ind.slots = repaired_slots
        return ind

    def _pick_low_repetition_recipe(
        self,
        day_used: set[str],
        usage: dict[str, int],
        pool: list[PricedRecipe] | None = None,
    ) -> PricedRecipe:
        # Use the provided slot-specific pool; fall back to the full recipe list
        # only if the pool is empty (should not happen in practice).
        source = pool if pool else self.recipes
        candidates = [
            recipe
            for recipe in source
            if str(recipe.id or recipe.url or "") not in day_used
        ]
        if not candidates:
            candidates = list(source) or list(self.recipes)

        return min(
            candidates,
            key=lambda recipe: usage.get(str(recipe.id or recipe.url or ""), 0),
        )

    def _group_by_day(self, slots: list[MealSlot]) -> dict[int, list[MealSlot]]:
        grouped: dict[int, list[MealSlot]] = {}
        for ms in slots:
            grouped.setdefault(ms.day, []).append(ms)
        for day in grouped:
            grouped[day] = sorted(grouped[day], key=lambda x: SLOTS.index(x.slot) if x.slot in SLOTS else 99)
        return grouped

    def _calorie_target_points(self, calories: float, target: float) -> float:
        if target <= 0:
            return 0.0
        pct = abs(calories - target) / target
        if pct <= 0.05:
            return 100.0
        if pct <= 0.10:
            return 80.0
        if pct <= 0.15:
            return 50.0
        return 0.0

    def _macro_ratio_from_day(
        self,
        protein_g: float,
        fat_g: float,
        carb_g: float,
        calories: float,
    ) -> tuple[float, float, float]:
        total_kcal = max(calories, 1.0)
        p = (protein_g * 4.0) / total_kcal
        f = (fat_g * 9.0) / total_kcal
        c = (carb_g * 4.0) / total_kcal
        return p, f, c

    def _range_score(self, value: float, lo: float, hi: float) -> float:
        if lo <= value <= hi:
            return 1.0
        if value < lo:
            return max(0.0, 1.0 - (lo - value) / max(lo, 0.01))
        return max(0.0, 1.0 - (value - hi) / max(1.0 - hi, 0.01))

    def _macro_quality_points(
        self,
        p_ratio: float,
        f_ratio: float,
        c_ratio: float,
        ranges: dict[str, tuple[float, float]],
    ) -> float:
        in_range = (
            ranges["protein"][0] <= p_ratio <= ranges["protein"][1]
            and ranges["fat"][0] <= f_ratio <= ranges["fat"][1]
            and ranges["carb"][0] <= c_ratio <= ranges["carb"][1]
        )
        if in_range:
            return 60.0

        def min_distance_to_range(value: float, lo: float, hi: float) -> float:
            if lo <= value <= hi:
                return 0.0
            if value < lo:
                return lo - value
            return value - hi

        d_p = min_distance_to_range(p_ratio, *ranges["protein"])
        d_f = min_distance_to_range(f_ratio, *ranges["fat"])
        d_c = min_distance_to_range(c_ratio, *ranges["carb"])
        worst_pct = max(d_p, d_f, d_c) * 100.0

        if worst_pct <= 5.0:
            return 40.0
        if worst_pct <= 10.0:
            return 20.0
        return 0.0
