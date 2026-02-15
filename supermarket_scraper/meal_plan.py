from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

from .models import IngredientNeed
from .normalization import normalize_text


def load_ingredient_needs(meal_plan_path: str | Path) -> list[IngredientNeed]:
    payload = _load_json_file(meal_plan_path)
    return load_ingredient_needs_from_payload(payload)


def load_ingredient_needs_from_payload(payload: dict[str, Any]) -> list[IngredientNeed]:
    ingredient_rows = _extract_ingredient_rows(payload)
    return _aggregate_ingredients(ingredient_rows)


def load_recipe_ingredient_catalog(recipes_json_path: str | Path) -> dict[str, list[str]]:
    raw = Path(recipes_json_path).read_text(encoding="utf-8")
    parsed = json.loads(raw)

    rows: list[Any] = []
    if isinstance(parsed, dict) and isinstance(parsed.get("recipes"), list):
        rows = parsed["recipes"]
    elif isinstance(parsed, list):
        rows = parsed
    else:
        raise ValueError("Formato inválido em recipes JSON. Esperado lista ou {'recipes': [...]} .")

    catalog: dict[str, list[str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("name") or "").strip()
        if not title:
            continue
        key = normalize_text(title)
        if not key:
            continue

        raw_ingredients = row.get("ingredients")
        if not isinstance(raw_ingredients, list):
            continue

        normalized_ingredients: list[str] = []
        for item in raw_ingredients:
            name = ""
            if isinstance(item, dict):
                name = _clean_ingredient_name(item.get("name") or item.get("ingredientName"))
            else:
                name = _clean_ingredient_name(item)
            if name:
                normalized_ingredients.append(name)

        if normalized_ingredients:
            catalog[key] = normalized_ingredients

    return catalog


def enrich_meal_plan_with_recipe_ingredients(
    meal_plan_payload: dict[str, Any],
    recipe_catalog: dict[str, list[str]],
) -> tuple[dict[str, Any], int]:
    if not recipe_catalog:
        return meal_plan_payload, 0

    payload = copy.deepcopy(meal_plan_payload)
    enriched_count = 0

    def _inject(meal: dict[str, Any]) -> None:
        nonlocal enriched_count
        if not isinstance(meal, dict):
            return
        if isinstance(meal.get("ingredients"), list) and meal["ingredients"]:
            return

        title = str(
            meal.get("title")
            or meal.get("name")
            or meal.get("recipe_name")
            or meal.get("recipeName")
            or ""
        ).strip()
        if not title:
            return

        key = normalize_text(title)
        ingredients = recipe_catalog.get(key)
        if not ingredients:
            return

        meal["ingredients"] = [{"name": ingredient} for ingredient in ingredients]
        enriched_count += 1

    meals = payload.get("meals")
    if isinstance(meals, list):
        for meal in meals:
            _inject(meal)

    days = payload.get("days")
    if isinstance(days, list):
        for day in days:
            if not isinstance(day, dict):
                continue
            day_meals = day.get("meals")
            if not isinstance(day_meals, list):
                continue
            for meal in day_meals:
                _inject(meal)

    return payload, enriched_count


def _load_json_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Meal planner deve ser um objeto JSON.")
    return parsed


def _extract_ingredient_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    if isinstance(payload.get("ingredients"), list):
        for item in payload["ingredients"]:
            rows.append(_ingredient_to_row(item))

    meals = payload.get("meals")
    if isinstance(meals, list):
        for meal in meals:
            if not isinstance(meal, dict):
                continue
            ingredients = meal.get("ingredients")
            if not isinstance(ingredients, list):
                continue
            for item in ingredients:
                rows.append(_ingredient_to_row(item))

    days = payload.get("days")
    if isinstance(days, list):
        for day in days:
            if not isinstance(day, dict):
                continue
            meals_in_day = day.get("meals")
            if not isinstance(meals_in_day, list):
                continue
            for meal in meals_in_day:
                if not isinstance(meal, dict):
                    continue

                inline_ingredients = meal.get("ingredients")
                if isinstance(inline_ingredients, list):
                    for item in inline_ingredients:
                        rows.append(_ingredient_to_row(item))

                preview_ingredients = meal.get("ingredients_preview")
                if isinstance(preview_ingredients, list):
                    for item in preview_ingredients:
                        rows.append(_ingredient_to_row(item))

    if not rows:
        raise ValueError(
            "Nenhum ingrediente encontrado. Use 'ingredients', 'meals[].ingredients' "
            "ou 'days[].meals[].ingredients'."
        )
    return rows


def _ingredient_to_row(item: Any) -> dict[str, Any]:
    if isinstance(item, str):
        name = _clean_ingredient_name(item)
        if not name:
            raise ValueError("Ingrediente string vazio.")
        return {"name": name, "quantity": None, "unit": None}

    if isinstance(item, dict):
        name = _clean_ingredient_name(item.get("name", ""))
        if not name:
            raise ValueError("Ingrediente sem campo 'name'.")

        quantity_raw = item.get("quantity")
        quantity: float | None = None
        if quantity_raw is not None:
            try:
                quantity = float(quantity_raw)
            except (TypeError, ValueError):
                quantity = None

        unit_raw = item.get("unit")
        unit = str(unit_raw).strip() if unit_raw is not None else None
        if unit == "":
            unit = None

        return {"name": name, "quantity": quantity, "unit": unit}

    raise ValueError("Formato inválido de ingrediente.")


def _aggregate_ingredients(rows: list[dict[str, Any]]) -> list[IngredientNeed]:
    grouped: dict[str, IngredientNeed] = {}

    for row in rows:
        name = row["name"]
        normalized = normalize_text(name)
        quantity = row["quantity"]
        unit = row["unit"]

        if normalized not in grouped:
            grouped[normalized] = IngredientNeed(
                name=name,
                normalized_name=normalized,
                quantity=quantity,
                unit=unit,
            )
            continue

        current = grouped[normalized]
        if current.quantity is None or quantity is None:
            current.quantity = None
            if current.unit != unit:
                current.unit = None
            continue

        if current.unit == unit:
            current.quantity += quantity
        else:
            current.quantity = None
            current.unit = None

    return list(grouped.values())


def _clean_ingredient_name(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""

    text = re.sub(r"\([^)]*\)", " ", text)
    text = text.replace("q.b.", " ").replace("q.b", " ").replace("qb", " ")
    text = re.sub(r"^[\-\u2022*\s]+", "", text)
    text = re.sub(
        r"^\s*(?:\d+\s*/\s*\d+|\d+(?:[.,]\d+)?)\s*"
        r"(?:(?:kg|g|gr|gramas?|ml|l|dl|cl|un|unid(?:ade)?s?|dentes?|"
        r"colher(?:es)?(?:\s+de\s+(?:sopa|cha|chá))?|"
        r"chávenas?|xícaras?|xicaras?)\b)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s+", " ", text).strip(" ,.;:-")
    return text
