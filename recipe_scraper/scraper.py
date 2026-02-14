from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup, Tag

from .models import RecipeRecord
from .sources import SourceConfig

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    ),
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

ISO_8601_TIME_RE = re.compile(r"^P(?:\d+D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$", re.IGNORECASE)
NUMERIC_TIME_RE = re.compile(r"(\d+)\s*(h|hora|horas|m|min|mins|minuto|minutos)?", re.IGNORECASE)


class RecipeScraper:
    def __init__(self, timeout_seconds: float = 15.0, debug: bool = False) -> None:
        self.timeout_seconds = timeout_seconds
        self.debug = debug
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    def scrape_sources(
        self,
        sources: list[SourceConfig],
        max_recipes_per_source: int = 60,
        max_pages_per_list_url: int = 2,
    ) -> dict[str, list[RecipeRecord]]:
        results: dict[str, list[RecipeRecord]] = {}
        for source in sources:
            results[source.name] = self._scrape_source(
                source=source,
                max_recipes=max_recipes_per_source,
                max_pages=max_pages_per_list_url,
            )
        return results

    def _scrape_source(
        self,
        source: SourceConfig,
        max_recipes: int,
        max_pages: int,
    ) -> list[RecipeRecord]:
        recipe_links: list[str] = []
        seen_links: set[str] = set()

        for list_url in source.list_urls:
            for page in range(1, max_pages + 1):
                page_url = _build_paged_url(list_url, page)
                html = self._fetch_html(page_url)
                if html is None:
                    self._debug(f"[{source.name}] list page sem HTML: {page_url}")
                    continue
                links = _extract_recipe_links(list_page_url=page_url, html=html)
                self._debug(f"[{source.name}] links na lista {page_url}: {len(links)}")
                if not links:
                    continue
                for link in links:
                    if link in seen_links:
                        continue
                    seen_links.add(link)
                    recipe_links.append(link)
                if len(recipe_links) >= max_recipes:
                    break
            if len(recipe_links) >= max_recipes:
                break

        if len(recipe_links) < max_recipes:
            missing = max_recipes - len(recipe_links)
            sitemap_links = self._discover_links_from_sitemaps(
                source=source,
                limit=missing,
                seen_links=seen_links,
            )
            recipe_links.extend(sitemap_links)
            self._debug(f"[{source.name}] links via sitemap: {len(sitemap_links)}")

        recipes: list[RecipeRecord] = []
        seen_recipe_urls: set[str] = set()
        for link in recipe_links[:max_recipes]:
            recipe = self._scrape_recipe_detail(url=link, source=source)
            if recipe is None:
                continue
            if recipe.url in seen_recipe_urls:
                continue
            seen_recipe_urls.add(recipe.url)
            recipes.append(recipe)

        return recipes

    def _fetch_html(self, url: str) -> str | None:
        try:
            response = self.session.get(url, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            self._debug(f"[HTTP] erro em {url}: {exc}")
            return None

    def _scrape_recipe_detail(self, url: str, source: SourceConfig) -> RecipeRecord | None:
        html = self._fetch_html(url)
        if html is None:
            return None

        soup = BeautifulSoup(html, "html.parser")
        from_json_ld = _extract_recipe_from_json_ld(soup=soup, url=url, source=source)
        if from_json_ld is not None:
            return from_json_ld

        from_selectors = _extract_recipe_from_selectors(soup=soup, url=url, source=source)
        if from_selectors is None:
            self._debug(f"[{source.name}] sem parse de receita: {url}")
        return from_selectors

    def _discover_links_from_sitemaps(
        self,
        source: SourceConfig,
        limit: int,
        seen_links: set[str],
    ) -> list[str]:
        if limit <= 0:
            return []

        root_url = source.list_urls[0] if source.list_urls else ""
        base_domain = urlparse(root_url).netloc

        sitemap_urls = source.sitemap_urls[:]
        if root_url:
            parsed = urlparse(root_url)
            fallback = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
            if fallback not in sitemap_urls:
                sitemap_urls.append(fallback)

        found: list[str] = []
        visited_sitemaps: set[str] = set()
        for sitemap_url in sitemap_urls:
            urls = self._walk_sitemap(sitemap_url=sitemap_url, visited=visited_sitemaps, depth=0)
            self._debug(f"[{source.name}] urls lidas de sitemap {sitemap_url}: {len(urls)}")
            for url in urls:
                if not _is_recipe_url(url, base_domain):
                    continue
                if url in seen_links:
                    continue
                seen_links.add(url)
                found.append(url)
                if len(found) >= limit:
                    return found
        return found

    def _walk_sitemap(
        self,
        sitemap_url: str,
        visited: set[str],
        depth: int,
        max_depth: int = 3,
    ) -> list[str]:
        if depth > max_depth:
            return []
        if sitemap_url in visited:
            return []
        visited.add(sitemap_url)

        xml_text = self._fetch_html(sitemap_url)
        if not xml_text:
            return []

        kind, urls = _parse_sitemap_xml(xml_text)
        if kind == "urlset":
            return urls
        if kind == "sitemapindex":
            collected: list[str] = []
            for child in urls[:80]:
                collected.extend(
                    self._walk_sitemap(
                        sitemap_url=child,
                        visited=visited,
                        depth=depth + 1,
                        max_depth=max_depth,
                    )
                )
                if len(collected) >= 3000:
                    break
            return collected
        return []

    def _debug(self, message: str) -> None:
        if self.debug:
            print(message)


def _extract_recipe_links(list_page_url: str, html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    parsed_base = urlparse(list_page_url)
    base_domain = parsed_base.netloc

    links: list[str] = []
    seen: set[str] = set()

    for link in _extract_links_from_json_ld(soup):
        if not _is_recipe_url(link, base_domain):
            continue
        if link in seen:
            continue
        seen.add(link)
        links.append(link)

    for anchor in soup.find_all("a", href=True):
        href_raw = str(anchor.attrs.get("href", "")).strip()
        if not href_raw:
            continue
        href = urljoin(list_page_url, href_raw)
        if not _is_recipe_url(href, base_domain):
            continue
        if href in seen:
            continue
        seen.add(href)
        links.append(href)

    return links


def _extract_links_from_json_ld(soup: BeautifulSoup) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    for script in soup.find_all("script", type=lambda x: isinstance(x, str) and "ld+json" in x):
        payload = script.string or script.get_text(" ", strip=True)
        if not payload:
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue

        for node in _walk_json(parsed):
            if not isinstance(node, dict):
                continue
            node_type = _lower_type(node.get("@type"))
            if node_type in {"listitem", "recipe"}:
                url = _safe_text(node.get("url"))
                if url and url not in seen:
                    seen.add(url)
                    urls.append(url)
            item = node.get("item")
            if isinstance(item, dict):
                item_url = _safe_text(item.get("url"))
                if item_url and item_url not in seen:
                    seen.add(item_url)
                    urls.append(item_url)

    return urls


def _extract_recipe_from_json_ld(
    soup: BeautifulSoup, url: str, source: SourceConfig
) -> RecipeRecord | None:
    for script in soup.find_all("script", type=lambda x: isinstance(x, str) and "ld+json" in x):
        payload = script.string or script.get_text(" ", strip=True)
        if not payload:
            continue
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue

        for node in _walk_json(parsed):
            if not isinstance(node, dict):
                continue
            if _lower_type(node.get("@type")) != "recipe":
                continue

            title = _safe_text(node.get("name")) or _extract_text_by_selectors(
                soup, ["h1", ".entry-title", ".recipe-title"]
            )
            ingredients = _extract_recipe_ingredients_from_ld(node)
            steps = _extract_recipe_steps_from_ld(node)
            prep = _parse_duration(node.get("prepTime"))
            cook = _parse_duration(node.get("cookTime"))
            total = _parse_duration(node.get("totalTime"))
            servings = _safe_text(node.get("recipeYield"))
            image_url = _extract_image_url_from_ld(node)
            if image_url:
                image_url = urljoin(url, image_url)
            if not image_url:
                image_url = _extract_image_url_from_page(soup, url)
            tags = _extract_tags_from_ld(node, source.default_tags)

            if not title or not ingredients:
                continue

            return RecipeRecord(
                source=source.name,
                source_tag=source.default_tags[0] if source.default_tags else source.name.lower(),
                url=url,
                title=title,
                ingredients=ingredients,
                steps=steps,
                prep_time_minutes=prep,
                cook_time_minutes=cook,
                total_time_minutes=total,
                servings=servings,
                image_url=image_url,
                tags=tags,
            )

    return None


def _extract_recipe_from_selectors(
    soup: BeautifulSoup, url: str, source: SourceConfig
) -> RecipeRecord | None:
    title = _extract_text_by_selectors(
        soup,
        [
            "h1",
            ".entry-title",
            ".recipe-title",
            ".post-title",
            ".title-recipe",
            ".elementor-heading-title",
            ".wprm-recipe-name",
        ],
    )
    ingredients = _extract_list_items_by_selectors(
        soup,
        [
            "[itemprop='recipeIngredient']",
            ".wprm-recipe-ingredient",
            ".wprm-recipe-ingredient-name",
            ".ingredients li",
            ".ingredient li",
            ".recipe-ingredients li",
            ".ingredientes li",
            ".lista-ingredientes li",
        ],
    )
    steps = _extract_list_items_by_selectors(
        soup,
        [
            "[itemprop='recipeInstructions'] li",
            "[itemprop='recipeInstructions'] p",
            ".wprm-recipe-instruction",
            ".wprm-recipe-instruction-text",
            ".instructions li",
            ".recipe-steps li",
            ".preparation-steps li",
            ".modo-preparo li",
            ".preparacao li",
            ".entry-content ol li",
        ],
    )
    prep_text = _extract_text_by_selectors(soup, [".prep-time", ".tempo-preparacao", "[itemprop='prepTime']"])
    cook_text = _extract_text_by_selectors(soup, [".cook-time", ".tempo-cozedura", "[itemprop='cookTime']"])
    total_text = _extract_text_by_selectors(soup, [".total-time", ".tempo-total", "[itemprop='totalTime']"])
    servings = _extract_text_by_selectors(soup, [".servings", ".doses", "[itemprop='recipeYield']"])
    image_url = _extract_image_url_from_page(soup, url)

    if not title or not ingredients:
        return None

    tags = source.default_tags[:]
    tags.extend(_extract_meta_keywords(soup))

    return RecipeRecord(
        source=source.name,
        source_tag=source.default_tags[0] if source.default_tags else source.name.lower(),
        url=url,
        title=title,
        ingredients=ingredients,
        steps=steps,
        prep_time_minutes=_parse_duration(prep_text),
        cook_time_minutes=_parse_duration(cook_text),
        total_time_minutes=_parse_duration(total_text),
        servings=servings,
        image_url=image_url,
        tags=_dedupe(tags),
    )


def flatten_scrape_result(scrape_result: dict[str, list[RecipeRecord]]) -> list[RecipeRecord]:
    flat: list[RecipeRecord] = []
    for records in scrape_result.values():
        flat.extend(records)
    return flat


def export_recipes_to_json(recipes: list[RecipeRecord], output_path: str) -> None:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(recipes),
        "recipes": [asdict(recipe) for recipe in recipes],
    }
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)


