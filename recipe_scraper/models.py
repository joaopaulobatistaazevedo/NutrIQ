from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RecipeRecord:
    source: str
    source_tag: str
    url: str
    title: str
    ingredients: list[str]
    steps: list[str]
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    total_time_minutes: int | None = None
    servings: str | None = None
    image_url: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass
class MatchedRecipe:
    title: str
    source: str
    url: str
    image_url: str | None
    match_ratio: float
    matched_ingredients: list[str]
    missing_ingredients: list[str]
    total_ingredients: int
