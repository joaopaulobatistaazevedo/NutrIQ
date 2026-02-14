from __future__ import annotations

import html
import json
import re
from typing import Any, Iterator
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from .models import MarketConfig

PRICE_RE = re.compile(r"(?<!\d)(\d{1,4}(?:[.,]\d{1,2})?)(?!\d)")
CURRENCY_CONTEXT_RE = re.compile(r"(€|eur)", re.IGNORECASE)
CALORIES_RE = re.compile(
    r"(?<!\d)(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:\([^)]+\)\s*)?"
    r"(?:kcal|quilocalorias?|kilocalorias?|calorias?)\b",
    re.IGNORECASE,
)
CALORIES_LABEL_FIRST_RE = re.compile(
    r"(?:energia|energy)[^0-9]{0,40}\(\s*(?:kcal|quilocalorias?|kilocalorias?|calorias?)\s*\)"
    r"[^0-9]{0,24}(\d{1,4}(?:[.,]\d{1,2})?)",
    re.IGNORECASE,
)
CALORIES_TOKEN_VALUE_RE = re.compile(
    r"(?:kcal|quilocalorias?|kilocalorias?|calorias?)\s*[:\-]?\s*(\d{1,4}(?:[.,]\d{1,2})?)",
    re.IGNORECASE,
)
ENERGY_CONTEXT_RE = re.compile(r"\b(energia|energy|energetico|energ[eé]tico)\b", re.IGNORECASE)
CALORIE_REFERENCE_RE = re.compile(
    r"\b(dose\s+de\s+referencia|adulto\s+m[eé]dio|reference\s+intake|ri\b|vrd\b)\b",
    re.IGNORECASE,
)
ABSOLUTE_PRODUCT_URL_RE = re.compile(r"https?:\\/\\/[^\"'\\s>]+|https?://[^\"'\\s>]+")
RELATIVE_PRODUCT_URL_RE = re.compile(r"\\/[^\"'\\s>]+|/[^\"'\\s>]+")
PRODUCT_HTML_ID_RE = re.compile(r"/\d{4,}\.html?$")
CSS_URL_RE = re.compile(r"url\((['\"]?)(.*?)\1\)", re.IGNORECASE)


def parse_price_value(text: str) -> float | None:
    parsed = _parse_price_with_confidence(text)
    return parsed[0] if parsed is not None else None


def parse_calories_value(text: str) -> float | None:
    candidate = text.strip()
    if not candidate:
        return None

    best_value: float | None = None
    best_score = -1_000.0

    for match in CALORIES_LABEL_FIRST_RE.finditer(candidate):
        raw = match.group(1)
        value = _normalize_number_token(raw)
        if value is None or value <= 0:
            continue

        score = _score_calorie_candidate(candidate, value, match.start(), match.end()) + 4.0
        if score > best_score:
            best_score = score
            best_value = value

    for match in CALORIES_TOKEN_VALUE_RE.finditer(candidate):
        raw = match.group(1)
        value = _normalize_number_token(raw)
        if value is None or value <= 0:
            continue

        score = _score_calorie_candidate(candidate, value, match.start(), match.end()) + 1.5
        if score > best_score:
            best_score = score
            best_value = value

    for match in CALORIES_RE.finditer(candidate):
        raw = match.group(1)
        value = _normalize_number_token(raw)
        if value is None or value <= 0:
            continue

        score = _score_calorie_candidate(candidate, value, match.start(), match.end())

        if score > best_score:
            best_score = score
            best_value = value

    if best_value is None:
        return None
    if best_score < 0:
        return None
    return best_value


def _score_calorie_candidate(text: str, value: float, start: int, end: int) -> float:
    score = 0.0
    window_start = max(0, start - 80)
    window_end = min(len(text), end + 80)
    context = text[window_start:window_end]
    if ENERGY_CONTEXT_RE.search(context):
        score += 4.0
    if CALORIE_REFERENCE_RE.search(context):
        score -= 7.0

    if 10 <= value <= 1200:
        score += 2.0
    elif value > 1800:
        score -= 4.0
    return score


