from __future__ import annotations

import re


NUMBER_RE = r"(\d+(?:[.,]\d+)?)"
UNIT_RE = r"(kg|g|gr|grama|gramas|l|lt|ml|cl|un|unid|unidade|unidades|ovo|ovos|dente|dentes)"
MULTIPACK_RE = re.compile(
    rf"{NUMBER_RE}\s*[x×]\s*{NUMBER_RE}\s*{UNIT_RE}\b", re.IGNORECASE
)
SIMPLE_RE = re.compile(rf"{NUMBER_RE}\s*{UNIT_RE}\b", re.IGNORECASE)
EGG_RE = re.compile(rf"{NUMBER_RE}\s*ovos?\b", re.IGNORECASE)
PACK_COUNT_RE = re.compile(r"(?:pack|embalagem)\s*(?:de)?\s*(\d+)", re.IGNORECASE)


def infer_dimension(unit: str | None, ingredient_name: str | None = None) -> str | None:
    unit_token = (unit or "").strip().lower()
    if unit_token in {"kg", "g", "gr", "grama", "gramas"}:
        return "weight"
    if unit_token in {"l", "lt", "ml", "cl"}:
        return "volume"
    if unit_token in {"un", "unid", "unidade", "unidades", "dente", "dentes", "ovo", "ovos"}:
        return "count"

    name = (ingredient_name or "").lower()
    if "ovo" in name:
        return "count"
    return None


def base_unit_for_dimension(dimension: str | None) -> str | None:
    mapping = {"count": "un", "weight": "g", "volume": "ml"}
    return mapping.get(dimension or "")


def extract_pack_quantity(
    product_name: str,
    required_dimension: str | None = None,
) -> tuple[float | None, str | None]:
    text = product_name.lower()

    if required_dimension == "count":
        egg_match = EGG_RE.search(text)
        if egg_match:
            qty = _to_float(egg_match.group(1))
            if qty is not None:
                return qty, "count"

    for match in MULTIPACK_RE.finditer(text):
        left = _to_float(match.group(1))
        right = _to_float(match.group(2))
        unit_token = match.group(3)
        if left is None or right is None:
            continue
        converted = _convert_to_base(right, unit_token)
        if converted is None:
            continue
        qty, dim = converted
        total_qty = left * qty
        if required_dimension and dim != required_dimension:
            continue
        return total_qty, dim

    for match in SIMPLE_RE.finditer(text):
        amount = _to_float(match.group(1))
        unit_token = match.group(2)
        if amount is None:
            continue
        converted = _convert_to_base(amount, unit_token)
        if converted is None:
            continue
        qty, dim = converted
        if required_dimension and dim != required_dimension:
            continue
        return qty, dim

    if required_dimension == "count":
        pack_match = PACK_COUNT_RE.search(text)
        if pack_match:
            qty = _to_float(pack_match.group(1))
            if qty is not None:
                return qty, "count"

    return None, None


def _convert_to_base(amount: float, unit_token: str) -> tuple[float, str] | None:
    token = unit_token.lower()

    if token in {"kg"}:
        return amount * 1000.0, "weight"
    if token in {"g", "gr", "grama", "gramas"}:
        return amount, "weight"
    if token in {"l", "lt"}:
        return amount * 1000.0, "volume"
    if token in {"ml"}:
        return amount, "volume"
    if token in {"cl"}:
        return amount * 10.0, "volume"
    if token in {"un", "unid", "unidade", "unidades", "ovo", "ovos", "dente", "dentes"}:
        return amount, "count"
    return None


def _to_float(value: str) -> float | None:
    candidate = value.strip().replace(",", ".")
    try:
        return float(candidate)
    except ValueError:
        return None
