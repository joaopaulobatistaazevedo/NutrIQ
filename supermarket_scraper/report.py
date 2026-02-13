from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict
from typing import Any

from .models import IngredientNeed, MarketConfig, PriceMatch


def render_markdown_report(
    ingredients: list[IngredientNeed],
    markets: list[MarketConfig],
    matches: list[PriceMatch],
) -> str:
    index = {(m.ingredient.normalized_name, m.supermarket): m for m in matches}
    lines: list[str] = []

    header = ["Ingrediente", *[market.name for market in markets]]
    lines.append(_md_row(header))
    lines.append(_md_row(["---"] * len(header)))

    for ingredient in ingredients:
        row = [ingredient.name]
        for market in markets:
            match = index.get((ingredient.normalized_name, market.name))
            row.append(_format_cell(match))
        lines.append(_md_row(row))

    lines.append("")
    lines.extend(_render_totals(markets, matches))
    return "\n".join(lines)


def build_json_report(
    ingredients: list[IngredientNeed],
    markets: list[MarketConfig],
    matches: list[PriceMatch],
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    totals: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total_price": 0.0, "total_calories": 0.0, "found_count": 0, "missing_count": 0}
    )

    for match in matches:
        payload = asdict(match)
        payload["ingredient"] = asdict(match.ingredient)
        grouped[match.supermarket].append(payload)

        bucket = totals[match.supermarket]
        if match.found and match.price is not None:
            bucket["total_price"] += match.price
            if match.calories is not None:
                bucket["total_calories"] += match.calories
            bucket["found_count"] += 1
        else:
            bucket["missing_count"] += 1

    return {
        "ingredients": [asdict(item) for item in ingredients],
        "markets": [asdict(item) for item in markets],
        "results_by_market": grouped,
        "totals": totals,
    }


def _format_cell(match: PriceMatch | None) -> str:
    if match is None:
        return "-"
    if not match.found or match.price is None:
        return _format_error_cell(match.note)
    value = f"{match.price:.2f}"
    calories_text = f" · {match.calories:.0f} kcal" if match.calories is not None else ""
    if match.currency.upper() == "EUR":
        return f"{value} EUR{calories_text}"
    return f"{value} {match.currency}{calories_text}"


def _render_totals(markets: list[MarketConfig], matches: list[PriceMatch]) -> list[str]:
    totals: dict[str, float] = defaultdict(float)
    calories_totals: dict[str, float] = defaultdict(float)
    missing: dict[str, int] = defaultdict(int)
    found: dict[str, int] = defaultdict(int)

    for match in matches:
        if match.found and match.price is not None:
            totals[match.supermarket] += match.price
            if match.calories is not None:
                calories_totals[match.supermarket] += match.calories
            found[match.supermarket] += 1
        else:
            missing[match.supermarket] += 1

    lines = ["Totais estimados:"]
    for market in markets:
        total_price = totals.get(market.name, 0.0)
        total_calories = calories_totals.get(market.name, 0.0)
        found_count = found.get(market.name, 0)
        missing_count = missing.get(market.name, 0)
        lines.append(
            f"- {market.name}: {total_price:.2f} {market.currency} "
            f"| {total_calories:.0f} kcal "
            f"(encontrados: {found_count}, faltando: {missing_count})"
        )
    return lines


def _md_row(columns: list[str]) -> str:
    escaped = [item.replace("|", "\\|") for item in columns]
    return f"| {' | '.join(escaped)} |"


def build_issue_summary(matches: list[PriceMatch]) -> dict[str, int]:
    summary: dict[str, int] = defaultdict(int)
    for match in matches:
        if match.found:
            continue
        summary[_issue_kind(match.note)] += 1
    return dict(summary)


def _format_error_cell(note: str | None) -> str:
    kind = _issue_kind(note)
    mapping = {
        "dns": "DNS_ERR",
        "network": "NET_ERR",
        "timeout": "TIMEOUT",
        "http": "HTTP_ERR",
        "not_found": "N/A",
    }
    return mapping.get(kind, "ERR")


def _issue_kind(note: str | None) -> str:
    if not note:
        return "unknown"
    lowered = note.lower()
    if lowered.startswith("erro dns"):
        return "dns"
    if lowered.startswith("erro timeout"):
        return "timeout"
    if lowered.startswith("erro http"):
        return "http"
    if lowered.startswith("erro de rede") or lowered.startswith("erro de conexão"):
        return "network"
    if "nao encontrado" in lowered:
        return "not_found"
    return "other"
