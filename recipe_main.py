from __future__ import annotations

import argparse
from pathlib import Path

from recipe_scraper.matcher import match_recipes_by_ingredients
from recipe_scraper.scraper import RecipeScraper, export_recipes_to_json, flatten_scrape_result
from recipe_scraper.sources import default_sources
from recipe_scraper.storage import load_recipes, upsert_recipes
from supermarket_scraper.meal_plan import load_ingredient_needs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Scraper de receitas (TeleCulinaria) e sugestao de refeicoes "
            "com base nos ingredientes disponiveis."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scrape_parser = subparsers.add_parser("scrape", help="Scrape de receitas e import para SQLite.")
    scrape_parser.add_argument("--db", default="recipes.db", help="Caminho do SQLite.")
    scrape_parser.add_argument(
        "--output-json",
        default="recipes_scraped.json",
        help="Arquivo JSON com receitas raspadas.",
    )
    scrape_parser.add_argument(
        "--max-recipes-per-source",
        type=int,
        default=60,
        help="Maximo de receitas por fonte.",
    )
    scrape_parser.add_argument(
        "--max-pages-per-list",
        type=int,
        default=2,
        help="Quantidade de paginas por URL de lista.",
    )
    scrape_parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Timeout HTTP por request (segundos).",
    )
    scrape_parser.add_argument(
        "--debug",
        action="store_true",
        help="Mostra diagnostico detalhado de scraping.",
    )
    scrape_parser.add_argument(
        "--sources",
        default="teleculinaria",
        help="Fontes a usar: all ou teleculinaria.",
    )

    suggest_parser = subparsers.add_parser(
        "suggest", help="Sugere refeicoes com base nos ingredientes."
    )
    suggest_parser.add_argument("--db", default="recipes.db", help="Caminho do SQLite.")
    suggest_parser.add_argument(
        "--ingredients",
        default=None,
        help="Ingredientes separados por virgula. Ex: ovos,tomate,alho",
    )
    suggest_parser.add_argument(
        "--meal-plan",
        default=None,
        help="Alternativa: JSON do meal planner para extrair ingredientes automaticamente.",
    )
    suggest_parser.add_argument(
        "--report",
        default=None,
        help="Alternativa: report.json do scraper de supermercados para extrair ingredientes.",
    )
    suggest_parser.add_argument("--top", type=int, default=15, help="Quantidade maxima de sugestoes.")
    suggest_parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.35,
        help="Cobertura minima de ingredientes (0-1).",
    )
    suggest_parser.add_argument(
        "--only-possible",
        action="store_true",
        help="Mostra apenas receitas 100% compativeis com os ingredientes informados.",
    )

    run_parser = subparsers.add_parser(
        "run", help="Executa scrape e logo depois imprime sugestoes de refeicoes."
    )
    run_parser.add_argument("--db", default="recipes.db", help="Caminho do SQLite.")
    run_parser.add_argument(
        "--ingredients",
        default=None,
        help="Ingredientes separados por virgula. Ex: ovos,tomate,alho",
    )
    run_parser.add_argument(
        "--meal-plan",
        default=None,
        help="Alternativa: JSON do meal planner para extrair ingredientes automaticamente.",
    )
    run_parser.add_argument(
        "--report",
        default=None,
        help="Alternativa: report.json do scraper de supermercados para extrair ingredientes.",
    )
    run_parser.add_argument(
        "--max-recipes-per-source",
        type=int,
        default=60,
        help="Maximo de receitas por fonte no scrape.",
    )
    run_parser.add_argument(
        "--max-pages-per-list",
        type=int,
        default=2,
        help="Quantidade de paginas por URL de lista.",
    )
    run_parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Timeout HTTP por request (segundos).",
    )
    run_parser.add_argument(
        "--debug",
        action="store_true",
        help="Mostra diagnostico detalhado de scraping.",
    )
    run_parser.add_argument(
        "--sources",
        default="teleculinaria",
        help="Fontes a usar: all ou teleculinaria.",
    )
    run_parser.add_argument("--top", type=int, default=15, help="Quantidade maxima de sugestoes.")
    run_parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.35,
        help="Cobertura minima de ingredientes (0-1).",
    )
    run_parser.add_argument(
        "--only-possible",
        action="store_true",
        help="Mostra apenas receitas 100% compativeis com os ingredientes informados.",
    )

    return parser.parse_args()


def main() -> None:
    try:
        args = parse_args()
        if args.command == "scrape":
            _cmd_scrape(args)
            return
        if args.command == "suggest":
            _cmd_suggest(args)
            return
        if args.command == "run":
            _cmd_run(args)
            return
        raise ValueError(f"Comando invalido: {args.command}")
    except ValueError as exc:
        print(f"Erro: {exc}")


