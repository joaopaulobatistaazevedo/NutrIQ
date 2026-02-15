"""
openai_service.py  (updated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key changes vs original:
  • GoalMealPlannerService replaces RecipePlannerService
  • Goal is extracted from the conversation and passed to the planner
  • Supermarket prices are scraped BEFORE the GA runs (with user feedback)
  • Portuguese strings cleaned up (no more garbled encoding)
  • Bug fixes: history propagation, async IO, onboarding consistency,
    auth_token forwarding, keyword false-positives
"""
import asyncio
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from pathlib import Path

from openai import OpenAI

from config.settings import get_settings
from models.schemas import ChatResponse, Message
from services.goal_meal_planner import GoalMealPlannerService
from services.user_memory_store import UserMemoryStore
from utils.helpers import load_prompt, safe_json_loads


class OpenAIService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None
        self.goal_planner = GoalMealPlannerService()
        self._memory_store = UserMemoryStore(
            file_path=Path(__file__).resolve().parents[1] / "data" / "user_memory.json",
        )

    # ──────────────────────────────────────────────────────────────────────
    # Onboarding
    # ──────────────────────────────────────────────────────────────────────

    async def onboarding_chat(
        self,
        user_message: str,
        history: List[Message],
        user_id: str = "anonymous",
        user_context: Optional[Dict[str, Any]] = None,
    ) -> ChatResponse:
        system_prompt = load_prompt("prompts/onboarding.txt")

        memory = self._ensure_user_memory(user_id)
        if user_context:
            memory.update({
                "goal": user_context.get("goal") or memory.get("goal"),
                "favorite_foods": user_context.get("favorite_foods") or memory.get("favorite_foods") or [],
                "disliked_ingredients": user_context.get("disliked_ingredients") or memory.get("disliked_ingredients") or [],
            })

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        # e só marcar onboarding_complete se a extração confirmar todos os campos.
        # Ambas as chamadas LLM são feitas em paralelo para reduzir latência.
        bot_response_coro = asyncio.to_thread(self._chat, messages)
        extracted_coro = self._extract_preferences(messages)

        bot_response, extracted_preferences = await asyncio.gather(
            bot_response_coro, extracted_coro
        )

        onboarding_complete = self._is_onboarding_complete(extracted_preferences)

        # Só sobrescreve a resposta natural se a extração confirmar conclusão,
        # evitando o estado inconsistente onde o bot dizia "Perfeito!" mas
        # extracted_preferences era {} por falha de parse.
        if onboarding_complete:
            bot_response = (
                "Perfeito! Já tenho o necessário para preparar o teu plano semanal de refeições 🎯"
            )
            self._update_memory_from_preferences(user_id, extracted_preferences)

        return ChatResponse(
            response=bot_response,
            onboarding_complete=onboarding_complete,
            extracted_preferences=extracted_preferences if onboarding_complete else None,
        )

    # ──────────────────────────────────────────────────────────────────────
    # Assistant
    # ──────────────────────────────────────────────────────────────────────

    async def assistant_chat(
        self,
        user_message: str,
        user_context: Optional[Dict[str, Any]],
        history: Optional[List[Message]] = None,
        auth_token: Optional[str] = None,
        user_id: str = "anonymous",
    ) -> ChatResponse:
        """Gere a conversa principal, ajustes de plano e compensação calórica."""
        memory = self._ensure_user_memory(user_id)
        merged_context = dict(user_context or {})
        if memory:
            merged_context.setdefault("favorite_foods", memory.get("favorite_foods") or [])
            merged_context.setdefault("disliked_ingredients", memory.get("disliked_ingredients") or [])
            if memory.get("goal") and not merged_context.get("goal"):
                merged_context["goal"] = memory["goal"]
            if memory.get("max_weekly_budget") is not None and merged_context.get("max_weekly_budget") in (None, ""):
                merged_context["max_weekly_budget"] = memory.get("max_weekly_budget")
            if memory.get("planning_days") is not None and merged_context.get("planning_days") in (None, ""):
                merged_context["planning_days"] = memory.get("planning_days")

        recent_recipe_ids = set(self._to_recipe_ids(memory.get("recent_recipe_ids") or []))
        recent_recipe_ids.update(self._extract_recipe_ids_from_context(merged_context))
        if recent_recipe_ids:
            merged_context["recent_recipe_ids"] = sorted(recent_recipe_ids)

        coach_metrics = self._build_coaching_metrics(merged_context)
        if coach_metrics:
            merged_context["coach_metrics"] = coach_metrics

        pending_edit_request = bool(merged_context.get("pending_edit_request"))

        temporal_hints = self._extract_temporal_plan_hints(user_message)
        if temporal_hints:
            merged_context.update(temporal_hints)

        preference_hints = self._extract_inline_preference_hints(user_message)
        if preference_hints:
            if preference_hints.get("favorite_foods"):
                merged_context["favorite_foods"] = self._merge_unique_text(
                    merged_context.get("favorite_foods") or [],
                    preference_hints.get("favorite_foods") or [],
                )
            if preference_hints.get("disliked_ingredients"):
                merged_context["disliked_ingredients"] = self._merge_unique_text(
                    merged_context.get("disliked_ingredients") or [],
                    preference_hints.get("disliked_ingredients") or [],
                )
            hinted_days = preference_hints.get("planning_days")
            if hinted_days not in (None, ""):
                merged_context["planning_days"] = hinted_days

        # Detect whether this is an explicit plan request OR a life event that
        # should silently trigger a recalculation in the background.
        is_explicit_plan_request = self._looks_like_meal_plan_request(user_message) or pending_edit_request
        is_life_event = self._is_life_event(user_message) and not is_explicit_plan_request
        planning_request = is_explicit_plan_request or is_life_event

        import json as _json
        system_prompt = load_prompt("prompts/assistant.txt")
        if merged_context:
            system_prompt += f"\n\nContexto do utilizador:\n{_json.dumps(merged_context, ensure_ascii=False, default=str)}"

        # For life events, hint to the LLM that a plan recalculation is happening
        # so it responds naturally and in past tense ("já ajustei") not future.
        if is_life_event:
            system_prompt += (
                "\n\n[SISTEMA] O utilizador acabou de reportar um evento alimentar. "
                "O plano foi recalculado automaticamente em segundo plano. "
                "Responde em 1–2 frases: reconhece o evento de forma calorosa e informa "
                "que o plano já foi ajustado. NÃO listes passos. NÃO peças confirmação."
            )

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        # LLM response and constraint extraction run in parallel when a plan is needed
        meal_plan_draft = None
        meal_plan = None

        if planning_request:
            bot_response_coro = asyncio.to_thread(self._chat, messages)
            constraints_coro = self._extract_meal_plan_constraints(messages)
            bot_response, constraints = await asyncio.gather(bot_response_coro, constraints_coro)

            meal_plan_draft = self._build_meal_plan_draft(constraints, user_context, merged_context, memory)
            missing = meal_plan_draft.get("missing_required", [])

            if missing:
                bot_response = (
                    "Para fechar o teu planeamento, ainda preciso de: "
                    + ", ".join(missing) + "."
                )
            else:
                # Always fetch fresh supermarket prices before every plan generation
                await asyncio.to_thread(self.goal_planner.scrape_and_cache_prices, auth_token)

                goal_constraints = dict(meal_plan_draft["constraints"])
                meal_plan = self.goal_planner.generate_goal_plan(goal_constraints)

                status = meal_plan.get("status", "empty")
                goal = meal_plan.get("goal", "maintain")
                cost = meal_plan.get("estimated_weekly_cost", 0.0)

                if status == "generated":
                    if is_life_event:
                        # LLM already wrote a natural human response — append cost quietly
                        bot_response = f"{bot_response.rstrip()} (custo estimado: €{cost:.2f}/semana)"
                    elif pending_edit_request:
                        bot_response = (
                            f"Plano atualizado para o objetivo '{_goal_label(goal)}' 🎯 "
                            f"(custo estimado: €{cost:.2f}/semana). "
                            "Já podes ver as alterações na aba de Planeamento Semanal."
                        )
                    else:
                        bot_response = (
                            f"Já gerei o teu plano para '{_goal_label(goal)}' 🎯 "
                            f"(custo estimado: €{cost:.2f}/semana). "
                            "Podes vê-lo na aba de Planeamento Semanal."
                        )
                else:
                    bot_response = (
                        "Não foi possível gerar o plano neste momento. "
                        "Tenta novamente dentro de instantes."
                    )
        else:
            bot_response = await asyncio.to_thread(self._chat, messages)

        self._update_memory_from_context(user_id, merged_context)
        if meal_plan and meal_plan.get("status") == "generated":
            self._update_memory_from_plan(user_id, meal_plan)

        return ChatResponse(
            response=bot_response,
            meal_plan_draft=meal_plan_draft,
            meal_plan=meal_plan,
        )

    # ──────────────────────────────────────────────────────────────────────
    # LLM helpers
    # ──────────────────────────────────────────────────────────────────────

    def _chat(self, messages: List[Dict[str, Any]]) -> str:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY não configurada no chatbot-service/.env")
        response = self.client.chat.completions.create(
            model=self.settings.model_name,
            messages=messages,
            temperature=self.settings.temperature,
            max_tokens=self.settings.max_tokens,
        )
        return response.choices[0].message.content or ""

    async def _extract_preferences(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extração estrita para o onboarding."""
        extraction_prompt = (
            "Extrai APENAS preferências para JSON válido com as chaves: "
            "favorite_foods (array), disliked_ingredients (array), "
            "goal (string: 'lose_weight' | 'gain_weight' | 'maintain' | 'gain_muscle'), "
            "max_weekly_budget (number), planning_days (number). "
            "Se faltar algo usa null. Responde APENAS JSON."
        )
        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})
        raw_json = await asyncio.to_thread(self._chat, extraction_messages)
        return safe_json_loads(raw_json)

    async def _extract_meal_plan_constraints(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Extrai constraints dinâmicas, incluindo excessos calóricos, refeições saltadas
        e ingredientes indisponíveis no supermercado.
        """
        extraction_prompt = (
            "Extrai os constraints para JSON válido com as chaves: "
            "max_weekly_budget, planning_days, favorite_foods, disliked_ingredients, "
            "calories_offset (int - positivo se o utilizador comeu a mais, NEGATIVO se saltou refeições ou comeu menos do que o plano previa), "
            "missing_ingredients (array - itens que o utilizador não tem ou não encontrou na loja), "
            "week_offset (int - 0 semana atual, 1 próxima semana, 2 duas semanas à frente, etc), "
            "week_start (string ISO YYYY-MM-DD quando o utilizador indicar uma data específica), "
            "restrictions, allergens, new_liked_ingredients, requested_extra_ingredients, "
            "goal (valores possíveis: 'lose_weight', 'gain_weight', 'maintain', 'gain_muscle'). "
            "IMPORTANTE: calories_offset deve ser negativo quando o utilizador refere que saltou refeições, comeu pouco, ou teve um dia com menos calorias. "
            "Se faltar algum campo usa null ou array vazio. Responde APENAS JSON."
        )
        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})
        raw_json = await asyncio.to_thread(self._chat, extraction_messages)
        return safe_json_loads(raw_json)

    # ──────────────────────────────────────────────────────────────────────
    # Plan helpers
    # ──────────────────────────────────────────────────────────────────────

    def _is_onboarding_complete(self, preferences: Dict[str, Any]) -> bool:
        if not preferences:
            return False
        # max_weekly_budget is optional per the onboarding prompt — only foods + days required
        required = ["favorite_foods", "planning_days"]
        return all(preferences.get(key) not in (None, "", []) for key in required)

    def _looks_like_meal_plan_request(self, text: str) -> bool:
        lower = text.lower()
        strong_keywords = [
            "meal plan", "plano de refeições", "planeamento semanal",
            "planear refeições", "planear a semana", "gerar plano",
            "fazer plano", "criar plano", "quero um plano", "novo plano",
            "plano alimentar", "organiza a minha semana", "plano da semana",
            "com base no histórico", "com base no historico", "com base no que ja sabes",
            "com base no que já sabes", "usar o meu histórico", "usar o meu historico",
        ]
        weak_keywords = ["plano", "menu", "receitas para a semana", "refeições", "refeicoes"]
        action_verbs = ["quero", "preciso", "faz", "gera", "cria", "prepara", "monta", "atualiza", "edita"]

        if any(kw in lower for kw in strong_keywords):
            return True
        if any(kw in lower for kw in weak_keywords):
            return any(v in lower for v in action_verbs)

        history_tokens = ["histórico", "historico", "anteriores", "últimos", "ultimos"]
        if any(token in lower for token in history_tokens) and any(v in lower for v in action_verbs):
            return True

        return False

    def _is_life_event(self, text: str) -> bool:
        """
        Returns True when the user is reporting a real-life dietary event that should
        trigger an immediate silent plan recalculation — without them explicitly asking
        for a new plan.

        Covers: eating out / junk food, skipping meals, overeating, under-eating,
        illness affecting appetite, etc.
        """
        lower = text.lower()

        # Direct food-intake reports
        ate_tokens = [
            "comi", "bebi", "comer", "beber", "tomei", "tive", "fui",
            "almocei", "jantei", "pequei", "petisquei", "lancei",
        ]
        junk_or_extra = [
            "big mac", "mcdonald", "burger king", "kfc", "pizza", "kebab",
            "hamburguer", "batatas fritas", "nuggets", "hot dog", "sushi",
            "pastel de nata", "bolo", "gelado", "chocolate", "doces",
            "fast food", "takeaway", "jantar fora", "almoço fora",
            "comida rápida", "snack", "tira-teimas", "cerveja", "vinho",
            "bebida alcoólica", "shots", "festa", "convívio",
        ]
        skipped_tokens = [
            "saltei", "não comi", "nao comi", "não almocei", "nao almocei",
            "não jantei", "nao jantei", "não pequei", "nao pequei",
            "fiquei sem comer", "esqueci-me de comer", "não tive tempo de comer",
            "não tive fome", "pouco", "muito pouco", "quase nada",
        ]
        overate_tokens = [
            "comi a mais", "exagerei", "abusei", "comi demais", "muito",
            "festa", "jantar especial", "aniversário", "casamento",
            "não resisti", "escapou-me",
        ]

        # Illness / low appetite affecting eating
        illness_tokens = [
            "estava doente", "tive febre", "não me apeteceu comer",
            "sem apetite", "mau estar", "enjoo", "vómitos",
        ]

        has_ate = any(t in lower for t in ate_tokens)
        has_junk = any(t in lower for t in junk_or_extra)
        has_skipped = any(t in lower for t in skipped_tokens)
        has_overate = any(t in lower for t in overate_tokens)
        has_illness = any(t in lower for t in illness_tokens)

        # "Comi X" where X is clearly junk/excess food
        if has_ate and has_junk:
            return True
        # Explicit skip or overeat signal
        if has_skipped or has_overate:
            return True
        # Illness affecting intake
        if has_illness:
            return True

        return False

    def _build_meal_plan_draft(
        self,
        constraints: Dict[str, Any],
        user_context: Optional[Dict[str, Any]],
        merged_context: Optional[Dict[str, Any]] = None,
        memory: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Consolida os dados do chat com o contexto persistido do backend."""
        # Prefer merged_context (already enriched with memory) over raw user_context
        merged = dict(merged_context or user_context or {})
        
        # Atualiza o contexto com o que o utilizador acabou de dizer no chat.
        # planning_days merece tratamento especial: o LLM de extração devolve
        # frequentemente null quando o utilizador não repete o número de dias
        # na mensagem atual — nesse caso mantemos o valor já presente no
        # merged_context (proveniente do onboarding ou da memória persistida).
        _planning_days_before = merged.get("planning_days")
        _week_offset_before = merged.get("week_offset")
        _week_start_before = merged.get("week_start")
        for k, v in constraints.items():
            if v not in (None, "", []):
                merged[k] = v
        if merged.get("planning_days") in (None, "") and _planning_days_before not in (None, ""):
            merged["planning_days"] = _planning_days_before

        # Temporal intent deserves explicit precedence: if we already inferred
        # a future week from the user message, don't let extractor defaults
        # (typically 0/current week) overwrite it.
        inferred_week_offset = self._safe_week_offset(_week_offset_before)
        extracted_week_offset = constraints.get("week_offset")
        if inferred_week_offset > 0 and extracted_week_offset in (None, "", 0, "0"):
            merged["week_offset"] = inferred_week_offset

        if _week_start_before and constraints.get("week_start") in (None, ""):
            merged["week_start"] = _week_start_before

        if memory:
            for key in ("goal", "max_weekly_budget", "planning_days"):
                if merged.get(key) in (None, "") and memory.get(key) not in (None, ""):
                    merged[key] = memory.get(key)

        # Tratamento do calories_offset (garante que é inteiro)
        try:
            calories_offset = int(merged.get("calories_offset", 0))
        except (TypeError, ValueError):
            calories_offset = 0

        try:
            planning_days = int(merged.get("planning_days", 7))
        except (TypeError, ValueError):
            planning_days = 7
        planning_days = max(1, min(planning_days, 14))

        max_budget = merged.get("max_weekly_budget")
        goal = merged.get("goal", "maintain")
        if goal in (None, ""):
            goal = "maintain"
        week_offset = self._safe_week_offset(merged.get("week_offset"))
        week_start = self._normalize_iso_week_start(merged.get("week_start"))
        recent_recipe_ids = sorted(self._to_recipe_ids(merged.get("recent_recipe_ids") or []))

        return {
            "status": "ready_for_generation",
            "backend_source": "java_service_with_ga",
            "constraints": {
                "max_weekly_budget": max_budget,
                "planning_days": planning_days,
                "goal": goal,
                "week_offset": week_offset,
                "week_start": week_start,
                "favorite_foods": merged.get("favorite_foods", []),
                "disliked_ingredients": merged.get("disliked_ingredients", []),
                "calories_offset": calories_offset,
                "missing_ingredients": merged.get("missing_ingredients", []),
                "restrictions": merged.get("restrictions", []),
                "allergens": merged.get("allergens", []),
                "exclude_recipe_ids": recent_recipe_ids,
            },
            "missing_required": [],
            "notes": "Critérios prontos. Preços do supermercado serão consultados antes da geração.",
        }

    def _ensure_user_memory(self, user_id: str) -> Dict[str, Any]:
        return self._memory_store.get(user_id)

    def _update_memory_from_preferences(self, user_id: str, preferences: Dict[str, Any]) -> None:
        if not isinstance(preferences, dict):
            return
        memory = self._ensure_user_memory(user_id)
        for key in ("favorite_foods", "disliked_ingredients"):
            values = preferences.get(key)
            if isinstance(values, list):
                memory[key] = self._merge_unique_text(memory.get(key) or [], values)

        for key in ("goal", "planning_days", "max_weekly_budget"):
            value = preferences.get(key)
            if value not in (None, ""):
                memory[key] = value
        self._memory_store.upsert(user_id, memory)

    def _update_memory_from_context(self, user_id: str, context: Dict[str, Any]) -> None:
        if not isinstance(context, dict):
            return
        memory = self._ensure_user_memory(user_id)
        for key in ("favorite_foods", "disliked_ingredients"):
            values = context.get(key)
            if isinstance(values, list):
                memory[key] = self._merge_unique_text(memory.get(key) or [], values)
        for key in ("goal", "planning_days", "max_weekly_budget"):
            value = context.get(key)
            if value not in (None, ""):
                memory[key] = value
        self._memory_store.upsert(user_id, memory)

    def _update_memory_from_plan(self, user_id: str, meal_plan: Dict[str, Any]) -> None:
        memory = self._ensure_user_memory(user_id)
        recipe_ids = self._extract_recipe_ids_from_plan(meal_plan)
        if not recipe_ids:
            return
        historical = self._to_recipe_ids(memory.get("recent_recipe_ids") or [])
        combined = list(dict.fromkeys(historical + recipe_ids))
        memory["recent_recipe_ids"] = combined[-60:]
        self._memory_store.upsert(user_id, memory)

    async def analyze_food_image(
        self,
        image_base64: str,
        mime_type: str = "image/jpeg",
        user_message: str = "",
    ) -> Dict[str, Any]:
        if self.client is None:
            raise RuntimeError("OPENAI_API_KEY não configurada no chatbot-service/.env")

        cleaned_b64 = (image_base64 or "").strip()
        if not cleaned_b64:
            return {
                "status": "error",
                "message": "Imagem inválida.",
            }

        data_url = f"data:{mime_type};base64,{cleaned_b64}"
        instruction = (
            "Analisa esta imagem de comida e devolve APENAS JSON válido com este formato: "
            "{\"dish_name\": string, \"estimated_kcal\": number, \"portion_description\": string, "
            "\"kcal_range\": {\"min\": number, \"max\": number}, "
            "\"macros\": {\"protein_g\": number, \"carbs_g\": number, \"fat_g\": number}, "
            "\"confidence\": \"low\"|\"medium\"|\"high\", \"tips\": [string], \"warnings\": [string]}. "
            "A estimativa deve ser para 1 prato na imagem (não por 100g). "
            "Se houver incerteza, usa confidence low/medium e explica em warnings."
        )
        user_text = user_message.strip() or "Quero saber calorias deste prato."

        response = await asyncio.to_thread(
            self.client.chat.completions.create,
            model=self.settings.model_name,
            temperature=0.2,
            max_tokens=450,
            messages=[
                {"role": "system", "content": instruction},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
        )

        content = response.choices[0].message.content or ""
        parsed = safe_json_loads(content)
        if not parsed:
            return {
                "status": "error",
                "message": "Não foi possível interpretar a imagem de forma fiável.",
            }

        kcal = parsed.get("estimated_kcal")
        try:
            kcal_value = max(0.0, float(kcal))
        except (TypeError, ValueError):
            kcal_value = 0.0

        macros = parsed.get("macros") if isinstance(parsed.get("macros"), dict) else {}
        protein_g = _safe_number(macros.get("protein_g"))
        carbs_g = _safe_number(macros.get("carbs_g"))
        fat_g = _safe_number(macros.get("fat_g"))

        macro_kcal = round((protein_g * 4.0) + (carbs_g * 4.0) + (fat_g * 9.0), 0)
        warnings = [str(x) for x in (parsed.get("warnings") or []) if str(x).strip()][:4]

        confidence = _normalize_confidence(parsed.get("confidence"))
        kcal_value = _sanitize_kcal(kcal_value, macro_kcal, confidence, warnings)

        raw_range = parsed.get("kcal_range") if isinstance(parsed.get("kcal_range"), dict) else {}
        range_min = _safe_number(raw_range.get("min"))
        range_max = _safe_number(raw_range.get("max"))
        if range_min <= 0 or range_max <= 0 or range_min > range_max:
            spread = 0.08 if confidence == "high" else (0.12 if confidence == "medium" else 0.18)
            range_min = max(80.0, round(kcal_value * (1.0 - spread), 0))
            range_max = min(2200.0, round(kcal_value * (1.0 + spread), 0))

        result = {
            "status": "ok",
            "dish_name": str(parsed.get("dish_name") or "Prato identificado").strip() or "Prato identificado",
            "estimated_kcal": round(kcal_value, 0),
            "portion_description": str(parsed.get("portion_description") or "1 prato médio").strip() or "1 prato médio",
            "kcal_range": {
                "min": round(range_min, 0),
                "max": round(range_max, 0),
            },
            "macros": {
                "protein_g": protein_g,
                "carbs_g": carbs_g,
                "fat_g": fat_g,
            },
            "confidence": confidence,
            "tips": [str(x) for x in (parsed.get("tips") or []) if str(x).strip()][:4],
            "warnings": warnings,
            "disclaimer": "Estimativa por visão computacional; não substitui avaliação clínica ou rótulo nutricional oficial.",
        }
        return result

    def _extract_recipe_ids_from_context(self, context: Dict[str, Any]) -> List[int]:
        ids: List[int] = []
        for key in ("active_meal_plan", "meal_plan", "last_meal_plan"):
            plan = context.get(key)
            if isinstance(plan, dict):
                ids.extend(self._extract_recipe_ids_from_plan(plan))
        return self._to_recipe_ids(ids)

    def _extract_recipe_ids_from_plan(self, meal_plan: Dict[str, Any]) -> List[int]:
        ids: List[int] = []
        for day in meal_plan.get("days") or []:
            if not isinstance(day, dict):
                continue
            for meal in day.get("meals") or []:
                if not isinstance(meal, dict):
                    continue
                raw = meal.get("recipe_id", meal.get("recipeId"))
                parsed = self._parse_positive_int(raw)
                if parsed is not None:
                    ids.append(parsed)
        return self._to_recipe_ids(ids)

    def _to_recipe_ids(self, values: List[Any]) -> List[int]:
        result: List[int] = []
        seen: set[int] = set()
        for value in values:
            parsed = self._parse_positive_int(value)
            if parsed is None or parsed in seen:
                continue
            seen.add(parsed)
            result.append(parsed)
        return result

    def _parse_positive_int(self, value: Any) -> Optional[int]:
        if isinstance(value, int):
            return value if value > 0 else None
        if isinstance(value, str) and value.isdigit():
            parsed = int(value)
            return parsed if parsed > 0 else None
        return None

    def _merge_unique_text(self, current: List[Any], incoming: List[Any]) -> List[str]:
        merged: List[str] = []
        seen: set[str] = set()
        for value in [*(current or []), *(incoming or [])]:
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged.append(cleaned)
        return merged

    def _build_coaching_metrics(self, context: Dict[str, Any]) -> Dict[str, Any]:
        weight_kg = _first_float(context, ["weight_kg", "body_weight_kg", "weight"])
        height_cm = _first_float(context, ["height_cm", "height"])
        age_years = _first_float(context, ["age"])
        sex = str(context.get("sex") or "").strip().lower()

        if weight_kg <= 0:
            return {}

        goal = str(context.get("goal") or "maintain").strip() or "maintain"
        profile = {
            "lose_weight": {"protein": 1.8, "calorie_delta": -400},
            "gain_weight": {"protein": 1.6, "calorie_delta": 350},
            "gain_muscle": {"protein": 2.0, "calorie_delta": 250},
            "maintain": {"protein": 1.4, "calorie_delta": 0},
        }.get(goal, {"protein": 1.4, "calorie_delta": 0})

        protein_target_g = round(weight_kg * float(profile["protein"]), 0)
        hydration_l = round(max(1.8, weight_kg * 0.033), 1)

        bmi = 0.0
        bmi_class = "n/a"
        if height_cm > 0:
            meters = height_cm / 100.0
            bmi = round(weight_kg / max(meters * meters, 0.01), 1)
            bmi_class = _bmi_classification(bmi)

        tdee = _first_float(context, ["tdee"])
        if tdee <= 0 and height_cm > 0 and age_years > 0:
            bmr = _mifflin_st_jeor(weight_kg, height_cm, age_years, sex)
            tdee = round(bmr * 1.4, 0)

        kcal_target = round(max(1200.0, tdee + float(profile["calorie_delta"])), 0) if tdee > 0 else 0.0

        return {
            "bmi": bmi if bmi > 0 else None,
            "bmi_class": bmi_class,
            "protein_target_g_day": protein_target_g,
            "hydration_target_l_day": hydration_l,
            "estimated_tdee": tdee if tdee > 0 else None,
            "estimated_kcal_target": kcal_target if kcal_target > 0 else None,
        }

    def _extract_temporal_plan_hints(self, text: str) -> Dict[str, Any]:
        if not text or not isinstance(text, str):
            return {}

        lowered = text.strip().lower()
        hints: Dict[str, Any] = {}

        date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", lowered)
        if date_match:
            normalized = self._normalize_iso_week_start(date_match.group(1))
            if normalized:
                hints["week_start"] = normalized
                return hints

        if any(token in lowered for token in ("esta semana", "semana atual", "semana corrente")):
            hints["week_offset"] = 0
            return hints

        if any(token in lowered for token in ("próxima semana", "proxima semana", "semana que vem", "semana seguinte")):
            hints["week_offset"] = 1

        offset_match = re.search(r"daqui\s+a\s+(\d+)\s+semanas?", lowered)
        if offset_match:
            try:
                hints["week_offset"] = max(0, min(52, int(offset_match.group(1))))
            except (TypeError, ValueError):
                pass

        return hints

    def _extract_inline_preference_hints(self, text: str) -> Dict[str, Any]:
        if not text or not isinstance(text, str):
            return {}

        lowered = " ".join(text.lower().split())
        hints: Dict[str, Any] = {}

        liked_markers = ("gosto de", "adoro", "prefiro", "curto")
        disliked_markers = ("não gosto de", "nao gosto de", "odeio", "detesto", "não quero", "nao quero", "evita")

        liked: List[str] = []
        disliked: List[str] = []

        for marker in liked_markers:
            liked.extend(self._extract_food_tokens_after_marker(lowered, marker))
        for marker in disliked_markers:
            disliked.extend(self._extract_food_tokens_after_marker(lowered, marker))

        if liked and disliked:
            disliked_set = {item.strip().lower() for item in disliked}
            liked = [item for item in liked if item.strip().lower() not in disliked_set]

        if liked:
            hints["favorite_foods"] = self._merge_unique_text([], liked)
        if disliked:
            hints["disliked_ingredients"] = self._merge_unique_text([], disliked)

        days_match = re.search(r"\b(?:pr[oó]ximos?\s+)?(\d{1,2})\s*dias?\b", lowered)
        if days_match:
            try:
                hints["planning_days"] = max(1, min(14, int(days_match.group(1))))
            except (TypeError, ValueError):
                pass

        return hints

    def _extract_food_tokens_after_marker(self, text: str, marker: str) -> List[str]:
        if not text or not marker:
            return []

        pattern = (
            rf"{re.escape(marker)}\s+(.+?)"
            rf"(?=(?:\b(?:gera|cria|faz|monta|plano|para|pr[oó]ximos?|semana|dias?)\b|[.!?]|$))"
        )
        tokens: List[str] = []
        for match in re.finditer(pattern, text):
            fragment = match.group(1).strip(" ,.;:-")
            if not fragment:
                continue

            parts = re.split(r"\s*(?:,|/|\be\b|\bou\b)\s*", fragment)
            for part in parts:
                cleaned = part.strip(" ,.;:-")
                cleaned = re.sub(r"^(?:de|do|da|dos|das|o|a|os|as)\s+", "", cleaned)
                if len(cleaned) >= 2:
                    tokens.append(cleaned)

        return self._merge_unique_text([], tokens)

    def _safe_week_offset(self, value: Any) -> int:
        try:
            parsed = int(value)
            return max(0, min(52, parsed))
        except (TypeError, ValueError):
            return 0

    def _normalize_iso_week_start(self, raw: Any) -> Optional[str]:
        if not isinstance(raw, str):
            return None
        text = raw.strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text).date()
        except ValueError:
            try:
                parsed = date.fromisoformat(text)
            except ValueError:
                return None

        monday = parsed - timedelta(days=parsed.weekday())
        return monday.isoformat()


# ──────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────

def _goal_label(goal: str) -> str:
    return {
        "lose_weight": "emagrecer",
        "gain_weight": "ganhar peso",
        "maintain": "manter a forma",
        "gain_muscle": "ganhar massa muscular",
    }.get(goal, goal)


def _safe_number(value: Any) -> float:
    try:
        return round(max(0.0, float(value)), 1)
    except (TypeError, ValueError):
        return 0.0


def _normalize_confidence(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"high", "medium", "low"}:
        return normalized
    return "low"


def _first_float(payload: Dict[str, Any], keys: List[str]) -> float:
    for key in keys:
        value = payload.get(key)
        try:
            parsed = float(value)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            continue
    return 0.0


def _bmi_classification(bmi: float) -> str:
    if bmi <= 0:
        return "n/a"
    if bmi < 18.5:
        return "baixo peso"
    if bmi < 25:
        return "peso adequado"
    if bmi < 30:
        return "excesso de peso"
    return "obesidade"


def _mifflin_st_jeor(weight_kg: float, height_cm: float, age_years: float, sex: str) -> float:
    base = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age_years)
    if sex.startswith("f"):
        return base - 161.0
    return base + 5.0


def _sanitize_kcal(kcal_value: float, macro_kcal: float, confidence: str, warnings: List[str]) -> float:
    if kcal_value <= 0 and macro_kcal > 0:
        warnings.append("Calorias estimadas por macros devido a baixa confiança da leitura.")
        return max(80.0, min(2200.0, macro_kcal))

    if kcal_value < 80.0 or kcal_value > 2200.0:
        if macro_kcal > 0:
            warnings.append("Valor calórico ajustado com base nos macronutrientes estimados.")
            return max(80.0, min(2200.0, macro_kcal))

        warnings.append("Valor calórico fora do intervalo habitual para 1 prato; usa como aproximação.")
        return max(80.0, min(2200.0, kcal_value))

    if confidence == "low" and macro_kcal > 0:
        blended = (kcal_value * 0.6) + (macro_kcal * 0.4)
        warnings.append("Confiança baixa: calorias suavizadas com base nos macronutrientes.")
        return max(80.0, min(2200.0, blended))

    return kcal_value