def load_recipes_from_json(path: str) -> list[RecipeRecord]:
    with open(path, encoding="utf-8") as fh:
        payload = json.load(fh)
    rows = payload.get("recipes", [])
    records: list[RecipeRecord] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        records.append(
            RecipeRecord(
                source=str(row.get("source", "")),
                source_tag=str(row.get("source_tag", "")),
                url=str(row.get("url", "")),
                title=str(row.get("title", "")),
                ingredients=[str(item) for item in (row.get("ingredients") or [])],
                steps=[str(item) for item in (row.get("steps") or [])],
                prep_time_minutes=_to_int_or_none(row.get("prep_time_minutes")),
                cook_time_minutes=_to_int_or_none(row.get("cook_time_minutes")),
                total_time_minutes=_to_int_or_none(row.get("total_time_minutes")),
                servings=_safe_text(row.get("servings")),
                image_url=_safe_text(row.get("image_url")),
                tags=[str(item) for item in (row.get("tags") or [])],
            )
        )
    return records


def _to_int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_recipe_ingredients_from_ld(node: dict[str, Any]) -> list[str]:
    raw = node.get("recipeIngredient")
    if isinstance(raw, list):
        return _dedupe([str(item).strip() for item in raw if str(item).strip()])
    if isinstance(raw, str):
        return [raw.strip()] if raw.strip() else []
    return []


