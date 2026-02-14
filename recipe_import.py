from __future__ import annotations

import argparse

from recipe_scraper.backend_sync import sync_recipes_to_backend
from recipe_scraper.scraper import load_recipes_from_json
from recipe_scraper.storage import upsert_recipes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa receitas JSON para SQLite.")
    parser.add_argument("--input", required=True, help="Arquivo JSON de receitas raspadas.")
    parser.add_argument("--db", default="recipes.db", help="Arquivo SQLite de destino.")
    parser.add_argument(
        "--skip-backend-sync",
        action="store_true",
        help="Nao sincroniza receitas para a tabela recipes do MySQL do backend.",
    )
    parser.add_argument(
        "--backend-env",
        default="backend/.env",
        help="Caminho do .env com credenciais MySQL do backend.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    recipes = load_recipes_from_json(args.input)
    count = upsert_recipes(args.db, recipes)
    backend_count = 0
    backend_error: str | None = None
    if not args.skip_backend_sync:
        try:
            backend_count = sync_recipes_to_backend(
                recipes=recipes,
                backend_env_path=args.backend_env,
            )
        except Exception as exc:
            backend_error = str(exc)

    print(f"Receitas importadas/upsert: {count}")
    if args.skip_backend_sync:
        print("Sync MySQL backend: desativado (--skip-backend-sync)")
    elif backend_error:
        print(f"Sync MySQL backend: FALHOU ({backend_error})")
    else:
        print(f"Receitas upsert no MySQL backend (tabela recipes): {backend_count}")
    print(f"DB: {args.db}")


if __name__ == "__main__":
    main()
