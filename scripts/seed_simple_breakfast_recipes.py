#!/usr/bin/env python3
"""
Seed de receitas simples de pequeno-almoço no backend Java.

Uso:
  python scripts/seed_simple_breakfast_recipes.py
  python scripts/seed_simple_breakfast_recipes.py --base-url http://localhost:7071
  python scripts/seed_simple_breakfast_recipes.py --token <JWT>

Comportamento:
  - Verifica duplicados por nome (via /api/recipes/search?q=...)
  - Cria só as receitas em falta (POST /api/recipes)
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any
from urllib import error, parse, request


DEFAULT_BASE_URL = "http://localhost:7071"


@dataclass(frozen=True)
class SimpleRecipe:
    name: str
    description: str
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    prep_min: int
    cook_min: int
    servings: int = 1
    tags: tuple[str, ...] = ("pequeno-almoco", "simples", "rapido")


def _recipe_payload(r: SimpleRecipe) -> dict[str, Any]:
    return {
        "name": r.name,
        "description": r.description,
        "mealType": "BREAKFAST",
        "prepTimeMin": r.prep_min,
        "cookTimeMin": r.cook_min,
        "servings": r.servings,
        "imageUrl": "",
        "tags": list(r.tags),
        "nutritionalInfo": {
            "calories": r.calories,
            "proteinG": r.protein_g,
            "carbsG": r.carbs_g,
            "fatG": r.fat_g,
        },
        # NOTE: criação via API de receita local exige ingredient_id existente.
        # Para seed rápido, criamos receitas sem recipe_ingredients associados.
        "ingredients": [],
        "steps": [
            {
                "stepOrder": 1,
                "description": "Preparar e servir.",
                "durationMinutes": max(1, r.prep_min + r.cook_min),
            }
        ],
    }


def _request_json(
    base_url: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
) -> Any:
    url = f"{base_url.rstrip('/')}{path}"
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    req = request.Request(url=url, data=data, method=method.upper(), headers=headers)

    try:
        with request.urlopen(req, timeout=12.0) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return None
            return json.loads(raw)
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} {method} {path}: {body or exc.reason}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Erro de ligação ao backend ({url}): {exc}") from exc


def _exists_by_name(base_url: str, name: str, token: str | None = None) -> bool:
    q = parse.quote_plus(name)
    result = _request_json(base_url, "GET", f"/api/recipes/search?q={q}", token=token)
    if not isinstance(result, list):
        return False

    target = name.strip().casefold()
    for item in result:
        if not isinstance(item, dict):
            continue
        candidate = str(item.get("name") or "").strip().casefold()
        if candidate == target:
            return True
    return False


def _build_seed_recipes() -> list[SimpleRecipe]:
    return [
        SimpleRecipe(
            name="Pão com queijo fresco",
            description="Pão integral com queijo fresco.",
            calories=290,
            protein_g=14,
            carbs_g=30,
            fat_g=10,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Maçã com iogurte natural",
            description="Maçã fatiada com iogurte natural.",
            calories=230,
            protein_g=9,
            carbs_g=34,
            fat_g=5,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Pão com manteiga de amendoim",
            description="Tosta simples com manteiga de amendoim.",
            calories=310,
            protein_g=11,
            carbs_g=27,
            fat_g=16,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Tosta de queijo e tomate",
            description="Tosta rápida de queijo com tomate.",
            calories=300,
            protein_g=13,
            carbs_g=29,
            fat_g=11,
            prep_min=5,
            cook_min=2,
        ),
        SimpleRecipe(
            name="Banana com aveia e canela",
            description="Pequeno-almoço rápido sem cozinhar.",
            calories=280,
            protein_g=7,
            carbs_g=52,
            fat_g=4,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Iogurte com aveia e mel",
            description="Iogurte natural com aveia e mel.",
            calories=300,
            protein_g=12,
            carbs_g=44,
            fat_g=7,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Ovos mexidos simples",
            description="Ovos mexidos rápidos para manhã corrida.",
            calories=260,
            protein_g=14,
            carbs_g=2,
            fat_g=21,
            prep_min=3,
            cook_min=4,
        ),
        SimpleRecipe(
            name="Pão com fiambre de peru",
            description="Sandes simples de fiambre de peru.",
            calories=320,
            protein_g=18,
            carbs_g=34,
            fat_g=9,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Queijo fresco com banana",
            description="Queijo fresco com banana às rodelas.",
            calories=260,
            protein_g=13,
            carbs_g=24,
            fat_g=9,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Papinhas de aveia rápidas",
            description="Aveia com água quente e canela.",
            calories=260,
            protein_g=9,
            carbs_g=43,
            fat_g=5,
            prep_min=3,
            cook_min=5,
        ),
        SimpleRecipe(
            name="Pão com requeijão",
            description="Fatia de pão integral com requeijão.",
            calories=270,
            protein_g=11,
            carbs_g=29,
            fat_g=11,
            prep_min=2,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Pêra com iogurte natural",
            description="Pêra cortada com iogurte natural.",
            calories=220,
            protein_g=8,
            carbs_g=33,
            fat_g=4,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Tosta de abacate simples",
            description="Pão torrado com abacate esmagado.",
            calories=320,
            protein_g=8,
            carbs_g=30,
            fat_g=18,
            prep_min=5,
            cook_min=1,
        ),
        SimpleRecipe(
            name="Iogurte com banana e aveia",
            description="Taça rápida de iogurte, banana e aveia.",
            calories=330,
            protein_g=13,
            carbs_g=48,
            fat_g=8,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Sandes de queijo e peru",
            description="Sandes simples de queijo e fiambre de peru.",
            calories=350,
            protein_g=21,
            carbs_g=32,
            fat_g=12,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Omelete de claras rápida",
            description="Omelete leve de claras com ervas.",
            calories=210,
            protein_g=20,
            carbs_g=3,
            fat_g=12,
            prep_min=3,
            cook_min=5,
        ),
        SimpleRecipe(
            name="Queijo fresco com mel",
            description="Queijo fresco com toque de mel.",
            calories=250,
            protein_g=13,
            carbs_g=18,
            fat_g=10,
            prep_min=2,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Pão com atum simples",
            description="Pão integral com atum ao natural.",
            calories=330,
            protein_g=24,
            carbs_g=29,
            fat_g=9,
            prep_min=4,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Muesli com leite",
            description="Muesli simples com leite meio-gordo.",
            calories=340,
            protein_g=12,
            carbs_g=52,
            fat_g=9,
            prep_min=2,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Panqueca de aveia simples",
            description="Panqueca rápida de aveia e ovo.",
            calories=360,
            protein_g=16,
            carbs_g=44,
            fat_g=12,
            prep_min=5,
            cook_min=6,
        ),
        SimpleRecipe(
            name="Pão com ovo mexido",
            description="Pão integral com ovo mexido.",
            calories=340,
            protein_g=17,
            carbs_g=31,
            fat_g=15,
            prep_min=4,
            cook_min=4,
        ),
        SimpleRecipe(
            name="Iogurte com maçã e canela",
            description="Iogurte natural com maçã e canela.",
            calories=240,
            protein_g=9,
            carbs_g=35,
            fat_g=5,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Tosta de queijo fresco",
            description="Tosta integral com queijo fresco.",
            calories=290,
            protein_g=14,
            carbs_g=30,
            fat_g=10,
            prep_min=3,
            cook_min=2,
        ),
        SimpleRecipe(
            name="Aveia overnight simples",
            description="Aveia demolhada com iogurte para manhãs rápidas.",
            calories=320,
            protein_g=13,
            carbs_g=46,
            fat_g=8,
            prep_min=5,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Pão com queijo e tomate",
            description="Sandes simples de queijo e tomate.",
            calories=310,
            protein_g=13,
            carbs_g=33,
            fat_g=11,
            prep_min=3,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Banana com manteiga de amendoim",
            description="Banana com colher de manteiga de amendoim.",
            calories=300,
            protein_g=8,
            carbs_g=30,
            fat_g=17,
            prep_min=2,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Iogurte com frutos vermelhos",
            description="Iogurte natural com frutos vermelhos.",
            calories=210,
            protein_g=10,
            carbs_g=24,
            fat_g=6,
            prep_min=2,
            cook_min=0,
        ),
        SimpleRecipe(
            name="Torrada com queijo e fiambre",
            description="Torrada clássica com queijo e fiambre.",
            calories=360,
            protein_g=20,
            carbs_g=35,
            fat_g=15,
            prep_min=4,
            cook_min=3,
        ),
        SimpleRecipe(
            name="Omelete de espinafres simples",
            description="Omelete rápida com espinafres.",
            calories=280,
            protein_g=18,
            carbs_g=4,
            fat_g=20,
            prep_min=4,
            cook_min=6,
        ),
        SimpleRecipe(
            name="Pão com ricotta",
            description="Fatia de pão com ricotta.",
            calories=280,
            protein_g=12,
            carbs_g=30,
            fat_g=11,
            prep_min=2,
            cook_min=0,
        ),
    ]


def seed_breakfast_recipes(base_url: str, token: str | None = None) -> int:
    recipes = _build_seed_recipes()
    created = 0

    for recipe in recipes:
        if _exists_by_name(base_url, recipe.name, token=token):
            print(f"[SKIP] Já existe: {recipe.name}")
            continue

        payload = _recipe_payload(recipe)
        created_item = _request_json(base_url, "POST", "/api/recipes", payload=payload, token=token)
        created_id = created_item.get("id") if isinstance(created_item, dict) else None
        print(f"[OK] Criada: {recipe.name} (id={created_id})")
        created += 1

    print(f"\nConcluído. Receitas criadas: {created}/{len(recipes)}")
    return created


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed de receitas simples de pequeno-almoço no backend.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL do backend Java (default: http://localhost:7071)")
    parser.add_argument("--token", default="", help="Bearer token opcional")
    args = parser.parse_args()

    try:
        seed_breakfast_recipes(args.base_url, token=args.token or None)
    except Exception as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
