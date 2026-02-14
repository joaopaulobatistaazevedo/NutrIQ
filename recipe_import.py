from __future__ import annotations

import argparse

from recipe_scraper.scraper import load_recipes_from_json
from recipe_scraper.storage import upsert_recipes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa receitas JSON para SQLite.")
    parser.add_argument("--input", required=True, help="Arquivo JSON de receitas raspadas.")
    parser.add_argument("--db", default="recipes.db", help="Arquivo SQLite de destino.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    recipes = load_recipes_from_json(args.input)
    count = upsert_recipes(args.db, recipes)
    print(f"Receitas importadas/upsert: {count}")
    print(f"DB: {args.db}")


if __name__ == "__main__":
    main()