def _extract_recipe_steps_from_ld(node: dict[str, Any]) -> list[str]:
    raw = node.get("recipeInstructions")
    steps: list[str] = []

    if isinstance(raw, str) and raw.strip():
        steps.append(raw.strip())
        return steps

    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    steps.append(text)
                continue
            if isinstance(item, dict):
                text = _safe_text(item.get("text")) or _safe_text(item.get("name"))
                if text:
                    steps.append(text)
                nested = item.get("itemListElement")
                if isinstance(nested, list):
                    for nested_item in nested:
                        if isinstance(nested_item, dict):
                            nested_text = _safe_text(nested_item.get("text")) or _safe_text(
                                nested_item.get("name")
                            )
                            if nested_text:
                                steps.append(nested_text)
    return _dedupe(steps)


def _extract_tags_from_ld(node: dict[str, Any], base_tags: list[str]) -> list[str]:
    tags = base_tags[:]
    for key in ("keywords", "recipeCategory", "recipeCuisine"):
        value = node.get(key)
        if isinstance(value, str):
            tags.extend([token.strip() for token in value.split(",") if token.strip()])
        elif isinstance(value, list):
            tags.extend([str(token).strip() for token in value if str(token).strip()])
    return _dedupe(tags)


def _extract_image_url_from_ld(node: dict[str, Any]) -> str | None:
    return _coerce_image_url(node.get("image"))


