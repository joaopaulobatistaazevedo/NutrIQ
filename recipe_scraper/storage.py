from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .models import RecipeRecord


def ensure_schema(db_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                source_tag TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                ingredients_json TEXT NOT NULL,
                steps_json TEXT NOT NULL,
                prep_time_minutes INTEGER,
                cook_time_minutes INTEGER,
                total_time_minutes INTEGER,
                servings TEXT,
                tags_json TEXT NOT NULL,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recipes_source ON recipes(source)")
        conn.commit()
    finally:
        conn.close()


def upsert_recipes(db_path: str, recipes: list[RecipeRecord]) -> int:
    ensure_schema(db_path)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        for recipe in recipes:
            cursor.execute(
                """
                INSERT INTO recipes (
                    source,
                    source_tag,
                    url,
                    title,
                    ingredients_json,
                    steps_json,
                    prep_time_minutes,
                    cook_time_minutes,
                    total_time_minutes,
                    servings,
                    tags_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(url) DO UPDATE SET
                    source=excluded.source,
                    source_tag=excluded.source_tag,
                    title=excluded.title,
                    ingredients_json=excluded.ingredients_json,
                    steps_json=excluded.steps_json,
                    prep_time_minutes=excluded.prep_time_minutes,
                    cook_time_minutes=excluded.cook_time_minutes,
                    total_time_minutes=excluded.total_time_minutes,
                    servings=excluded.servings,
                    tags_json=excluded.tags_json,
                    fetched_at=CURRENT_TIMESTAMP
                """,
                (
                    recipe.source,
                    recipe.source_tag,
                    recipe.url,
                    recipe.title,
                    json.dumps(recipe.ingredients, ensure_ascii=False),
                    json.dumps(recipe.steps, ensure_ascii=False),
                    recipe.prep_time_minutes,
                    recipe.cook_time_minutes,
                    recipe.total_time_minutes,
                    recipe.servings,
                    json.dumps(recipe.tags, ensure_ascii=False),
                ),
            )
        conn.commit()
        return len(recipes)
    finally:
        conn.close()


def load_recipes(db_path: str) -> list[RecipeRecord]:
    ensure_schema(db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT
                source,
                source_tag,
                url,
                title,
                ingredients_json,
                steps_json,
                prep_time_minutes,
                cook_time_minutes,
                total_time_minutes,
                servings,
                tags_json
            FROM recipes
            """
        ).fetchall()
    finally:
        conn.close()

    recipes: list[RecipeRecord] = []
    for row in rows:
        recipes.append(
            RecipeRecord(
                source=row["source"],
                source_tag=row["source_tag"],
                url=row["url"],
                title=row["title"],
                ingredients=_json_list(row["ingredients_json"]),
                steps=_json_list(row["steps_json"]),
                prep_time_minutes=row["prep_time_minutes"],
                cook_time_minutes=row["cook_time_minutes"],
                total_time_minutes=row["total_time_minutes"],
                servings=row["servings"],
                tags=_json_list(row["tags_json"]),
            )
        )
    return recipes


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]
