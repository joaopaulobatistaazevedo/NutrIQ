from __future__ import annotations

from .models import MatchedRecipe, RecipeRecord
from .normalization import normalize_ingredient_line, normalize_ingredient_query


def match_recipes_by_ingredients(
    recipes: list[RecipeRecord],
    pantry_ingredients: list[str],
    min_ratio: float = 0.35,
    limit: int = 20,
    require_full_match: bool = False,
) -> list[MatchedRecipe]:
    normalized_pantry = normalize_ingredient_query(pantry_ingredients)
    if not normalized_pantry:
        return []

    matches: list[MatchedRecipe] = []
    for recipe in recipes:
        ingredient_lines = [line for line in recipe.ingredients if line.strip()]
        if not ingredient_lines:
            continue

        matched_lines: list[str] = []
        missing_lines: list[str] = []

        for ingredient_line in ingredient_lines:
            normalized_line = normalize_ingredient_line(ingredient_line)
            if not normalized_line:
                continue

            is_match = any(
                pantry in normalized_line or normalized_line in pantry
                for pantry in normalized_pantry
            )
            if is_match:
                matched_lines.append(ingredient_line)
            else:
                missing_lines.append(ingredient_line)

        total = len(matched_lines) + len(missing_lines)
        if total == 0:
            continue

        ratio = len(matched_lines) / total
        if require_full_match and missing_lines:
            continue
        if ratio < min_ratio:
            continue

        matches.append(
            MatchedRecipe(
                title=recipe.title,
                source=recipe.source,
                url=recipe.url,
                match_ratio=ratio,
                matched_ingredients=matched_lines,
                missing_ingredients=missing_lines,
                total_ingredients=total,
            )
        )

    matches.sort(
        key=lambda item: (
            -item.match_ratio,
            len(item.missing_ingredients),
            item.title.lower(),
        )
    )
    return matches[:limit]
