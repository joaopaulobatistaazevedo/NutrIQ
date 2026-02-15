import asyncio
from typing import Any, Dict, Optional
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from models.schemas import (
    ChatRequest,
    ChatResponse,
    FoodImageAnalysisRequest,
    FoodImageAnalysisResponse,
)
from services.backend_service import BackendService
from services.openai_service import OpenAIService

settings = get_settings()
app = FastAPI(title="Meal Planner Chatbot (OpenAI)")
logger = logging.getLogger(__name__)

origins = ["*"] if settings.allowed_origins == "*" else [x.strip() for x in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_service = OpenAIService()
backend_service = BackendService()


def _apply_plan_persistence_and_cart(response: ChatResponse, backend_token: Optional[str]) -> ChatResponse:
    constraints = ((response.meal_plan_draft or {}).get("constraints") or {})
    if constraints:
        backend_service.persist_user_chat_data(backend_token, constraints)

    if response.meal_plan:
        generated_plan = dict(response.meal_plan)
        persisted_plan = backend_service.persist_generated_meal_plan(backend_token, response.meal_plan)
        if persisted_plan:
            # Keep the generated plan in the response so the frontend can show
            # forward-looking days beyond the persisted backend week model.
            response.meal_plan = generated_plan
            response.meal_plan_persisted = True
        else:
            logger.warning(
                "Plano gerado mas não persistido no backend (token=%s)",
                "present" if backend_token else "missing",
            )
            response.meal_plan = generated_plan
            response.meal_plan_persisted = False
            response.response = (
                f"{(response.response or '').strip()} "
                "Consegui gerar o plano, mas não foi possível guardá-lo totalmente na base de dados."
            ).strip()

        if response.meal_plan_persisted:
            cart_plan_input = dict(generated_plan or {})
            for key in ("max_weekly_budget", "goal_daily_calories", "planning_days", "goal"):
                if key not in cart_plan_input and key in generated_plan:
                    cart_plan_input[key] = generated_plan[key]

            shopping_cart = backend_service.generate_and_persist_shopping_cart(
                backend_token,
                cart_plan_input,
            )
            if shopping_cart:
                response.shopping_cart = shopping_cart
                response.response = (
                    f"{response.response} Também otimizei o carrinho para ficar mais barato e mais saudável "
                    "com base no teu orçamento e objetivo calórico semanal."
                ).strip()

    return response


@app.get("/")
def root():
    return {"status": "Chatbot API running", "provider": "openai"}


@app.get("/health")
def health():
    return {"ok": True}


def _resolve_backend_token(
    request_body: Optional[ChatRequest],
    http_request: Request,
) -> Optional[str]:
    if request_body and request_body.backend_token:
        return request_body.backend_token.strip()

    auth_header = http_request.headers.get("Authorization")
    if not auth_header:
        return None

    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return auth_header.strip()


@app.post("/shopping-cart/generate")
@app.post("/chat/shopping-cart/generate")
async def generate_shopping_cart(http_request: Request):
    backend_token = _resolve_backend_token(None, http_request)
    if not backend_token:
        raise HTTPException(status_code=401, detail="Autenticação necessária para gerar carrinho.")

    payload: Dict[str, Any] = {}
    try:
        parsed = await http_request.json()
        if isinstance(parsed, dict):
            payload = parsed
    except Exception:
        payload = {}

    candidate_plan = payload.get("meal_plan")
    if not isinstance(candidate_plan, dict):
        candidate_plan = None

    # Regra principal: gerar carrinho a partir do plano ativo persistido na BD.
    meal_plan = await asyncio.to_thread(backend_service.fetch_active_meal_plan, backend_token)
    if not isinstance(meal_plan, dict):
        # Fallback apenas quando ainda não existe plano ativo persistido.
        if isinstance(candidate_plan, dict):
            meal_plan = candidate_plan

    if not isinstance(meal_plan, dict):
        raise HTTPException(status_code=404, detail="Não existe um plano ativo para gerar carrinho.")

    shopping_cart = await asyncio.to_thread(
        backend_service.generate_and_persist_shopping_cart,
        backend_token,
        meal_plan,
    )

    # Se o plano ativo da BD estiver incompleto para extração de ingredientes,
    # tenta novamente com o plano enviado pelo frontend.
    if not isinstance(shopping_cart, dict) and isinstance(candidate_plan, dict):
        retry_plan = dict(candidate_plan)
        for key in ("max_weekly_budget", "goal_daily_calories", "planning_days", "goal"):
            if key not in retry_plan and key in meal_plan:
                retry_plan[key] = meal_plan[key]

        shopping_cart = await asyncio.to_thread(
            backend_service.generate_and_persist_shopping_cart,
            backend_token,
            retry_plan,
        )

    if not isinstance(shopping_cart, dict):
        raise HTTPException(
            status_code=502,
            detail=(
                "Não foi possível gerar carrinho com ingredientes reais do plano "
                "e preços atuais."
            ),
        )

    return shopping_cart


@app.post("/chat/onboarding", response_model=ChatResponse)
async def onboarding_chat(request: ChatRequest, http_request: Request):
    
    history = request.conversation_history or []

    try:
        response = await chat_service.onboarding_chat(
            request.message,
            history,
            user_id=request.user_id,
            user_context=request.user_context,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI provider error: {exc}") from exc

    backend_token = _resolve_backend_token(request, http_request)
    persisted = False
    if response.extracted_preferences:
        persisted = backend_service.persist_user_chat_data(backend_token, response.extracted_preferences)
        if response.onboarding_complete and not persisted:
            logger.warning(
                "Onboarding completo mas sem persistência no backend (token=%s)",
                "present" if backend_token else "missing",
            )
            response.onboarding_complete = False
            response.extracted_preferences = None
            response.response = (
                "Ainda não consegui guardar as tuas preferências na base de dados. "
                "Confirma a sessão e tenta novamente para eu gerar o plano."
            )

    if response.onboarding_complete and persisted and backend_token:
        try:
            auto_plan_response = await chat_service.assistant_chat(
                "Com base no meu onboarding, gera agora o meu plano semanal de refeições.",
                {
                    **(response.extracted_preferences or {}),
                    "is_first_time": False,
                },
                history,
                auth_token=backend_token,
                user_id=request.user_id,
            )
            auto_plan_response = _apply_plan_persistence_and_cart(auto_plan_response, backend_token)

            response.meal_plan_draft = auto_plan_response.meal_plan_draft
            response.meal_plan = auto_plan_response.meal_plan
            response.meal_plan_persisted = auto_plan_response.meal_plan_persisted
            response.shopping_cart = auto_plan_response.shopping_cart

            if auto_plan_response.response:
                response.response = f"{response.response}\n{auto_plan_response.response}".strip()
        except Exception as exc:
            logger.warning("Falha ao auto-gerar plano pós-onboarding: %s", exc)

    return response


@app.post("/chat/assistant", response_model=ChatResponse)
async def assistant_chat(request: ChatRequest, http_request: Request):

    history = request.conversation_history or []

    normalized_context = dict(request.user_context or {})

    if "is_first_time" not in normalized_context:
        normalized_context["is_first_time"] = True

    backend_token = _resolve_backend_token(request, http_request)
    if backend_token:
        active_plan = backend_service.fetch_active_meal_plan(backend_token)
        if active_plan and "active_meal_plan" not in normalized_context:
            normalized_context["active_meal_plan"] = active_plan

    try:
        response = await chat_service.assistant_chat(
            request.message,
            normalized_context,
            history,
            auth_token=backend_token,
            user_id=request.user_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI provider error: {exc}") from exc

    response = _apply_plan_persistence_and_cart(response, backend_token)

    return response

@app.post("/chat/analyze-food-image", response_model=FoodImageAnalysisResponse)
async def analyze_food_image(request: FoodImageAnalysisRequest):
    try:
        result = await chat_service.analyze_food_image(
            image_base64=request.image_base64,
            mime_type=request.mime_type,
            user_message=request.user_message,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vision provider error: {exc}") from exc

    return FoodImageAnalysisResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
