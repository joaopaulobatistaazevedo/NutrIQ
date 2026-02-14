"""
genetic_algorithm.py
━━━━━━━━━━━━━━━━━━━
Goal-aware genetic algorithm for weekly meal plan optimisation.

Fitness formula (per meal slot):
    S = (1 / |Cal_target - Cal_recipe|) × (Preference_Score / Cost_per_dose)

    where:
      • Cal_target      = daily calorie target for the slot (derived from goal)
      • Cal_recipe      = calories per serving of the candidate recipe
      • Preference_Score = composite score [0, 1] based on liked ingredients,
                           macro alignment (protein/fat/carbs ratios) and goal
      • Cost_per_dose   = cost per serving in €  (min-clamped to 0.01 to avoid ÷0)

    When |Cal_target - Cal_recipe| == 0, the term collapses to a large reward
    (capped at MAX_CAL_SCORE) so perfect-calorie matches are strongly preferred.

    The overall plan fitness is the mean slot fitness across the week.

Goal → calorie & macro targets
────────────────────────────────
  lose_weight    : moderate deficit,  high protein, low fat
  gain_weight    : moderate surplus,  balanced macros
  maintain       : TDEE match,        balanced macros
  gain_muscle    : moderate surplus,  very high protein, low fat

These targets are scaled to a single meal slot (breakfast/lunch/dinner)
using the SLOT_CALORIE_SPLIT dictionary.
"""

from __future__ import annotations

import random
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from services.supermarket_scraper_service import PricedRecipe


# ═══════════════════════════════════════════════════════════════════════════
# Goal profiles
# ═══════════════════════════════════════════════════════════════════════════

GOAL_PROFILES: dict[str, dict[str, Any]] = {
    "lose_weight": {
        "daily_calories": 1700,
        "protein_ratio": 0.35,   # of total calories
        "fat_ratio": 0.25,
        "carb_ratio": 0.40,
        "cal_weight": 1.8,       # how much calorie precision matters in fitness
        "pref_weight": 1.0,
        "cost_weight": 1.2,
    },
    "gain_weight": {
        "daily_calories": 2800,
        "protein_ratio": 0.25,
        "fat_ratio": 0.30,
        "carb_ratio": 0.45,
        "cal_weight": 1.4,
        "pref_weight": 1.1,
        "cost_weight": 1.0,
    },
    "maintain": {
        "daily_calories": 2200,
        "protein_ratio": 0.25,
        "fat_ratio": 0.30,
        "carb_ratio": 0.45,
        "cal_weight": 1.2,
        "pref_weight": 1.2,
        "cost_weight": 1.0,
    },
    "gain_muscle": {
        "daily_calories": 2600,
        "protein_ratio": 0.40,
        "fat_ratio": 0.20,
        "carb_ratio": 0.40,
        "cal_weight": 1.5,
        "pref_weight": 1.3,
        "cost_weight": 0.9,
    },
}

# How daily calories are split across meal slots
SLOT_CALORIE_SPLIT: dict[str, float] = {
    "Pequeno-almoço": 0.25,
    "Almoço": 0.40,
    "Jantar": 0.35,
}

SLOTS = list(SLOT_CALORIE_SPLIT.keys())

MAX_CAL_SCORE = 200.0   # cap when calorie diff == 0
MIN_COST = 0.01         # floor to avoid division by zero


# ═══════════════════════════════════════════════════════════════════════════
# Data structures
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class MealSlot:
    day: int           # 0-based
    slot: str          # "Pequeno-almoço" | "Almoço" | "Jantar"
    recipe: PricedRecipe


@dataclass
class Individual:
    """A complete weekly meal plan (genome = list of MealSlots)."""
    slots: list[MealSlot]
    fitness: float = field(default=0.0, compare=False)


# ═══════════════════════════════════════════════════════════════════════════
# Fitness helpers
# ═══════════════════════════════════════════════════════════════════════════

