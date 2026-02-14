from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IngredientNeed:
    name: str
    normalized_name: str
    quantity: float | None = None
    unit: str | None = None


@dataclass
class MarketConfig:
    name: str
    search_url: str
    base_url: str | None = None
    result_selector: str | None = None
    title_selector: str | None = None
    price_selector: str | None = None
    link_selector: str | None = None
    currency: str = "EUR"
    headers: dict[str, str] = field(default_factory=dict)
    min_delay_seconds: float = 0.0
    max_delay_seconds: float = 0.0
    product_url_patterns: list[str] = field(
        default_factory=lambda: ["/produto/", "/product/", "/produtos/", "/p/"]
    )

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "MarketConfig":
        name = str(payload.get("name", "")).strip()
        search_url = str(payload.get("search_url", "")).strip()
        if not name:
            raise ValueError("Campo 'name' ausente em supermercado.")
        if not search_url:
            raise ValueError(f"Campo 'search_url' ausente em supermercado '{name}'.")

        headers = payload.get("headers") or {}
        if not isinstance(headers, dict):
            raise ValueError(f"'headers' deve ser objeto em supermercado '{name}'.")

        return cls(
            name=name,
            search_url=search_url,
            base_url=payload.get("base_url"),
            result_selector=payload.get("result_selector"),
            title_selector=payload.get("title_selector"),
            price_selector=payload.get("price_selector"),
            link_selector=payload.get("link_selector"),
            currency=str(payload.get("currency", "EUR")),
            headers={str(k): str(v) for k, v in headers.items()},
            min_delay_seconds=float(payload.get("min_delay_seconds", 0.0)),
            max_delay_seconds=float(payload.get("max_delay_seconds", 0.0)),
            product_url_patterns=[
                str(item).strip()
                for item in (
                    payload.get("product_url_patterns")
                    or ["/produto/", "/product/", "/produtos/", "/p/"]
                )
                if str(item).strip()
            ],
        )


@dataclass
class PriceMatch:
    supermarket: str
    ingredient: IngredientNeed
    found: bool
    product_name: str | None = None
    price: float | None = None
    calories: float | None = None
    currency: str = "EUR"
    product_url: str | None = None
    source: str | None = None
    note: str | None = None