def extract_product_from_json_ld(
    soup: BeautifulSoup, base_url: str | None = None
) -> dict[str, Any] | None:
    items = extract_products_from_json_ld(soup=soup, base_url=base_url)
    return items[0] if items else None


def extract_products_from_json_ld(
    soup: BeautifulSoup,
    base_url: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen: set[tuple[str | None, float | None, str | None]] = set()

    for script in soup.find_all("script"):
        script_type = script.attrs.get("type", "")
        if "ld+json" not in script_type:
            continue

        script_text = script.string or script.get_text(" ", strip=True)
        if not script_text:
            continue

        try:
            parsed = json.loads(script_text)
        except json.JSONDecodeError:
            continue

        for product in _walk_products(parsed):
            name = _safe_str(product.get("name"))
            url = _safe_str(product.get("url"))
            offers = product.get("offers")
            price, currency, offer_url = _extract_offer_price(offers)
            calories = _extract_calories_from_product(product)
            image_url = _extract_image_from_node(
                product.get("image"),
                base_url=base_url,
            )
            if image_url is None:
                image_url = _extract_image_from_node(
                    product.get("thumbnailUrl"),
                    base_url=base_url,
                )
            if price is None:
                continue
            final_url = _normalize_product_url(offer_url or url, base_url=base_url)

            key = (name, price, final_url)
            if key in seen:
                continue
            seen.add(key)
            results.append(
                {
                    "name": name,
                    "price": price,
                    "calories": calories,
                    "currency": currency or "EUR",
                    "url": final_url,
                    "image_url": image_url,
                    "source": "json-ld",
                }
            )
            if len(results) >= limit:
                return results

    return results


def extract_product_from_selectors(
    soup: BeautifulSoup, config: MarketConfig
) -> dict[str, Any] | None:
    items = extract_products_from_selectors(soup=soup, config=config)
    return items[0] if items else None


def extract_products_from_selectors(
    soup: BeautifulSoup,
    config: MarketConfig,
    limit: int = 30,
) -> list[dict[str, Any]]:
    if not config.result_selector:
        return []

    results: list[dict[str, Any]] = []
    seen: set[tuple[str | None, float | None, str | None]] = set()
    elements = soup.select(config.result_selector)
    if not elements:
        return []

    for result in elements:
        if not isinstance(result, Tag):
            continue

        name = _extract_text(result, config.title_selector) or _safe_text(result)
        if not name:
            continue

        price_text = _extract_text(result, config.price_selector)
        used_fallback = False
        if not price_text:
            price_text = _find_price_text_fallback(result)
            used_fallback = True

        if used_fallback:
            parsed = _parse_price_with_confidence(price_text or "")
            if parsed is None or parsed[1] < 2.0:
                continue
            price = parsed[0]
        else:
            price = parse_price_value(price_text or "")
        if price is None:
            continue

        calories = parse_calories_value(_safe_text(result))
        image_url = _extract_image_from_selector_node(
            result,
            selector=config.image_selector,
            base_url=config.base_url,
        )

        url = _extract_href(result, config.link_selector)
        url = _normalize_product_url(url, base_url=config.base_url)

        key = (name, price, url)
        if key in seen:
            continue
        seen.add(key)
        results.append(
            {
                "name": name,
                "price": price,
                "calories": calories,
                "currency": config.currency,
                "url": url,
                "image_url": image_url,
                "source": "selectors",
            }
        )
        if len(results) >= limit:
            break

    return results


def extract_product_from_meta(
    soup: BeautifulSoup,
    fallback_currency: str = "EUR",
    base_url: str | None = None,
) -> dict[str, Any] | None:
    name = _extract_meta_content(soup, "meta[property='og:title']")
    if not name:
        title = soup.title.get_text(" ", strip=True) if soup.title else None
        if title:
            name = title

    price = None
    price_candidates = [
        "meta[property='product:price:amount']",
        "meta[itemprop='price']",
        "meta[property='og:price:amount']",
    ]
    for selector in price_candidates:
        raw = _extract_meta_content(soup, selector)
        if not raw:
            continue
        price = parse_price_value(raw)
        if price is not None:
            break

    if price is None:
        price = _find_price_from_price_nodes(soup)

    if price is None:
        return None

    calories = _extract_calories_from_meta(soup)

    currency = (
        _extract_meta_content(soup, "meta[property='product:price:currency']")
        or _extract_meta_content(soup, "meta[itemprop='priceCurrency']")
        or _extract_meta_content(soup, "meta[property='og:price:currency']")
        or fallback_currency
    )
    canonical_url = _extract_meta_content(soup, "link[rel='canonical']", attr_name="href")
    canonical_url = _normalize_product_url(canonical_url, base_url=base_url)
    image_url = _extract_image_from_meta(soup, base_url=base_url)

    return {
        "name": name,
        "price": price,
        "calories": calories,
        "currency": currency,
        "url": canonical_url,
        "image_url": image_url,
        "source": "meta",
    }


def extract_product_url_candidates(
    soup: BeautifulSoup,
    html_text: str,
    base_url: str | None,
    url_patterns: list[str] | None = None,
) -> list[str]:
    patterns = [item.lower() for item in (url_patterns or ["/produto/", "/product/", "/produtos/", "/p/"])]
    candidates: list[str] = []
    seen: set[str] = set()

    for anchor in soup.find_all("a", href=True):
        href = _safe_str(anchor.attrs.get("href"))
        if not href:
            continue
        final_href = _normalize_product_url(href, base_url=base_url)
        if not final_href:
            continue
        if not _is_product_url_candidate(final_href, patterns):
            continue
        if final_href not in seen:
            seen.add(final_href)
            candidates.append(final_href)

    escaped_patterns = [pattern.replace("/", "\\/") for pattern in patterns]
    for regex in (ABSOLUTE_PRODUCT_URL_RE, RELATIVE_PRODUCT_URL_RE):
        for match in regex.findall(html_text):
            candidate = _decode_js_escaped_url(match)
            final_href = _normalize_product_url(candidate, base_url=base_url)
            if not final_href:
                continue
            lower_candidate = final_href.lower()
            by_pattern = any(pattern in lower_candidate for pattern in patterns)
            by_escaped_pattern = any(pattern in lower_candidate for pattern in escaped_patterns)
            if not by_pattern and not by_escaped_pattern:
                if not _is_product_url_candidate(final_href, patterns):
                    continue
            if final_href not in seen:
                seen.add(final_href)
                candidates.append(final_href)

    return candidates


def _walk_products(node: Any) -> Iterator[dict[str, Any]]:
    if isinstance(node, list):
        for item in node:
            yield from _walk_products(item)
        return

    if not isinstance(node, dict):
        return

    node_type = node.get("@type")
    if _is_product_type(node_type):
        yield node

    for value in node.values():
        yield from _walk_products(value)


def _is_product_type(node_type: Any) -> bool:
    if isinstance(node_type, str):
        return node_type.lower() == "product"
    if isinstance(node_type, list):
        return any(isinstance(item, str) and item.lower() == "product" for item in node_type)
    return False


def _extract_offer_price(offers: Any) -> tuple[float | None, str | None, str | None]:
    offer_list = offers if isinstance(offers, list) else [offers]
    for offer in offer_list:
        if not isinstance(offer, dict):
            continue

        raw_price = offer.get("price", offer.get("lowPrice"))
        if raw_price is None:
            continue

        price = parse_price_value(str(raw_price))
        if price is None:
            continue

        currency = _safe_str(offer.get("priceCurrency"))
        offer_url = _safe_str(offer.get("url"))
        return price, currency, offer_url
    return None, None, None


def _extract_calories_from_product(product: dict[str, Any]) -> float | None:
    nutrition = product.get("nutrition")
    extracted = _extract_calories_from_node(nutrition)
    if extracted is not None:
        return extracted

    description = _safe_str(product.get("description"))
    if description:
        extracted = parse_calories_value(description)
        if extracted is not None:
            return extracted

    return None


def _extract_calories_from_node(node: Any) -> float | None:
    if node is None:
        return None
    if isinstance(node, str):
        return parse_calories_value(node)
    if isinstance(node, list):
        for item in node:
            found = _extract_calories_from_node(item)
            if found is not None:
                return found
        return None
    if not isinstance(node, dict):
        return None

    direct_candidates = [
        node.get("calories"),
        node.get("energy"),
        node.get("energyKcal"),
        node.get("value"),
    ]
    for candidate in direct_candidates:
        parsed = _extract_calories_from_node(candidate)
        if parsed is not None:
            return parsed

    for value in node.values():
        parsed = _extract_calories_from_node(value)
        if parsed is not None:
            return parsed
    return None


def _extract_text(node: Tag, selector: str | None) -> str | None:
    if not selector:
        return None
    found = node.select_one(selector)
    if not isinstance(found, Tag):
        return None
    text = _safe_text(found)
    return text or None


def _extract_href(node: Tag, selector: str | None) -> str | None:
    target = node.select_one(selector) if selector else node.find("a")
    if not isinstance(target, Tag):
        return None
    href = target.attrs.get("href")
    return _safe_str(href)


def _extract_image_from_selector_node(
    node: Tag,
    selector: str | None,
    base_url: str | None,
) -> str | None:
    candidates: list[Tag] = []
    if selector:
        selected = node.select_one(selector)
        if isinstance(selected, Tag):
            candidates.append(selected)
    candidates.append(node)

    visited: set[int] = set()
    for candidate in candidates:
        token = id(candidate)
        if token in visited:
            continue
        visited.add(token)

        direct_image = _extract_image_from_tag(candidate, base_url=base_url)
        if direct_image is not None:
            return direct_image

        if candidate.name != "img":
            nested = candidate.select_one("img")
            if isinstance(nested, Tag):
                nested_image = _extract_image_from_tag(nested, base_url=base_url)
                if nested_image is not None:
                    return nested_image
    return None


def _extract_image_from_tag(node: Tag, base_url: str | None) -> str | None:
    attrs = (
        "src",
        "data-src",
        "data-srcset",
        "srcset",
        "data-original",
        "data-lazy-src",
        "data-lazy",
        "data-image",
        "data-zoom-image",
    )
    for attr in attrs:
        raw = _safe_str(node.attrs.get(attr))
        if not raw:
            continue
        parsed = (
            _extract_image_from_srcset(raw, base_url=base_url)
            if "srcset" in attr
            else _normalize_media_url(raw, base_url=base_url)
        )
        if parsed is not None:
            return parsed

    style = _safe_str(node.attrs.get("style"))
    if style:
        match = CSS_URL_RE.search(style)
        if match:
            parsed = _normalize_media_url(match.group(2), base_url=base_url)
            if parsed is not None:
                return parsed

    return None


def _extract_image_from_srcset(raw: str, base_url: str | None) -> str | None:
    for chunk in raw.split(","):
        url_token = _safe_str(chunk.split(" ", 1)[0])
        parsed = _normalize_media_url(url_token, base_url=base_url)
        if parsed is not None:
            return parsed
    return None


def _extract_image_from_node(node: Any, base_url: str | None) -> str | None:
    if node is None:
        return None
    if isinstance(node, str):
        return _normalize_media_url(node, base_url=base_url)
    if isinstance(node, list):
        for item in node:
            parsed = _extract_image_from_node(item, base_url=base_url)
            if parsed is not None:
                return parsed
        return None
    if not isinstance(node, dict):
        return None

    preferred_keys = ("url", "contentUrl", "thumbnailUrl", "image", "src")
    for key in preferred_keys:
        parsed = _extract_image_from_node(node.get(key), base_url=base_url)
        if parsed is not None:
            return parsed

    for value in node.values():
        parsed = _extract_image_from_node(value, base_url=base_url)
        if parsed is not None:
            return parsed
    return None


def _extract_image_from_meta(soup: BeautifulSoup, base_url: str | None) -> str | None:
    selectors: list[tuple[str, str]] = [
        ("meta[property='og:image']", "content"),
        ("meta[property='og:image:url']", "content"),
        ("meta[name='twitter:image']", "content"),
        ("meta[itemprop='image']", "content"),
        ("link[rel='image_src']", "href"),
    ]
    for selector, attr_name in selectors:
        raw = _extract_meta_content(soup, selector, attr_name=attr_name)
        parsed = _normalize_media_url(raw, base_url=base_url)
        if parsed is not None:
            return parsed

    for selector in ("main img", "article img", ".product img", "img[itemprop='image']", "img"):
        for node in soup.select(selector):
            if not isinstance(node, Tag):
                continue
            parsed = _extract_image_from_tag(node, base_url=base_url)
            if parsed is not None:
                return parsed
    return None


def _normalize_media_url(raw_url: str | None, base_url: str | None) -> str | None:
    candidate = _safe_str(raw_url)
    if not candidate:
        return None

    candidate = _decode_js_escaped_url(html.unescape(candidate)).strip().strip("'\"")
    if not candidate:
        return None
    if candidate.startswith(("data:", "blob:")):
        return None
    if _looks_like_placeholder_url(candidate):
        return None

    if candidate.startswith("//"):
        candidate = f"https:{candidate}"

    final_url = urljoin(base_url, candidate) if base_url else candidate
    parsed = urlparse(final_url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return None
    if not parsed.scheme and not base_url:
        return None
    return final_url


def _safe_text(node: Tag) -> str:
    return node.get_text(" ", strip=True)


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _find_price_text_fallback(node: Tag) -> str | None:
    text = node.get_text(" ", strip=True)
    return text or None


def _extract_meta_content(
    soup: BeautifulSoup,
    selector: str,
    attr_name: str = "content",
) -> str | None:
    node = soup.select_one(selector)
    if not isinstance(node, Tag):
        return None
    return _safe_str(node.attrs.get(attr_name))


def _extract_calories_from_meta(soup: BeautifulSoup) -> float | None:
    selectors = [
        "meta[itemprop='calories']",
        "meta[property='product:nutrition:calories']",
        "meta[name='calories']",
        "meta[name='nutrition']",
        "meta[name='description']",
    ]
    for selector in selectors:
        raw = _extract_meta_content(soup, selector)
        if not raw:
            continue
        parsed = parse_calories_value(raw)
        if parsed is not None:
            return parsed

    table_value = _extract_calories_from_nutrition_tables(soup)
    if table_value is not None:
        return table_value

    return parse_calories_value(soup.get_text(" ", strip=True))


def _extract_calories_from_nutrition_tables(soup: BeautifulSoup) -> float | None:
    best_value: float | None = None
    best_score = -1_000.0

    for row in soup.select("tr"):
        if not isinstance(row, Tag):
            continue
        cells = [cell.get_text(" ", strip=True) for cell in row.select("th, td")]
        cells = [cell for cell in cells if cell]
        if len(cells) < 2:
            continue

        row_text = " ".join(cells)
        if not ENERGY_CONTEXT_RE.search(row_text):
            continue

        kcal_in_row = re.search(r"\b(kcal|quilocaloria|quilocalorias|kilocaloria|kilocalorias)\b", row_text, re.IGNORECASE)
        if not kcal_in_row:
            continue

        for cell_text in cells[1:]:
            parsed = _extract_first_number(cell_text)
            if parsed is None:
                continue

            score = 0.0
            if 10 <= parsed <= 1200:
                score += 3.0
            if CALORIE_REFERENCE_RE.search(row_text):
                score -= 4.0

            if score > best_score:
                best_score = score
                best_value = parsed

    return best_value


def _extract_first_number(text: str) -> float | None:
    match = re.search(r"(\d{1,4}(?:[.,]\d{1,2})?)", text)
    if not match:
        return None
    return _normalize_number_token(match.group(1))


def _find_price_from_price_nodes(soup: BeautifulSoup) -> float | None:
    selectors = [
        "[itemprop='price']",
        "[class*='price']",
        "[data-price]",
    ]
    best_value: float | None = None
    best_score: float = -1_000.0

    for selector in selectors:
        for node in soup.select(selector):
            if not isinstance(node, Tag):
                continue
            raw = _safe_str(node.attrs.get("content")) or _safe_str(node.attrs.get("data-price"))
            if not raw:
                raw = node.get_text(" ", strip=True)
            if not raw:
                continue
            parsed = _parse_price_with_confidence(raw)
            if parsed is None:
                continue
            value, score = parsed
            if value <= 0:
                continue

            has_structured = bool(node.attrs.get("content") or node.attrs.get("data-price"))
            if not has_structured and score < 2.0:
                continue

            # Prioriza campos estruturados e classes de preço explícitas.
            if has_structured:
                score += 3.0
            class_attr = " ".join(node.attrs.get("class", [])) if node.attrs.get("class") else ""
            if class_attr and ("sales" in class_attr.lower() or "price" in class_attr.lower()):
                score += 1.0

            if score > best_score:
                best_score = score
                best_value = value

    return best_value


def _decode_js_escaped_url(value: str) -> str:
    return value.replace("\\/", "/")


def _normalize_product_url(raw_url: str | None, base_url: str | None) -> str | None:
    candidate = _safe_str(raw_url)
    if not candidate:
        return None
    if _looks_like_placeholder_url(candidate):
        return None

    final_url = urljoin(base_url, candidate) if base_url else candidate
    parsed = urlparse(final_url)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return None
    if _looks_like_placeholder_url(parsed.path):
        return None
    return final_url


def _looks_like_placeholder_url(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return True
    if lowered in {"{}", "/{}", "javascript:void(0)", "javascript:;", "#"}:
        return True
    return "{" in lowered or "}" in lowered


def _is_product_url_candidate(url: str, patterns: list[str]) -> bool:
    lowered = url.lower()
    strict_patterns = [pattern for pattern in patterns if pattern != ".html"]
    if any(pattern in lowered for pattern in strict_patterns):
        return True

    parsed = urlparse(url)
    path = parsed.path.lower()
    if PRODUCT_HTML_ID_RE.search(path):
        return True

    if path.endswith(".html"):
        blocked_fragments = (
            "/pesquisa",
            "/search",
            "/ajuda",
            "/help",
            "/contato",
            "/contact",
            "/termos",
            "/politica",
            "/privacy",
            "/blog",
            "/faq",
            "/marca",
            "/brand",
            "/loja",
            "/stores",
            "/account",
            "/cart",
            "/checkout",
        )
        if any(fragment in path for fragment in blocked_fragments):
            return False
        return True

    return False


def _parse_price_with_confidence(text: str) -> tuple[float, float] | None:
    candidate = text.strip()
    if not candidate:
        return None

    best_value: float | None = None
    best_score: float = -1_000.0
    for match in PRICE_RE.finditer(candidate):
        raw_number = match.group(1)
        value = _normalize_number_token(raw_number)
        if value is None or value <= 0:
            continue

        score = 0.0
        window_start = max(0, match.start() - 8)
        window_end = min(len(candidate), match.end() + 8)
        context = candidate[window_start:window_end]
        if CURRENCY_CONTEXT_RE.search(context):
            score += 5.0

        has_decimal = bool(re.search(r"[.,]\d{1,2}$", raw_number))
        if has_decimal:
            score += 3.0
        else:
            score -= 1.5
            if value <= 5:
                score -= 2.0

        if 0.05 <= value <= 1000:
            score += 1.0

        if score > best_score:
            best_score = score
            best_value = value

    if best_value is None:
        return None
    return best_value, best_score


def _normalize_number_token(raw: str) -> float | None:
    numeric = re.sub(r"[^\d\.,]", "", raw)
    if not numeric:
        return None

    if "," in numeric and "." in numeric:
        if numeric.rfind(",") > numeric.rfind("."):
            numeric = numeric.replace(".", "").replace(",", ".")
        else:
            numeric = numeric.replace(",", "")
    elif "," in numeric:
        numeric = numeric.replace(",", ".")

    try:
        return float(numeric)
    except ValueError:
        return None
