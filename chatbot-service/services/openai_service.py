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
from typing import Any, Dict, List, Optional

from openai import OpenAI

from config.settings import get_settings
from models.schemas import ChatResponse, Message
from services.goal_meal_planner import GoalMealPlannerService
from utils.helpers import load_prompt, safe_json_loads


class OpenAIService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None
        self.goal_planner = GoalMealPlannerService()

    # ──────────────────────────────────────────────────────────────────────
    # Onboarding
    # ──────────────────────────────────────────────────────────────────────

    async def onboarding_chat(
        self, user_message: str, history: List[Message]
    ) -> ChatResponse:
        system_prompt = load_prompt("prompts/onboarding.txt")

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
    ) -> ChatResponse:
        pending_edit_request = bool((user_context or {}).get("pending_edit_request"))
        planning_request = self._looks_like_meal_plan_request(user_message) or pending_edit_request

        system_prompt = load_prompt("prompts/assistant.txt")
        if user_context:
            system_prompt += f"\n\nContexto do utilizador:\n{user_context}"

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        bot_response = self._chat(messages)
        meal_plan_draft = None
        meal_plan = None

        if planning_request:
            constraints = await self._extract_meal_plan_constraints(messages)
            meal_plan_draft = self._build_meal_plan_draft(constraints, user_context)
            missing = meal_plan_draft.get("missing_required", [])

            if missing:
                bot_response = (
                    "Para fechar o planeamento desta semana, ainda preciso de: "
                    + ", ".join(missing)
                    + "."
                )
            else:
                bot_response = (
                    "Um momento — estou a consultar os preços do supermercado "
                    "para optimizar o plano"
                )

                # para não congelar o servidor durante chamadas de rede ao Java service
                await asyncio.to_thread(
                    self.goal_planner.scrape_and_cache_prices, auth_token
                )

                goal_constraints = dict(meal_plan_draft["constraints"])
                meal_plan = self.goal_planner.generate_goal_plan(goal_constraints)

                goal = meal_plan.get("goal", "maintain")
                cost = meal_plan.get("estimated_weekly_cost", 0.0)
                status = meal_plan.get("status", "empty")

                if status == "generated":
                    if pending_edit_request:
                        bot_response = (
                            f"Plano atualizado com sucesso para o objetivo '{_goal_label(goal)}' 🎯 "
                            f"(custo estimado: €{cost:.2f}/semana). "
                            "A alteração já foi aplicada na tua aba de Planeamento Semanal."
                        )
                    else:
                        bot_response = (
                            f"Plano gerado com sucesso para o objetivo '{_goal_label(goal)}' 🎯 "
                            f"(custo estimado: €{cost:.2f}/semana). "
                            f"As receitas estão disponíveis na aba de Planeamento Semanal."
                        )
                else:
                    bot_response = (
                        "Não foi possível gerar o plano neste momento. "
                        "Tenta novamente dentro de instantes."
                    )

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
        extraction_prompt = (
            "Extrai APENAS preferências para JSON válido com as chaves: "
            "favorite_foods (array), disliked_ingredients (array), "
            "restrictions (array), allergens (array), "
            "max_weekly_budget (number), planning_days (number). "
            "Se faltar algo usa null. Responde APENAS JSON."
        )
        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})
        raw_json = self._chat(extraction_messages)
        return safe_json_loads(raw_json)

    async def _extract_meal_plan_constraints(
        self, messages: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        extraction_prompt = (
            "Extrai os constraints para meal planning para JSON válido com as chaves: "
            "max_weekly_budget, planning_days, favorite_foods, disliked_ingredients, "
            "restrictions, allergens, new_liked_ingredients, requested_extra_ingredients, "
            "goal (valores possíveis: 'lose_weight', 'gain_weight', 'maintain', 'gain_muscle'). "
            "Se faltar algum campo usa null ou array vazio. Responde APENAS JSON."
        )
        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})
        raw_json = self._chat(extraction_messages)
        return safe_json_loads(raw_json)

    # ──────────────────────────────────────────────────────────────────────
    # Plan helpers
    # ──────────────────────────────────────────────────────────────────────

    def _is_onboarding_complete(self, preferences: Dict[str, Any]) -> bool:
        if not preferences:
            return False
        required = ["favorite_foods", "max_weekly_budget", "planning_days"]
        return all(preferences.get(key) not in (None, "", []) for key in required)

    def _looks_like_meal_plan_request(self, text: str) -> bool:
        # "boa semana" ou "o que comeste esta semana". Agora exige keywords
        # mais específicas ligadas a intenção de planeamento.
        lower = text.lower()
        strong_keywords = [
            "meal plan", "plano de refeições", "planeamento semanal",
            "planear refeições", "planear a semana", "gerar plano",
            "fazer plano", "criar plano", "quero um plano", "novo plano",
        ]
        # Combinações fracas: só disparam se acompanhadas de verbo de ação
        weak_keywords = ["plano", "menu", "receitas para a semana"]
        action_verbs = ["quero", "preciso", "faz", "gera", "cria", "prepara", "monta"]

        if any(kw in lower for kw in strong_keywords):
            return True
        if any(kw in lower for kw in weak_keywords):
            return any(v in lower for v in action_verbs)
        return False

    def _build_meal_plan_draft(
        self,
        constraints: Dict[str, Any],
        user_context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        merged = dict(user_context or {})
        merged.update({k: v for k, v in constraints.items() if v not in (None, "")})

        planning_days = merged.get("planning_days")
        try:
            if planning_days is not None:
                planning_days = int(planning_days)
        except (TypeError, ValueError):
            planning_days = None

        max_budget = merged.get("max_weekly_budget")
        goal = merged.get("goal", "maintain")

        missing_required = []
        if max_budget in (None, ""):
            missing_required.append("preço máximo semanal")
        if planning_days in (None, ""):
            missing_required.append("número de dias a planear")

        return {
            "status": "ready_for_generation",
            "backend_source": "java_service_with_ga",
            "constraints": {
                "max_weekly_budget": max_budget,
                "planning_days": planning_days,
                "goal": goal,
                "favorite_foods": merged.get("favorite_foods", []),
                "disliked_ingredients": merged.get("disliked_ingredients", []),
                "new_liked_ingredients": merged.get("new_liked_ingredients", []),
                "requested_extra_ingredients": merged.get("requested_extra_ingredients", []),
                "restrictions": merged.get("restrictions", []),
                "allergens": merged.get("allergens", []),
            },
            "missing_required": missing_required,
            "notes": "Critérios prontos. Preços do supermercado serão consultados antes da geração.",
        }


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