from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl

try:
    import mysql.connector
except ImportError:  # pragma: no cover - dependency guard
    mysql = None
else:
    mysql = mysql.connector

from .models import RecipeRecord

SERVINGS_NUMBER_RE = re.compile(r"\d+")

BREAKFAST_TOKENS = {
    "breakfast",
    "pequeno almoco",
    "pequeno-almoco",
    "cafe da manha",
    "cafe-da-manha",
    "mata bicho",
    "mata-bicho",
    "brunch",
}
SNACK_TOKENS = {
    "snack",
    "lanche",
    "merenda",
    "aperitivo",
    "petisco",
}
LUNCH_TOKENS = {
    "lunch",
    "almoco",
    "almoco jantar",
    "almoço",
    "prato principal",
}


def sync_recipes_to_backend(
    recipes: list[RecipeRecord],
    backend_env_path: str = "backend/.env",
) -> int:
    if not recipes:
        return 0

    if mysql is None:
        raise RuntimeError(
            "Dependencia ausente: instala mysql-connector-python para sync com MySQL."
        )

    config = _resolve_mysql_config(backend_env_path)
    connect_kwargs: dict[str, Any] = dict(
        host=config["host"],
        port=config["port"],
        user=config["user"],
        password=config["password"],
        database=config["database"],
    )
    if config["ssl_disabled"] is not None:
        connect_kwargs["ssl_disabled"] = bool(config["ssl_disabled"])

    conn = mysql.connect(**connect_kwargs)
    try:
        conn.autocommit = False
        _ensure_recipes_table(conn)

        sql = """
            INSERT INTO recipes (
                id,
                name,
                description,
                meal_type,
                prep_time_min,
                cook_time_min,
                servings,
                calories,
                protein_g,
                carbs_g,
                fat_g,
                image_url
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                description = VALUES(description),
                meal_type = VALUES(meal_type),
                prep_time_min = VALUES(prep_time_min),
                cook_time_min = VALUES(cook_time_min),
                servings = VALUES(servings),
                calories = VALUES(calories),
                protein_g = VALUES(protein_g),
                carbs_g = VALUES(carbs_g),
                fat_g = VALUES(fat_g),
                image_url = VALUES(image_url)
        """

        cursor = conn.cursor()
        try:
            for recipe in recipes:
                cursor.execute(sql, _to_mysql_row(recipe))
        finally:
            cursor.close()
        conn.commit()
        return len(recipes)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ensure_recipes_table(conn: Any) -> None:
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id            INT PRIMARY KEY,
                name          VARCHAR(255) NOT NULL,
                description   TEXT,
                meal_type     VARCHAR(50)  NOT NULL,
                prep_time_min INT          DEFAULT 0,
                cook_time_min INT          DEFAULT 0,
                servings      INT          DEFAULT 2,
                calories      DOUBLE       DEFAULT 0,
                protein_g     DOUBLE       DEFAULT 0,
                carbs_g       DOUBLE       DEFAULT 0,
                fat_g         DOUBLE       DEFAULT 0,
                image_url     VARCHAR(500)
            )
            """
        )
    finally:
        cursor.close()


def _to_mysql_row(recipe: RecipeRecord) -> tuple:
    return (
        _stable_recipe_id(recipe),
        recipe.title.strip(),
        _build_description(recipe),
        _infer_meal_type(recipe),
        max(0, int(recipe.prep_time_minutes or 0)),
        max(0, int(recipe.cook_time_minutes or 0)),
        _parse_servings(recipe.servings),
        0.0,
        0.0,
        0.0,
        0.0,
        recipe.image_url.strip() if recipe.image_url else None,
    )


def _stable_recipe_id(recipe: RecipeRecord) -> int:
    # Stable deterministic id derived from source + URL so repeated scrapes upsert.
    key = f"{recipe.source}|{recipe.url}".encode("utf-8")
    digest = hashlib.sha1(key).digest()
    value = int.from_bytes(digest[:4], byteorder="big", signed=False) & 0x7FFFFFFF
    if value == 0:
        return 1
    return value


def _build_description(recipe: RecipeRecord) -> str:
    ingredients_preview = ", ".join(recipe.ingredients[:8]).strip()
    parts = [f"Fonte: {recipe.source}", f"URL: {recipe.url}"]
    if ingredients_preview:
        parts.append(f"Ingredientes: {ingredients_preview}")
    return " | ".join(parts)


def _infer_meal_type(recipe: RecipeRecord) -> str:
    tokens: list[str] = []
    tokens.append(_normalize_token(recipe.title))
    tokens.extend(_normalize_token(tag) for tag in recipe.tags)
    merged = " ".join(token for token in tokens if token)

    if any(token in merged for token in BREAKFAST_TOKENS):
        return "BREAKFAST"
    if any(token in merged for token in SNACK_TOKENS):
        return "SNACK"
    if any(token in merged for token in LUNCH_TOKENS):
        return "LUNCH"
    return "DINNER"


def _parse_servings(raw: str | None) -> int:
    if not raw:
        return 2
    match = SERVINGS_NUMBER_RE.search(raw)
    if not match:
        return 2
    return max(1, int(match.group(0)))


def _normalize_token(value: str | None) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text)


def _resolve_mysql_config(backend_env_path: str) -> dict[str, str | int | bool | None]:
    env_file_values = _load_dotenv_file(backend_env_path)

    def pick(*keys: str, default: str) -> str:
        for key in keys:
            value = os.getenv(key)
            if value and value.strip():
                return value.strip()
            file_value = env_file_values.get(key)
            if file_value and file_value.strip():
                return file_value.strip()
        return default

    host = pick("MYSQL_HOST", "DB_HOST", default="localhost")
    port_raw = pick("MYSQL_PORT", "DB_PORT", default="3306")
    database = pick("MYSQL_DB", "DB_NAME", default="bugsbyte")
    user = pick("MYSQL_USER", "DB_USER", default="root")
    password = pick("MYSQL_PASS", "DB_PASS", default="")
    params_raw = pick(
        "MYSQL_PARAMS",
        "DB_PARAMS",
        default="useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC",
    )

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError(f"Porta MySQL inválida: {port_raw}") from exc

    params = dict(parse_qsl(params_raw, keep_blank_values=True))
    ssl_disabled: bool | None = None
    use_ssl_raw = params.get("useSSL")
    if use_ssl_raw is not None:
        use_ssl = str(use_ssl_raw).strip().lower() in {"1", "true", "yes", "on"}
        ssl_disabled = not use_ssl

    return {
        "host": host,
        "port": port,
        "database": database,
        "user": user,
        "password": password,
        "ssl_disabled": ssl_disabled,
    }


def _load_dotenv_file(path: str) -> dict[str, str]:
    dotenv_path = Path(path)
    if not dotenv_path.is_absolute():
        dotenv_path = Path.cwd() / dotenv_path
    if not dotenv_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key:
            values[key] = value
    return values