def _macro_preference_score(
    recipe: PricedRecipe,
    profile: dict[str, Any],
    liked: list[str],
    disliked: list[str],
) -> float:
    """
    Preference_Score ∈ [0, 1] composed of:
      40% macro alignment with goal
      40% ingredient match (liked / disliked)
      20% time efficiency (faster = slightly better)
    """
    score = 0.0

    # ── Macro alignment (0–0.4) ──────────────────────────────────────────
    cal = recipe.calories_per_serving or 0.0
    macro_sub = 0.0
    if cal > 0:
        p_ratio = ((recipe.protein_g or 0.0) * 4) / cal
        f_ratio = ((recipe.fat_g or 0.0) * 9) / cal
        c_ratio = ((recipe.carbs_g or 0.0) * 4) / cal

        p_err = abs(p_ratio - profile["protein_ratio"])
        f_err = abs(f_ratio - profile["fat_ratio"])
        c_err = abs(c_ratio - profile["carb_ratio"])

        # max possible error per macro ≈ 1.0; average and invert
        macro_sub = max(0.0, 1.0 - (p_err + f_err + c_err) / 3.0)
    score += 0.40 * macro_sub

    # ── Ingredient preference (0–0.4) ────────────────────────────────────
    ingredient_text = " ".join(recipe.ingredients).lower()
    liked_hits = sum(1 for w in liked if w and w in ingredient_text)
    disliked_hits = sum(1 for w in disliked if w and w in ingredient_text)
    total_liked = max(len(liked), 1)
    pref_sub = max(0.0, (liked_hits / total_liked) - (disliked_hits * 0.3))
    pref_sub = min(pref_sub, 1.0)
    score += 0.40 * pref_sub

    # ── Time efficiency (0–0.2) ──────────────────────────────────────────
    minutes = recipe.total_time_minutes or 60
    # 15 min → 1.0, 90 min → 0.0
    time_sub = max(0.0, min(1.0, 1.0 - (minutes - 15) / 75.0))
    score += 0.20 * time_sub

    return min(score, 1.0)


def slot_fitness(
    recipe: PricedRecipe,
    slot: str,
    profile: dict[str, Any],
    liked: list[str],
    disliked: list[str],
) -> float:
    """
    S = (1 / |Cal_target - Cal_recipe|) × (Preference_Score / Cost_per_dose)

    Goal weights are applied as multiplicative factors on each component.
    """
    cal_split = SLOT_CALORIE_SPLIT.get(slot, 1 / 3)
    cal_target = profile["daily_calories"] * cal_split
    cal_recipe = recipe.calories_per_serving or 0.0

    cal_diff = abs(cal_target - cal_recipe)
    if cal_diff < 1.0:
        calorie_term = MAX_CAL_SCORE
    else:
        calorie_term = 1.0 / cal_diff

    preference_score = _macro_preference_score(recipe, profile, liked, disliked)
    cost = max(recipe.cost_per_serving, MIN_COST)

    raw = calorie_term * (preference_score / cost)

    # Apply goal-specific weights
    cal_w = profile.get("cal_weight", 1.0)
    pref_w = profile.get("pref_weight", 1.0)
    cost_w = profile.get("cost_weight", 1.0)

    # Decompose and re-weight
    weighted = (calorie_term * cal_w) * ((preference_score * pref_w) / (cost * cost_w))
    return weighted


# ═══════════════════════════════════════════════════════════════════════════
# Genetic Algorithm
# ═══════════════════════════════════════════════════════════════════════════

