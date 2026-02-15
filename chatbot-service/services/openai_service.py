from typing import Any, Dict, List, Optional

from openai import OpenAI

from config.settings import get_settings
from models.schemas import ChatResponse, Message
from services.recipe_planner import RecipePlannerService
from utils.helpers import load_prompt, safe_json_loads


class OpenAIService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = OpenAI(api_key=self.settings.openai_api_key)
        self.recipe_planner = RecipePlannerService()

    async def onboarding_chat(self, user_message: str, history: List[Message]) -> ChatResponse:
        """Gere o fluxo inicial de recolha de preferências."""
        system_prompt = load_prompt("prompts/onboarding.txt")

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        bot_response = self._chat(messages)
        extracted_preferences = await self._extract_preferences(messages)
        onboarding_complete = self._is_onboarding_complete(extracted_preferences)

        if onboarding_complete:
            bot_response = "Perfeito! Já tenho o necessário para preparar o teu plano semanal de refeições 🎯"

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
        """Gere a conversa principal, ajustes de plano e compensação calórica."""
        planning_request = self._looks_like_meal_plan_request(user_message)

        system_prompt = load_prompt("prompts/assistant.txt")
        
        # Injetamos o contexto atual (incluindo calories_offset) no system prompt 
        # para que o modelo tenha consciência do estado do utilizador.
        if user_context:
            system_prompt += f"\n\nContexto do utilizador (ID: {user_context.get('user_id', 'desconhecido')}):\n{user_context}"

        messages = [{"role": "system", "content": system_prompt}]
        if history:
            messages.extend({"role": item.role, "content": item.content} for item in history)
        messages.append({"role": "user", "content": user_message})

        bot_response = self._chat(messages)
        meal_plan_draft = None
        meal_plan = None

        if planning_request:
            # Extraímos os parâmetros, incluindo os novos campos dinâmicos
            constraints = await self._extract_meal_plan_constraints(messages)
            
            # Construímos o draft fundindo o que o utilizador disse agora com o contexto do backend
            meal_plan_draft = self._build_meal_plan_draft(constraints, user_context)
            missing = meal_plan_draft.get("missing_required", [])

            if missing:
                bot_response = (
                    "Para fechar o teu planeamento, ainda preciso de: "
                    + ", ".join(missing)
                    + "."
                )
            else:
                # Geramos o plano usando a lógica inteligente do planner (categorias e filtros)
                meal_plan = self.recipe_planner.generate_weekly_plan(meal_plan_draft["constraints"])
                
                # Resposta personalizada se houver ajustes ativos
                if meal_plan_draft["constraints"].get("calories_offset", 0) > 0:
                    bot_response = "Plano ajustado! Escolhi opções mais leves para compensar o teu dia de ontem. Já podes conferir na aba de Planeamento. 🌱"
                elif meal_plan_draft["constraints"].get("missing_ingredients"):
                    bot_response = "Sem problema. Ajustei o teu plano para evitar os ingredientes que não encontraste. Vê as novas sugestões! 🛒"
                else:
                    bot_response = "Perfeito. O teu plano semanal foi gerado e já está disponível na aba de Planeamento."

        return ChatResponse(
            response=bot_response, 
            meal_plan_draft=meal_plan_draft, 
            meal_plan=meal_plan
        )

    def _chat(self, messages: List[Dict[str, Any]]) -> str:
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
            "max_weekly_budget (number), planning_days (number). "
            "Se faltar algo usa null. Responde APENAS JSON."
        )

        extraction_messages = list(messages)
        extraction_messages.append({"role": "user", "content": extraction_prompt})

        raw_json = self._chat(extraction_messages)
        return safe_json_loads(raw_json)

    async def _extract_meal_plan_constraints(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Extrai constraints dinâmicas, incluindo excessos calóricos 
        e ingredientes indisponíveis no supermercado.
        """
        extraction_prompt = (
            "Extrai os constraints para JSON válido com as chaves: "
            "max_weekly_budget, planning_days, favorite_foods, disliked_ingredients, "
            "calories_offset (int - calorias extras consumidas fora do plano), "
            "missing_ingredients (array - itens que o utilizador não tem ou não encontrou na loja), "
            "restrictions, allergens. "
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
            "plano", "planear", "planeamento", "semana", "receitas", "menu", 
            "ajusta", "muda", "altera", "não encontro", "comi a mais", "abusei"
        ]
        return any(word in lower for word in keywords)

    def _build_meal_plan_draft(
        self,
        constraints: Dict[str, Any],
        user_context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Consolida os dados do chat com o contexto persistido do backend."""
        merged = dict(user_context or {})
        
        # Atualiza o contexto com o que o utilizador acabou de dizer no chat
        for k, v in constraints.items():
            if v not in (None, "", []):
                merged[k] = v

        # Tratamento do calories_offset (garante que é inteiro)
        try:
            calories_offset = int(merged.get("calories_offset", 0))
        except (TypeError, ValueError):
            calories_offset = 0

        # Validação de campos obrigatórios
        missing_required = []
        if not merged.get("max_weekly_budget"):
            missing_required.append("preço máximo semanal")
        if not merged.get("planning_days"):
            missing_required.append("número de dias a planear")

        return {
            "status": "ready_for_generation",
            "constraints": {
                "max_weekly_budget": merged.get("max_weekly_budget"),
                "planning_days": merged.get("planning_days"),
                "favorite_foods": merged.get("favorite_foods", []),
                "disliked_ingredients": merged.get("disliked_ingredients", []),
                "calories_offset": calories_offset,
                "missing_ingredients": merged.get("missing_ingredients", []),
                "restrictions": merged.get("restrictions", []),
                "allergens": merged.get("allergens", []),
            },
            "missing_required": missing_required
        }