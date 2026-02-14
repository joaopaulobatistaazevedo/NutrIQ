from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import IngredientNeed
from .normalization import normalize_text


def load_ingredient_needs(meal_plan_path: str | Path) -> list[IngredientNeed]:
    payload = _load_json_file(meal_plan_path)
    ingredient_rows = _extract_ingredient_rows(payload)
    return _aggregate_ingredients(ingredient_rows)


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

    if not rows:
        raise ValueError(
            "Nenhum ingrediente encontrado. Use 'ingredients' ou 'meals[].ingredients'."
        )
    return rows


def _ingredient_to_row(item: Any) -> dict[str, Any]:
    if isinstance(item, str):
        name = item.strip()
        if not name:
            raise ValueError("Ingrediente string vazio.")
        return {"name": name, "quantity": None, "unit": None}

    if isinstance(item, dict):
        name = str(item.get("name", "")).strip()
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
