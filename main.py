from __future__ import annotations

import argparse
import json
from pathlib import Path

from supermarket_scraper.meal_plan import load_ingredient_needs
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
        "--max-workers",
        type=int,
        default=8,
        help="Quantidade de requests em paralelo.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="Timeout por request (segundos).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    ingredients = load_ingredient_needs(args.meal_plan)
    markets = load_market_configs(args.markets)
    scraper = SupermarketScraper(timeout_seconds=args.timeout, max_workers=args.max_workers)
    matches = scraper.scrape(ingredients=ingredients, markets=markets)

    print(render_markdown_report(ingredients=ingredients, markets=markets, matches=matches))
    _print_diagnostics(matches=matches)

    if args.output:
        payload = build_json_report(ingredients=ingredients, markets=markets, matches=matches)
        output_path = Path(args.output)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nRelatorio JSON salvo em: {output_path}")


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