def _cmd_scrape(args: argparse.Namespace) -> None:
    scrape_result = _scrape_all(
        timeout=args.timeout,
        max_recipes_per_source=args.max_recipes_per_source,
        max_pages_per_list=args.max_pages_per_list,
        debug=args.debug,
        source_filter=args.sources,
    )
    recipes = flatten_scrape_result(scrape_result)
    total = upsert_recipes(args.db, recipes)
    export_recipes_to_json(recipes, args.output_json)

    print("Scrape concluido.")
    for source, records in scrape_result.items():
        print(f"- {source}: {len(records)} receitas")
    print(f"Total importado/upsert no SQLite: {total}")
    print(f"DB: {Path(args.db)}")
    print(f"JSON: {Path(args.output_json)}")


def _cmd_suggest(args: argparse.Namespace) -> None:
    recipes = load_recipes(args.db)
    ingredients = _resolve_ingredients(args)
    if not recipes:
        print("Nao ha receitas no DB. Executa: python recipe_main.py scrape")
        return

    require_full_match = _requires_full_match(args)
    matches = match_recipes_by_ingredients(
        recipes=recipes,
        pantry_ingredients=ingredients,
        min_ratio=args.min_ratio,
        limit=args.top,
        require_full_match=require_full_match,
    )
    _print_suggestions(ingredients, matches, require_full_match=require_full_match)


def _cmd_run(args: argparse.Namespace) -> None:
    scrape_result = _scrape_all(
        timeout=args.timeout,
        max_recipes_per_source=args.max_recipes_per_source,
        max_pages_per_list=args.max_pages_per_list,
        debug=args.debug,
        source_filter=args.sources,
    )
    recipes = flatten_scrape_result(scrape_result)
    upsert_recipes(args.db, recipes)

    ingredients = _resolve_ingredients(args)
    require_full_match = _requires_full_match(args)
    matches = match_recipes_by_ingredients(
        recipes=recipes,
        pantry_ingredients=ingredients,
        min_ratio=args.min_ratio,
        limit=args.top,
        require_full_match=require_full_match,
    )

    print("Scrape concluido:")
    for source, records in scrape_result.items():
        print(f"- {source}: {len(records)} receitas")
    print("")
    _print_suggestions(ingredients, matches, require_full_match=require_full_match)


def _scrape_all(
    timeout: float,
    max_recipes_per_source: int,
    max_pages_per_list: int,
    debug: bool,
    source_filter: str,
) -> dict[str, list]:
    scraper = RecipeScraper(timeout_seconds=timeout, debug=debug)
    sources = _resolve_sources(source_filter)
    return scraper.scrape_sources(
        sources=sources,
        max_recipes_per_source=max_recipes_per_source,
        max_pages_per_list_url=max_pages_per_list,
    )


def _split_ingredients(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _resolve_ingredients(args: argparse.Namespace) -> list[str]:
    ingredients = _split_ingredients(args.ingredients or "")
    if args.meal_plan:
        needs = load_ingredient_needs(args.meal_plan)
        ingredients.extend([item.name for item in needs if item.name])
    if getattr(args, "report", None):
        needs = load_ingredient_needs(args.report)
        ingredients.extend([item.name for item in needs if item.name])

    deduped: list[str] = []
    seen: set[str] = set()
    for item in ingredients:
        token = item.strip().lower()
        if not token or token in seen:
            continue
        seen.add(token)
        deduped.append(item.strip())

    if not deduped:
        raise ValueError("Informa --ingredients, --meal-plan ou --report.")
    return deduped


def _requires_full_match(args: argparse.Namespace) -> bool:
    return bool(getattr(args, "only_possible", False))


def _resolve_sources(source_filter: str) -> list:
    all_sources = default_sources()
    if not source_filter or source_filter.strip().lower() == "all":
        return all_sources

    tokens = {item.strip().lower() for item in source_filter.split(",") if item.strip()}
    alias = {
        "teleculinaria": "teleculinaria",
        "teleculinária": "teleculinaria",
    }
    normalized = {alias.get(token, token) for token in tokens}

    selected = []
    for source in all_sources:
        key = source.name.lower()
        if "teleculinaria" in key and "teleculinaria" in normalized:
            selected.append(source)

    if not selected:
        raise ValueError("Nenhuma source valida em --sources. Usa: all ou teleculinaria.")
    return selected


def _print_suggestions(
    ingredients: list[str],
    matches: list,
    require_full_match: bool = False,
) -> None:
    print("Ingredientes informados:")
    print(f"- {', '.join(ingredients)}")

    if not matches:
        if require_full_match:
            print("\nNenhuma refeicao 100% compativel encontrada.")
        else:
            print("\nNenhuma refeicao com cobertura minima encontrada.")
        return

    print("\nRefeicoes possiveis:")
    for index, match in enumerate(matches, start=1):
        percent = match.match_ratio * 100
        print(
            f"{index}. {match.title} [{match.source}] "
            f"- cobertura: {percent:.0f}% "
            f"({len(match.matched_ingredients)}/{match.total_ingredients})"
        )
        if match.missing_ingredients:
            missing_preview = ", ".join(match.missing_ingredients[:4])
            print(f"   faltam: {missing_preview}")
        print(f"   link: {match.url}")
        if match.image_url:
            print(f"   foto: {match.image_url}")


if __name__ == "__main__":
    main()