def _coerce_image_url(raw: Any) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        return _safe_text(raw)
    if isinstance(raw, list):
        for item in raw:
            candidate = _coerce_image_url(item)
            if candidate:
                return candidate
        return None
    if isinstance(raw, dict):
        for key in ("url", "contentUrl", "thumbnailUrl"):
            candidate = _safe_text(raw.get(key))
            if candidate:
                return candidate
    return None


def _extract_text_by_selectors(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if not isinstance(node, Tag):
            continue
        text = node.get_text(" ", strip=True)
        if text:
            return text
    return None


def _extract_list_items_by_selectors(soup: BeautifulSoup, selectors: list[str]) -> list[str]:
    items: list[str] = []
    for selector in selectors:
        nodes = soup.select(selector)
        if not nodes:
            continue
        for node in nodes:
            if not isinstance(node, Tag):
                continue
            text = node.get_text(" ", strip=True)
            if text:
                items.append(text)
        if items:
            return _dedupe(items)
    return []


def _extract_meta_keywords(soup: BeautifulSoup) -> list[str]:
    node = soup.select_one("meta[name='keywords']")
    if not isinstance(node, Tag):
        return []
    raw = _safe_text(node.attrs.get("content"))
    if not raw:
        return []
    return _dedupe([item.strip() for item in raw.split(",") if item.strip()])


def _extract_image_url_from_page(soup: BeautifulSoup, page_url: str) -> str | None:
    for selector in (
        "meta[property='og:image']",
        "meta[name='og:image']",
        "meta[name='twitter:image']",
        "meta[property='twitter:image']",
    ):
        node = soup.select_one(selector)
        if isinstance(node, Tag):
            content = _safe_text(node.attrs.get("content"))
            if content:
                return urljoin(page_url, content)

    for selector in (
        ".wprm-recipe-image img",
        ".recipe-image img",
        ".entry-content img",
        "article img",
        "img",
    ):
        node = soup.select_one(selector)
        if not isinstance(node, Tag):
            continue
        for attr in ("src", "data-src", "data-lazy-src"):
            raw_url = _safe_text(node.attrs.get(attr))
            if raw_url and not raw_url.startswith("data:"):
                return urljoin(page_url, raw_url)

    return None



def _parse_duration(value: Any) -> int | None:
    text = _safe_text(value)
    if not text:
        return None

    iso_match = ISO_8601_TIME_RE.match(text)
    if iso_match:
        hours = int(iso_match.group(1)) if iso_match.group(1) else 0
        mins = int(iso_match.group(2)) if iso_match.group(2) else 0
        total = hours * 60 + mins
        return total if total > 0 else None

    numbers = NUMERIC_TIME_RE.findall(text)
    if not numbers:
        return None

    total_minutes = 0
    for number, unit in numbers:
        value_num = int(number)
        unit_lower = unit.lower() if unit else ""
        if unit_lower in {"h", "hora", "horas"}:
            total_minutes += value_num * 60
        else:
            total_minutes += value_num
    return total_minutes if total_minutes > 0 else None


def _dedupe(items: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped


def _is_recipe_url(url: str, base_domain: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if base_domain and parsed.netloc:
        target_domain = _canonical_domain(parsed.netloc)
        base = _canonical_domain(base_domain)
        if target_domain != base:
            if not target_domain.endswith(f".{base}") and not base.endswith(f".{target_domain}"):
                return False

    path = parsed.path.lower()
    if not path or path == "/":
        return False

    exact_non_recipe_paths = {
        "/receitas/",
        "/receitas",
        "/todas-as-receitas/",
        "/todas-as-receitas",
        "/busca",
        "/search",
    }
    if path in exact_non_recipe_paths:
        return False

    blocked = [
        "/tag/",
        "/categoria/",
        "/categorias/",
        "/receitas/",
        "/busca",
        "/search",
        "/autor/",
        "/author/",
        "/sobre",
        "/about",
        "/contact",
        "/contato",
        "/politica",
        "/termos",
    ]
    if any(fragment in path for fragment in blocked):
        if "/receita/" not in path and "/receitas/" not in path and re.search(r"/\d+\.html$", path) is None:
            return False

    if "/receitas/" in path:
        segments = [segment for segment in path.split("/") if segment]
        if len(segments) < 2:
            return False

    hints = ["/receita/", "/recipe/", "/receitas/", ".html"]
    if any(hint in path for hint in hints):
        return True

    return bool(re.search(r"/\d+/?$", path))


def _build_paged_url(base_url: str, page: int) -> str:
    if page <= 1:
        return base_url

    parsed = urlparse(base_url)
    host = parsed.netloc.lower()

    if "teleculinaria.pt" in host:
        root = base_url if base_url.endswith("/") else f"{base_url}/"
        if "/todas-as-receitas/" in root:
            return urljoin(root, f"page/{page}/")
        return root

    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["page"] = str(page)
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(query),
            parsed.fragment,
        )
    )


def _walk_json(node: Any) -> list[Any]:
    output: list[Any] = []
    if isinstance(node, list):
        for item in node:
            output.extend(_walk_json(item))
        return output
    if isinstance(node, dict):
        output.append(node)
        for value in node.values():
            output.extend(_walk_json(value))
    return output


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _lower_type(node_type: Any) -> str:
    if isinstance(node_type, str):
        return node_type.lower()
    if isinstance(node_type, list):
        for item in node_type:
            if isinstance(item, str):
                lowered = item.lower()
                if lowered:
                    return lowered
    return ""


def _parse_sitemap_xml(xml_text: str) -> tuple[str, list[str]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return "invalid", []

    root_tag = _strip_xml_ns(root.tag).lower()
    if root_tag == "urlset":
        urls: list[str] = []
        for url_node in root:
            if _strip_xml_ns(url_node.tag).lower() != "url":
                continue
            loc = _get_xml_child_text(url_node, "loc")
            if loc:
                urls.append(loc)
        return "urlset", urls

    if root_tag == "sitemapindex":
        sitemaps: list[str] = []
        for sitemap_node in root:
            if _strip_xml_ns(sitemap_node.tag).lower() != "sitemap":
                continue
            loc = _get_xml_child_text(sitemap_node, "loc")
            if loc:
                sitemaps.append(loc)
        return "sitemapindex", sitemaps

    return "invalid", []


def _strip_xml_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _get_xml_child_text(node: ET.Element, child_name: str) -> str | None:
    for child in node:
        if _strip_xml_ns(child.tag).lower() == child_name.lower():
            text = (child.text or "").strip()
            return text or None
    return None


def _canonical_domain(netloc: str) -> str:
    domain = netloc.lower().strip()
    if ":" in domain:
        domain = domain.split(":", 1)[0]
    if domain.startswith("www."):
        domain = domain[4:]
    return domain
