from __future__ import annotations

import json
import math
import random
import socket
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .extractors import (
    extract_products_from_json_ld,
    extract_product_from_meta,
    extract_products_from_selectors,
    extract_product_url_candidates,
    parse_calories_value,
)
from .models import IngredientNeed, MarketConfig, PriceMatch
from .normalization import normalize_text
from .packaging import base_unit_for_dimension, extract_pack_quantity, infer_dimension

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    )
}

FRESH_INGREDIENTS = {"ovos", "cebola", "alho", "tomate", "alface"}
PROCESSED_TOKENS = {
    "sopa",
    "caldo",
    "molho",
    "triturado",
    "polpa",
    "concentrado",
    "ketchup",
    "baguete",
    "pizza",
    "bolacha",
    "bolachas",
    "bolo",
    "bolos",
    "biscoito",
    "biscoitos",
    "snack",
    "tempero",
    "ultracongelado",
    "congelado",
}
FRESH_URL_HINTS = {
    "/produtos-frescos/",
    "/legumes/",
    "/fruta/",
    "/ovos/",
    "/hort",
}
NONFRESH_URL_HINTS = {
    "/mercearia/",
    "/congelados/",
    "/bolachas",
    "/sopas",
    "/pao/",
    "/refeicoes",
}


def load_market_configs(markets_path: str | Path) -> list[MarketConfig]:
    raw = Path(markets_path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Arquivo de supermercados deve ser objeto JSON.")

    supermarkets = parsed.get("supermarkets")
    if not isinstance(supermarkets, list) or not supermarkets:
        raise ValueError("Arquivo de supermercados deve conter 'supermarkets' com lista.")

    configs: list[MarketConfig] = []
    for item in supermarkets:
        if not isinstance(item, dict):
            raise ValueError("Cada supermercado deve ser um objeto.")
        configs.append(MarketConfig.from_dict(item))
    return configs


class SupermarketScraper:
    def __init__(self, timeout_seconds: float = 15.0, max_workers: int = 8) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_workers = max_workers

    def scrape(
        self,
        ingredients: Iterable[IngredientNeed],
        markets: Iterable[MarketConfig],
    ) -> list[PriceMatch]:
        futures: list[Future[PriceMatch]] = []
        ingredients_list = list(ingredients)
        markets_list = list(markets)
        results: list[PriceMatch] = []

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            for market in markets_list:
                dns_issue = self._preflight_dns_check(market)
                if dns_issue is not None:
                    for ingredient in ingredients_list:
                        results.append(
                            PriceMatch(
                                supermarket=market.name,
                                ingredient=ingredient,
                                found=False,
                                currency=market.currency,
                                note=dns_issue,
                            )
                        )
                    continue

                for ingredient in ingredients_list:
                    futures.append(executor.submit(self._lookup_ingredient, ingredient, market))

            for future in as_completed(futures):
                results.append(future.result())

        return results

    def _lookup_ingredient(
        self, ingredient: IngredientNeed, market: MarketConfig
    ) -> PriceMatch:
        query = quote_plus(ingredient.name)
        query_compact = normalize_text(ingredient.name).replace(" ", "")
        search_url = market.search_url.format(
            query=query,
            ingredient=query,
            query_raw=ingredient.name,
            query_compact=query_compact,
        )
        host = urlparse(search_url).hostname or "host_desconhecido"
        try:
            if market.max_delay_seconds > 0:
                lower = max(0.0, market.min_delay_seconds)
                upper = max(lower, market.max_delay_seconds)
                time.sleep(random.uniform(lower, upper))

            headers = {**DEFAULT_HEADERS, **market.headers}
            response = requests.get(search_url, headers=headers, timeout=self.timeout_seconds)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            candidates = self._collect_search_candidates(soup=soup, market=market)
            needs_product_page_enrichment = (
                len(candidates) < 3
                or not any(item.get("calories") is not None for item in candidates)
            )
            if needs_product_page_enrichment:
                candidates.extend(
                    self._extract_from_product_pages(
                        soup=soup,
                        html_text=response.text,
                        market=market,
                        headers=headers,
                        seed_urls=[
                            str(item.get("url")).strip()
                            for item in candidates
                            if item.get("url")
                        ],
                    )
                )
                candidates = _dedupe_candidates(candidates)
            extracted = self._select_best_candidate(ingredient=ingredient, candidates=candidates)

            if extracted is None:
                return PriceMatch(
                    supermarket=market.name,
                    ingredient=ingredient,
                    found=False,
                    currency=market.currency,
                    note="Produto/Preco nao encontrado.",
                )

            return PriceMatch(
                supermarket=market.name,
                ingredient=ingredient,
                found=True,
                product_name=extracted.get("name"),
                price=extracted.get("price"),
                calories=extracted.get("calories"),
                currency=extracted.get("currency", market.currency) or market.currency,
                product_url=extracted.get("url"),
                image_url=extracted.get("image_url"),
                source=extracted.get("source"),
                note=extracted.get("selection_note"),
            )
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else "desconhecido"
            return PriceMatch(
                supermarket=market.name,
                ingredient=ingredient,
                found=False,
                currency=market.currency,
                note=f"Erro HTTP {code}: {exc}",
            )
        except requests.Timeout as exc:
            return PriceMatch(
                supermarket=market.name,
                ingredient=ingredient,
                found=False,
                currency=market.currency,
                note=f"Erro Timeout: {exc}",
            )
        except requests.ConnectionError as exc:
            note = _classify_connection_error(host=host, exc=exc)
            return PriceMatch(
                supermarket=market.name,
                ingredient=ingredient,
                found=False,
                currency=market.currency,
                note=note,
            )
        except Exception as exc:  # noqa: BLE001
            return PriceMatch(
                supermarket=market.name,
                ingredient=ingredient,
                found=False,
                currency=market.currency,
                note=f"Erro inesperado: {exc}",
            )

    def _preflight_dns_check(self, market: MarketConfig) -> str | None:
        host = urlparse(market.search_url).hostname
        if not host:
            return "Erro de configuração: search_url inválida (host ausente)."
        try:
            socket.getaddrinfo(host, None)
            return None
        except socket.gaierror as exc:
            return f"Erro DNS: não foi possível resolver '{host}' ({exc})."

    def _collect_search_candidates(
        self,
        soup: BeautifulSoup,
        market: MarketConfig,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        candidates.extend(
            extract_products_from_json_ld(
                soup=soup,
                base_url=market.base_url,
                limit=120,
            )
        )
        candidates.extend(
            extract_products_from_selectors(
                soup=soup,
                config=market,
                limit=120,
            )
        )
        return _dedupe_candidates(candidates)

    def _extract_from_product_pages(
        self,
        soup: BeautifulSoup,
        html_text: str,
        market: MarketConfig,
        headers: dict[str, str],
        seed_urls: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        discovered_urls = extract_product_url_candidates(
            soup=soup,
            html_text=html_text,
            base_url=market.base_url,
            url_patterns=market.product_url_patterns,
        )
        candidates: list[str] = []
        seen_urls: set[str] = set()
        for url in (seed_urls or []):
            token = str(url or "").strip()
            if not token or token in seen_urls:
                continue
            seen_urls.add(token)
            candidates.append(token)
        for url in discovered_urls:
            token = str(url or "").strip()
            if not token or token in seen_urls:
                continue
            seen_urls.add(token)
            candidates.append(token)

        if not candidates:
            return []

        extracted_items: list[dict[str, Any]] = []
        for candidate_url in candidates[:8]:
            try:
                response = requests.get(candidate_url, headers=headers, timeout=self.timeout_seconds)
                response.raise_for_status()
            except requests.RequestException:
                continue

            candidate_soup = BeautifulSoup(response.text, "html.parser")
            start_index = len(extracted_items)
            from_json_ld = extract_products_from_json_ld(
                candidate_soup,
                base_url=market.base_url,
                limit=5,
            )
            if from_json_ld:
                for item in from_json_ld:
                    if item.get("url") is None:
                        item["url"] = candidate_url
                    item["source"] = f"{item.get('source', 'json-ld')}-page"
                    extracted_items.append(item)

            from_meta = extract_product_from_meta(
                candidate_soup,
                fallback_currency=market.currency,
                base_url=market.base_url,
            )
            if from_meta is not None:
                if from_meta.get("url") is None:
                    from_meta["url"] = candidate_url
                from_meta["source"] = f"{from_meta.get('source', 'meta')}-page"
                extracted_items.append(from_meta)

            if any(item.get("calories") is not None for item in extracted_items[start_index:]):
                pass
            else:
                # First try calories already visible in product page (e.g. table "Energia (kcal)").
                fallback_calories = parse_calories_value(candidate_soup.get_text(" ", strip=True))
                if fallback_calories is None:
                    fallback_calories = self._extract_calories_from_nutritional_tab(
                        soup=candidate_soup,
                        headers=headers,
                        page_url=candidate_url,
                    )
                if fallback_calories is not None:
                    applied_to_existing = False
                    for item in extracted_items[start_index:]:
                        if item.get("calories") is None:
                            item["calories"] = fallback_calories
                            applied_to_existing = True

                    # If page extractors didn't yield priced items, still return a lightweight
                    # calories-only candidate keyed by URL so dedupe can enrich search results.
                    if not applied_to_existing:
                        extracted_items.append(
                            {
                                "name": None,
                                "price": None,
                                "calories": fallback_calories,
                                "currency": market.currency,
                                "url": candidate_url,
                                "source": "nutrition-page",
                            }
                        )

            if len(extracted_items) >= 24:
                break

        return _dedupe_candidates(extracted_items)

    def _extract_calories_from_nutritional_tab(
        self,
        soup: BeautifulSoup,
        headers: dict[str, str],
        page_url: str | None = None,
    ) -> float | None:
        anchor = soup.select_one(".js-nutritional-tab-anchor[data-url]")
        if anchor is None:
            return None

        tab_url = str(anchor.attrs.get("data-url") or "").strip()
        if not tab_url:
            return None
        tab_url = urljoin(page_url or "", tab_url)

        try:
            response = requests.get(tab_url, headers=headers, timeout=self.timeout_seconds)
            response.raise_for_status()
        except requests.RequestException:
            return None

        parsed = parse_calories_value(response.text)
        if parsed is not None:
            return parsed

        tab_soup = BeautifulSoup(response.text, "html.parser")
        return parse_calories_value(tab_soup.get_text(" ", strip=True))

    def _select_best_candidate(
        self,
        ingredient: IngredientNeed,
        candidates: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not candidates:
            return None

        ranked: list[tuple[tuple[float, ...], dict[str, Any]]] = []
        for candidate in candidates:
            price = _safe_float(candidate.get("price"))
            if price is None or price <= 0:
                continue

            name = str(candidate.get("name") or "").strip()
            if not name:
                name = "Produto sem nome"
            descriptor = f"{name} {candidate.get('url') or ''}"
            product_url = str(candidate.get("url") or "")

            ranking, total_price, selection_note = _rank_candidate(
                ingredient=ingredient,
                product_name=descriptor,
                product_url=product_url,
                unit_price=price,
            )
            payload = dict(candidate)
            payload["name"] = name
            payload["price"] = total_price
            payload["selection_note"] = selection_note
            ranked.append((ranking, payload))

        if not ranked:
            return None

        ranked.sort(key=lambda item: item[0])
        best_rank, best_payload = ranked[0]
        best_semantic_penalty = best_rank[1] if len(best_rank) > 1 else 0.0
        ingredient_root = normalize_text(ingredient.name).split()[0] if ingredient.name else ""
        if ingredient_root in FRESH_INGREDIENTS and best_semantic_penalty >= 20.0:
            return None
        return best_payload


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _dedupe_candidates(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    index_by_key: dict[tuple[str, float | None, str], int] = {}
    index_by_url: dict[str, int] = {}
    for item in items:
        name = str(item.get("name") or "").strip().lower()
        url = str(item.get("url") or "").strip().lower()
        price = _safe_float(item.get("price"))

        if url:
            existing_index = index_by_url.get(url)
            if existing_index is not None:
                existing = deduped[existing_index]
                if existing.get("calories") is None and item.get("calories") is not None:
                    existing["calories"] = item.get("calories")
                if not existing.get("image_url") and item.get("image_url"):
                    existing["image_url"] = item.get("image_url")
                continue

        key = (name, price, url)
        existing_index = index_by_key.get(key)
        if existing_index is not None:
            existing = deduped[existing_index]
            if existing.get("calories") is None and item.get("calories") is not None:
                existing["calories"] = item.get("calories")
            if not existing.get("image_url") and item.get("image_url"):
                existing["image_url"] = item.get("image_url")
            if not existing.get("source") and item.get("source"):
                existing["source"] = item.get("source")
            continue
        index_by_key[key] = len(deduped)
        if url:
            index_by_url[url] = len(deduped)
        deduped.append(item)
    return deduped


def _rank_candidate(
    ingredient: IngredientNeed,
    product_name: str,
    product_url: str,
    unit_price: float,
) -> tuple[tuple[float, ...], float, str | None]:
    normalized_ingredient = normalize_text(ingredient.name)
    normalized_product = normalize_text(product_name)
    ingredient_tokens = [token for token in normalized_ingredient.split() if token]
    product_tokens = set(normalized_product.split())
    missing_tokens = sum(1 for token in ingredient_tokens if token not in product_tokens)
    relevance_penalty = float(missing_tokens) * 3.0
    semantic_penalty = _semantic_penalty(
        normalized_ingredient=normalized_ingredient,
        normalized_product=normalized_product,
        product_url=product_url,
    )

    required_dimension = infer_dimension(ingredient.unit, ingredient.name)
    required_quantity = _safe_float(ingredient.quantity)
    if required_quantity is None or required_quantity <= 0 or required_dimension is None:
        ranking = (relevance_penalty, semantic_penalty, 2.0, unit_price, unit_price)
        return ranking, unit_price, None

    pack_quantity, pack_dimension = extract_pack_quantity(
        product_name=product_name,
        required_dimension=required_dimension,
    )
    if pack_quantity is None or pack_dimension is None:
        ranking = (relevance_penalty, semantic_penalty, 1.0, unit_price, unit_price)
        return ranking, unit_price, None

    if pack_dimension != required_dimension:
        ranking = (relevance_penalty, semantic_penalty, 3.0, unit_price, unit_price)
        return ranking, unit_price, None

    packs_needed = max(1, math.ceil(required_quantity / pack_quantity))
    total_cost = unit_price * packs_needed
    overshoot = packs_needed * pack_quantity - required_quantity
    ranking = (relevance_penalty, semantic_penalty, 0.0, total_cost, overshoot, unit_price)
    base_unit = base_unit_for_dimension(required_dimension) or ""
    note = (
        f"selecionado por quantidade: {packs_needed}x de "
        f"{pack_quantity:g} {base_unit} para {required_quantity:g} {base_unit}"
    )
    return ranking, total_cost, note


def _semantic_penalty(
    normalized_ingredient: str,
    normalized_product: str,
    product_url: str,
) -> float:
    if not normalized_ingredient:
        return 0.0

    penalty = 0.0
    ingredient_root = normalized_ingredient.split()[0]
    product_tokens = set(normalized_product.split())
    url_lower = (product_url or "").lower()

    if normalized_product.startswith(normalized_ingredient):
        penalty -= 2.0
    elif normalized_product.startswith(ingredient_root):
        penalty -= 1.0

    if f" com {normalized_ingredient}" in f" {normalized_product} ":
        penalty += 12.0
    if f" de {normalized_ingredient}" in f" {normalized_product} " and not normalized_product.startswith(
        normalized_ingredient
    ):
        penalty += 8.0
    if f" sabor {normalized_ingredient}" in f" {normalized_product} ":
        penalty += 12.0

    if ingredient_root in FRESH_INGREDIENTS:
        hit_processed = any(token in product_tokens for token in PROCESSED_TOKENS)
        if hit_processed:
            penalty += 10.0
        if any(fragment in url_lower for fragment in NONFRESH_URL_HINTS):
            penalty += 8.0
        if any(fragment in url_lower for fragment in FRESH_URL_HINTS):
            penalty -= 4.0

        # Ajustes específicos para reduzir falsos positivos comuns.
        if ingredient_root == "ovos":
            if "ovos" not in product_tokens and "ovo" not in product_tokens:
                penalty += 20.0
            if "bolachas" in product_tokens or "bolacha" in product_tokens:
                penalty += 20.0
        if ingredient_root == "cebola":
            if "sopa" in product_tokens:
                penalty += 20.0
        if ingredient_root == "alho":
            if "baguete" in product_tokens:
                penalty += 20.0
        if ingredient_root == "tomate":
            if {"triturado", "polpa", "concentrado", "molho"}.intersection(product_tokens):
                penalty += 16.0

    return penalty


def _classify_connection_error(host: str, exc: requests.ConnectionError) -> str:
    message = str(exc).lower()
    if "failed to resolve" in message or "name or service not known" in message:
        return f"Erro DNS: não foi possível resolver '{host}'."
    if "operation not permitted" in message:
        return "Erro de rede: conexão bloqueada pelo ambiente/sandbox."
    if "connection refused" in message:
        return f"Erro de conexão: ligação recusada por '{host}'."
    return f"Erro de conexão: {exc}"
