from __future__ import annotations

import argparse
import json
from pathlib import Path

from supermarket_scraper.meal_plan import (
    enrich_meal_plan_with_recipe_ingredients,
    load_ingredient_needs_from_payload,
    load_recipe_ingredient_catalog,
)
from supermarket_scraper.report import (
    build_issue_summary,
    build_json_report,
    render_markdown_report,
)
from supermarket_scraper.scraper import SupermarketScraper, load_market_configs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compara precos de ingredientes do meal planner entre supermercados."
    )
    parser.add_argument(
        "--meal-plan",
        required=True,
        help="Caminho para o JSON do meal planner.",
    )
    parser.add_argument(
        "--markets",
        required=True,
        help="Caminho para o JSON de configuracao dos supermercados.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Arquivo JSON de saida com detalhes completos (opcional).",
    )
    parser.add_argument(
        "--recipes-json",
        default=None,
        help=(
            "JSON com receitas (ex: recipes_scraped.json) para enriquecer "
            "meals do meal-plan com ingredientes completos."
        ),
    )
    parser.add_argument(
        "--enriched-meal-plan-output",
        default=None,
        help="Arquivo para gravar meal-plan enriquecido com ingredientes (opcional).",
    )
    parser.add_argument(
        "--max-workers",
        type=int,
        default=8,
        help="Quantidade de requests em paralelo.",
    )
    parser.add_argument(
        "--workers-per-ingredient",
        type=int,
        default=0,
        help=(
            "Se > 0, usa (ingredientes * valor) threads "
            "(ex: 1 = ~1 thread por ingrediente)."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Timeout por request (segundos).",
    )
    parser.add_argument(
        "--connect-timeout",
        type=float,
        default=3.5,
        help="Timeout de conexão TCP por request (segundos).",
    )
    parser.add_argument(
        "--delay-scale",
        type=float,
        default=0.2,
        help="Escala de atraso aleatório anti-bloqueio (0 = sem atraso).",
    )
    parser.add_argument(
        "--max-product-pages",
        type=int,
        default=6,
        help="Máximo de páginas de produto para enriquecer cada pesquisa.",
    )
    parser.add_argument(
        "--selectors-only",
        action="store_true",
        help="Usa apenas o parsing por seletores (mais rápido, menos profundo).",
    )
    parser.add_argument(
        "--request-retries",
        type=int,
        default=1,
        help="Número de retries HTTP por request (0 para máxima velocidade).",
    )
    parser.add_argument(
        "--turbo",
        action="store_true",
        help=(
            "Modo agressivo para reduzir tempo total: mais threads, menos atrasos "
            "e menos páginas secundárias."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    meal_plan_payload = _load_json(args.meal_plan)

    if args.recipes_json:
        recipe_catalog = load_recipe_ingredient_catalog(args.recipes_json)
        meal_plan_payload, enriched_meals = enrich_meal_plan_with_recipe_ingredients(
            meal_plan_payload=meal_plan_payload,
            recipe_catalog=recipe_catalog,
        )
        print(f"Meal-plan enriquecido com ingredientes em {enriched_meals} refeições.")

    if args.enriched_meal_plan_output:
        enriched_path = Path(args.enriched_meal_plan_output)
        enriched_path.write_text(
            json.dumps(meal_plan_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Meal-plan enriquecido salvo em: {enriched_path}")

    ingredients = load_ingredient_needs_from_payload(meal_plan_payload)
    markets = load_market_configs(args.markets)
    effective_workers = _resolve_effective_workers(
        ingredient_count=len(ingredients),
        market_count=len(markets),
        max_workers=args.max_workers,
        workers_per_ingredient=args.workers_per_ingredient,
        turbo=args.turbo,
    )
    timeout_seconds = args.timeout
    connect_timeout_seconds = args.connect_timeout
    delay_scale = args.delay_scale
    max_product_pages = args.max_product_pages
    max_search_candidates = 120
    disable_nutrition_tab = False
    selectors_only = args.selectors_only
    request_retries = max(0, int(args.request_retries))
    if args.turbo:
        timeout_seconds = min(timeout_seconds, 7.5)
        connect_timeout_seconds = min(connect_timeout_seconds, 2.5)
        delay_scale = min(delay_scale, 0.02)
        max_product_pages = min(max_product_pages, 0)
        max_search_candidates = 24
        disable_nutrition_tab = True
        selectors_only = True
        request_retries = 0

    scraper = SupermarketScraper(
        timeout_seconds=timeout_seconds,
        max_workers=effective_workers,
        connect_timeout_seconds=connect_timeout_seconds,
        delay_scale=delay_scale,
        max_product_pages=max_product_pages,
        max_search_candidates=max_search_candidates,
        disable_nutrition_tab=disable_nutrition_tab,
        selectors_only=selectors_only,
        request_retries=request_retries,
    )
    matches = scraper.scrape(ingredients=ingredients, markets=markets)

    print(render_markdown_report(ingredients=ingredients, markets=markets, matches=matches))
    _print_diagnostics(matches=matches)

    if args.output:
        payload = build_json_report(ingredients=ingredients, markets=markets, matches=matches)
        output_path = Path(args.output)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nRelatorio JSON salvo em: {output_path}")


def _load_json(path: str | Path) -> dict:
    resolved_path = Path(path)
    raw = resolved_path.read_text(encoding="utf-8")
    if not raw.strip():
        raise ValueError(f"Arquivo JSON vazio: {resolved_path}")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"JSON invalido em {resolved_path}:{exc.lineno}:{exc.colno} ({exc.msg})"
        ) from exc
    if not isinstance(parsed, dict):
        raise ValueError("Meal planner deve ser um objeto JSON.")
    return parsed


def _resolve_effective_workers(
    ingredient_count: int,
    market_count: int,
    max_workers: int,
    workers_per_ingredient: int,
    turbo: bool,
) -> int:
    safe_ingredients = max(1, int(ingredient_count))
    safe_markets = max(1, int(market_count))
    total_tasks = max(1, safe_ingredients * safe_markets)

    workers = max(1, int(max_workers))
    if workers_per_ingredient > 0:
        workers = safe_ingredients * int(workers_per_ingredient)
    elif turbo:
        workers = max(workers, safe_ingredients)

    # Evita explosão de threads em redes instáveis e bloqueios por anti-bot.
    workers = min(workers, total_tasks, 96)
    return max(1, workers)


def _print_diagnostics(matches: list) -> None:
    issues = build_issue_summary(matches)
    if not issues:
        return

    print("\nDiagnostico de falhas:")
    for key in sorted(issues):
        print(f"- {key}: {issues[key]}")

    if issues.get("dns", 0) > 0:
        print(
            "\nCorrecao sugerida: problema de DNS/rede. "
            "Valida com 'nslookup www.google.com' e configura nameserver "
            "(ex: 1.1.1.1/8.8.8.8) no sistema/WSL/VPN."
        )


if __name__ == "__main__":
    main()
