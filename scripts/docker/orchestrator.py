from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import mysql.connector
from mysql.connector import MySQLConnection

def _log(message: str) -> None:
    print(f"[orchestrator] {message}", flush=True)


def _wait_for_http(url: str, timeout_seconds: int = 180) -> bool:
    started = time.time()
    while time.time() - started < timeout_seconds:
        try:
            with urlopen(url, timeout=5) as response:
                if 200 <= response.status < 500:
                    return True
        except (URLError, HTTPError):
            pass
        time.sleep(2)
    return False


def _wait_for_file(path: Path, timeout_seconds: int = 120) -> bool:
    started = time.time()
    while time.time() - started < timeout_seconds:
        if path.exists() and path.stat().st_size > 0:
            return True
        time.sleep(2)
    return path.exists() and path.stat().st_size > 0


def _mysql_connect_with_retry(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
    timeout_seconds: int = 180,
) -> MySQLConnection:
    started = time.time()
    while time.time() - started < timeout_seconds:
        try:
            return mysql.connector.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
                autocommit=False,
            )
        except mysql.connector.Error:
            time.sleep(2)
    raise RuntimeError(
        f"MySQL indisponível em {host}:{port}/{database} após {timeout_seconds}s."
    )


def _table_exists(conn: MySQLConnection, table_name: str) -> bool:
    query = """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
        LIMIT 1
    """
    with conn.cursor() as cursor:
        cursor.execute(query, (table_name,))
        return cursor.fetchone() is not None


def _table_row_count(conn: MySQLConnection, table_name: str) -> int:
    with conn.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
        row = cursor.fetchone()
    return int(row[0]) if row else 0


def _mysql_has_application_data(conn: MySQLConnection) -> bool:
    important_tables = (
        "users",
        "recipes",
        "meal_plans",
        "posts",
        "ingredient_market_prices",
    )
    for table_name in important_tables:
        if not _table_exists(conn, table_name):
            continue
        if _table_row_count(conn, table_name) > 0:
            return True
    return False


def _apply_mysql_seed_sql(conn: MySQLConnection, sql_path: Path) -> None:
    script = sql_path.read_text(encoding="utf-8")
    with conn.cursor() as cursor:
        for _ in cursor.execute(script, multi=True):
            pass
    conn.commit()


def _seed_mysql_if_needed(
    sql_path: Path,
    mode: str,
    force: bool,
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
) -> None:
    normalized_mode = mode.strip().lower()
    if normalized_mode not in {"if_empty", "always", "off"}:
        raise ValueError(f"MYSQL_SEED_MODE inválido: {mode}")
    if normalized_mode == "off":
        _log("Seed MySQL desativado (MYSQL_SEED_MODE=off).")
        return
    if not sql_path.exists():
        _log(f"MySQL seed SQL não encontrado em {sql_path}. A saltar import.")
        return

    conn = _mysql_connect_with_retry(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
    )
    try:
        if not force and normalized_mode == "if_empty" and _mysql_has_application_data(conn):
            _log("MySQL já contém dados de aplicação. A saltar import do mysql_seed.sql.")
            return

        _log(f"A importar seed MySQL de {sql_path}...")
        _apply_mysql_seed_sql(conn, sql_path=sql_path)
        _log("Import de seed MySQL concluído.")
    finally:
        conn.close()


def _get_recipe_count(backend_url: str) -> int:
    endpoint = f"{backend_url.rstrip('/')}/api/recipes"
    with urlopen(endpoint, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if isinstance(payload, list):
        return len(payload)
    return 0


def _seed_recipes_if_needed(backend_url: str, seed_json_path: Path, recipes_db_path: Path) -> None:
    if not seed_json_path.exists():
        _log(f"Seed JSON não encontrado em {seed_json_path}. A saltar seed.")
        return

    current_count = _get_recipe_count(backend_url)
    if current_count > 0:
        _log(f"Seed já existente ({current_count} receitas).")
        return

    recipes_db_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "recipe_import.py",
        "--input",
        str(seed_json_path),
        "--db",
        str(recipes_db_path),
    ]
    _log(f"A importar receitas via {' '.join(command)}")
    subprocess.run(command, check=True)
    updated_count = _get_recipe_count(backend_url)
    _log(f"Seed concluído. Receitas no backend: {updated_count}")


def _import_prices_if_report_exists(
    backend_url: str,
    report_path: Path,
    wait_seconds: int,
) -> None:
    if not _wait_for_file(report_path, timeout_seconds=wait_seconds):
        _log(
            f"Report de preços não encontrado em {report_path} "
            f"após {wait_seconds}s. A saltar import."
        )
        return

    payload = report_path.read_bytes()
    endpoint = f"{backend_url.rstrip('/')}/api/prices/import"
    request = Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8", errors="replace")
    _log(f"Import de preços concluído: {raw[:300]}")


def _as_bool(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def main() -> None:
    backend_url = os.getenv("BACKEND_URL", "http://backend:7071")
    chatbot_health_url = os.getenv("CHATBOT_HEALTH_URL", "http://chatbot:8000/health")
    frontend_url = os.getenv("FRONTEND_URL", "http://frontend")
    mysql_host = os.getenv("MYSQL_HOST", "mysql")
    mysql_port = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_db = os.getenv("MYSQL_DB", "bugsbyte")
    mysql_user = os.getenv("MYSQL_USER", "bugsbyte")
    mysql_pass = os.getenv("MYSQL_PASS", "uma_password_forte")
    mysql_seed_sql = Path(os.getenv("MYSQL_SEED_SQL", "/app/data/mysql_seed.sql"))
    mysql_seed_mode = os.getenv("MYSQL_SEED_MODE", "if_empty")
    mysql_seed_force = _as_bool(os.getenv("MYSQL_SEED_FORCE"), default=False)
    seed_json_path = Path(os.getenv("RECIPE_SEED_JSON", "/app/data/recipes_scraped.json"))
    recipes_db_path = Path(os.getenv("RECIPES_DB_PATH", "/app/data/recipes.db"))
    report_path = Path(os.getenv("PRICE_REPORT_JSON", "/app/data/report.json"))
    report_wait_seconds = int(os.getenv("PRICE_REPORT_WAIT_SECONDS", "150"))
    keep_alive = _as_bool(os.getenv("ORCHESTRATOR_KEEP_ALIVE"), default=True)

    _seed_mysql_if_needed(
        sql_path=mysql_seed_sql,
        mode=mysql_seed_mode,
        force=mysql_seed_force,
        host=mysql_host,
        port=mysql_port,
        database=mysql_db,
        user=mysql_user,
        password=mysql_pass,
    )

    _log("À espera do backend...")
    if not _wait_for_http(f"{backend_url.rstrip('/')}/api/recipes", timeout_seconds=240):
        raise RuntimeError(f"Backend indisponível em {backend_url}")

    _log("À espera do chatbot...")
    if not _wait_for_http(chatbot_health_url, timeout_seconds=240):
        raise RuntimeError(f"Chatbot indisponível em {chatbot_health_url}")

    _log("À espera do frontend...")
    if not _wait_for_http(frontend_url, timeout_seconds=240):
        raise RuntimeError(f"Frontend indisponível em {frontend_url}")

    _seed_recipes_if_needed(backend_url, seed_json_path, recipes_db_path)
    _import_prices_if_report_exists(backend_url, report_path, wait_seconds=report_wait_seconds)
    _log("Orquestração concluída.")

    if keep_alive:
        _log("Modo keep-alive ativo.")
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()
