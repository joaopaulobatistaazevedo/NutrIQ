from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from models.schemas import ChatRequest, ChatResponse
from services.backend_service import BackendService
from services.openai_service import OpenAIService

settings = get_settings()
app = FastAPI(title="Meal Planner Chatbot (OpenAI)")

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


@app.get("/")
def root():
    return {"status": "Chatbot API running", "provider": "openai"}


@app.get("/health")
def health():
    return {"ok": True}


def _resolve_backend_token(request_body: ChatRequest, http_request: Request) -> Optional[str]:
    if request_body.backend_token:
        return request_body.backend_token.strip()

    auth_header = http_request.headers.get("Authorization")
    if not auth_header:
        return None

    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return auth_header.strip()


@app.post("/chat/onboarding", response_model=ChatResponse)
async def onboarding_chat(request: ChatRequest, http_request: Request):
    
    history = request.conversation_history or []

    try:
        response = await chat_service.onboarding_chat(request.message, history)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI provider error: {exc}") from exc

    backend_token = _resolve_backend_token(request, http_request)
    if response.extracted_preferences:
        backend_service.persist_user_chat_data(backend_token, response.extracted_preferences)

    return response


@app.post("/chat/assistant", response_model=ChatResponse)
async def assistant_chat(request: ChatRequest, http_request: Request):

    history = request.conversation_history or []

    normalized_context = dict(request.user_context or {})

    if "is_first_time" not in normalized_context:
        normalized_context["is_first_time"] = True

    backend_token = _resolve_backend_token(request, http_request)

    try:
        response = await chat_service.assistant_chat(
            request.message, normalized_context, history, auth_token=backend_token
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI provider error: {exc}") from exc

    constraints = ((response.meal_plan_draft or {}).get("constraints") or {})
    if constraints:
        backend_service.persist_user_chat_data(backend_token, constraints)

    if response.meal_plan:
        backend_service.persist_generated_meal_plan(backend_token, response.meal_plan)

    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)