class MealPlanGA:
    """
    Genetic algorithm that evolves a weekly meal plan.

    Parameters
    ──────────
    recipes         : all candidate PricedRecipe objects
    goal            : one of GOAL_PROFILES keys
    planning_days   : 1–7
    liked           : normalised liked ingredient tokens
    disliked        : normalised disliked ingredient tokens
    max_weekly_budget : budget cap in €; plans exceeding it are penalised
    population_size : GA population (default 80)
    generations     : GA iterations (default 120)
    elite_k         : elites copied verbatim per generation (default 4)
    mutation_rate   : probability of a single slot mutating (default 0.15)
    """

    def __init__(
        self,
        recipes: list[PricedRecipe],
        goal: str,
        planning_days: int,
        liked: list[str],
        disliked: list[str],
        max_weekly_budget: float = 0.0,
        population_size: int = 80,
        generations: int = 120,
        elite_k: int = 4,
        mutation_rate: float = 0.15,
    ) -> None:
        self.recipes = [r for r in recipes if r.title]
        self.profile = GOAL_PROFILES.get(goal, GOAL_PROFILES["maintain"])
        self.planning_days = max(1, min(planning_days, 7))
        self.liked = liked
        self.disliked = disliked
        self.budget = max_weekly_budget
        self.pop_size = population_size
        self.generations = generations
        self.elite_k = elite_k
        self.mutation_rate = mutation_rate
        self._n_slots = self.planning_days * len(SLOTS)

        if not self.recipes:
            raise ValueError("No valid recipes supplied to MealPlanGA.")

    # ── Public ─────────────────────────────────────────────────────────────

    def run(self) -> list[MealSlot]:
        """Run the GA and return the best individual's slot list."""
        population = self._seed_population()
        self._evaluate_all(population)

        for _ in range(self.generations):
            population.sort(key=lambda ind: ind.fitness, reverse=True)
            elites = [deepcopy(population[i]) for i in range(min(self.elite_k, len(population)))]

            offspring: list[Individual] = []
            while len(offspring) < self.pop_size - len(elites):
                p1, p2 = self._tournament(population), self._tournament(population)
                child = self._crossover(p1, p2)
                child = self._mutate(child)
                offspring.append(child)

            population = elites + offspring
            self._evaluate_all(population)

        population.sort(key=lambda ind: ind.fitness, reverse=True)
        return population[0].slots

    # ── Initialisation ─────────────────────────────────────────────────────

    def _seed_population(self) -> list[Individual]:
        return [self._random_individual() for _ in range(self.pop_size)]

    def _random_individual(self) -> Individual:
        slots: list[MealSlot] = []
        used_urls: set[str] = set()
        for day in range(self.planning_days):
            for slot_name in SLOTS:
                recipe = self._pick_unique(used_urls)
                used_urls.add(recipe.url)
                slots.append(MealSlot(day=day, slot=slot_name, recipe=recipe))
        return Individual(slots=slots)

    def _pick_unique(self, used: set[str]) -> PricedRecipe:
        pool = [r for r in self.recipes if r.url not in used]
        if not pool:
            pool = self.recipes  # allow repeats if pool exhausted
        return random.choice(pool)

    # ── Evaluation ─────────────────────────────────────────────────────────

    def _evaluate_all(self, population: list[Individual]) -> None:
        for ind in population:
            ind.fitness = self._fitness(ind)

    def _fitness(self, ind: Individual) -> float:
        if not ind.slots:
            return 0.0

        total = sum(
            slot_fitness(ms.recipe, ms.slot, self.profile, self.liked, self.disliked)
            for ms in ind.slots
        )
        mean = total / len(ind.slots)

        # Budget penalty: reduce fitness proportionally if over-budget
        if self.budget > 0:
            weekly_cost = sum(ms.recipe.cost_per_serving for ms in ind.slots)
            if weekly_cost > self.budget:
                penalty = (weekly_cost - self.budget) / self.budget
                mean *= max(0.1, 1.0 - penalty)

        # Diversity bonus: penalise excessive recipe repetition
        urls = [ms.recipe.url for ms in ind.slots]
        unique_ratio = len(set(urls)) / len(urls)
        mean *= 0.7 + 0.3 * unique_ratio

        return mean

    # ── Selection ──────────────────────────────────────────────────────────

    def _tournament(self, population: list[Individual], k: int = 5) -> Individual:
        contestants = random.sample(population, min(k, len(population)))
        return max(contestants, key=lambda ind: ind.fitness)

    # ── Crossover ──────────────────────────────────────────────────────────

    def _crossover(self, p1: Individual, p2: Individual) -> Individual:
        """Single-point crossover on the slot list."""
        n = len(p1.slots)
        point = random.randint(1, n - 1)
        child_slots = deepcopy(p1.slots[:point]) + deepcopy(p2.slots[point:])
        return Individual(slots=child_slots)

    # ── Mutation ───────────────────────────────────────────────────────────

    def _mutate(self, ind: Individual) -> Individual:
        """Replace a random slot with a new recipe."""
        used_urls = {ms.recipe.url for ms in ind.slots}
        for ms in ind.slots:
            if random.random() < self.mutation_rate:
                new_recipe = self._pick_unique(used_urls)
                ms.recipe = new_recipe
                used_urls.add(new_recipe.url)
        return ind