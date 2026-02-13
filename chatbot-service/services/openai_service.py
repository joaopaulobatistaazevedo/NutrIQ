from typing import Any, Dict, List, Optional

from groq import Groq

from config.settings import get_settings
from models.schemas import ChatResponse, Message
from utils.helpers import load_prompt, safe_json_loads


class OpenAIService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = Groq(api_key=self.settings.groq_api_key)

    async def onboarding_chat(self, user_message: str, history: List[Message]) -> ChatResponse:
        system_prompt = load_prompt("prompts/onboarding.txt")

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        bot_response = self._chat(messages)
        extracted_preferences = await self._extract_preferences(messages)
        onboarding_complete = self._is_onboarding_complete(extracted_preferences)

        if onboarding_complete:
            bot_response = (
                "Perfeito! Já tenho o necessário para preparar o teu plano semanal de refeições 🎯"
            )

        return ChatResponse(
            response=bot_response,
            onboarding_complete=onboarding_complete,
            extracted_preferences=extracted_preferences if onboarding_complete else None,
        )

    async def assistant_chat(
        self,
        user_message: str,
        user_context: Optional[Dict[str, Any]],
        history: Optional[List[Message]] = None,
    ) -> ChatResponse:
        recurring_user = bool(user_context and user_context.get("is_first_time") is False)
        planning_request = self._looks_like_meal_plan_request(user_message)

        if recurring_user and planning_request and not self._has_recurring_feedback(user_context):
            return ChatResponse(
                response=(
                    "Antes de montar o novo plano, diz-me duas coisas: "
                    "1) Nas últimas receitas gostaste de algum ingrediente novo? "
                    "2) Queres incluir algum ingrediente específico nas próximas refeições?"
                )
            )

        system_prompt = load_prompt("prompts/assistant.txt")

        if user_context:
            system_prompt += f"\n\nContexto do utilizador:\n{user_context}"

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        bot_response = self._chat(messages)

        meal_plan_draft = None
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

        return ChatResponse(response=bot_response, meal_plan_draft=meal_plan_draft)

    def _chat(self, messages: List[Dict[str, Any]]) -> str:
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
            "max_weekly_budget (number), planning_days (number). "
            "Se faltar algo usa null. Responde APENAS JSON."
        )

        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})

        raw_json = self._chat(extraction_messages)
        return safe_json_loads(raw_json)

    async def _extract_meal_plan_constraints(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        extraction_prompt = (
            "Extrai os constraints para meal planning para JSON válido com as chaves: "
            "max_weekly_budget, planning_days, favorite_foods, disliked_ingredients, "
            "new_liked_ingredients, requested_extra_ingredients. "
            "Se faltar algum campo usa null ou array vazio. Responde APENAS JSON."
        )

        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})

        raw_json = self._chat(extraction_messages)
        return safe_json_loads(raw_json)

    def _is_onboarding_complete(self, preferences: Dict[str, Any]) -> bool:
        if not preferences:
            return False

        required = ["favorite_foods", "max_weekly_budget", "planning_days"]
        return all(preferences.get(key) not in (None, "", []) for key in required)

    def _looks_like_meal_plan_request(self, text: str) -> bool:
        lower = text.lower()
        keywords = [
            "meal plan",
            "plano de refeições",
            "plano",
            "planear",
            "planeamento",
            "semana",
            "receitas",
            "menu",
        ]
        return any(word in lower for word in keywords)

    def _has_recurring_feedback(self, user_context: Optional[Dict[str, Any]]) -> bool:
        if not user_context:
            return False

        new_liked = user_context.get("new_liked_ingredients") or []
        requested = user_context.get("requested_extra_ingredients") or []

        return bool(new_liked or requested)

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
        missing_required = []
        if max_budget in (None, ""):
            missing_required.append("preço máximo semanal")
        if planning_days in (None, ""):
            missing_required.append("número de dias a planear")

        return {
            "status": "pending_backend_integration",
            "backend_source": "scraped_recipes_api",
            "constraints": {
                "max_weekly_budget": max_budget,
                "planning_days": planning_days,
                "favorite_foods": merged.get("favorite_foods", []),
                "disliked_ingredients": merged.get("disliked_ingredients", []),
                "new_liked_ingredients": merged.get("new_liked_ingredients", []),
                "requested_extra_ingredients": merged.get("requested_extra_ingredients", []),
            },
            "missing_required": missing_required,
            "recipe_candidates": [],
            "notes": "TODO: Integrar com backend de receitas scraped e motor de otimização.",
        }
