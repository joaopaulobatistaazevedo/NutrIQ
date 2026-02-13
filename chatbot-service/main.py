from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings
from models.schemas import ChatRequest, ChatResponse, Message
from services.conversation import ConversationManager
from services.openai_service import OpenAIService

settings = get_settings()
app = FastAPI(title="Meal Planner Chatbot (Groq)")

origins = ["*"] if settings.allowed_origins == "*" else [x.strip() for x in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chat_service = OpenAIService()
conversation_manager = ConversationManager()


@app.get("/")
def root():
    return {"status": "Chatbot API running", "provider": "groq"}


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat/onboarding", response_model=ChatResponse)
async def onboarding_chat(request: ChatRequest):
    history = request.conversation_history or conversation_manager.get_history(request.user_id)

    try:
        response = await chat_service.onboarding_chat(request.message, history)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq provider error: {exc}") from exc

    conversation_manager.append(request.user_id, Message(role="user", content=request.message))
    conversation_manager.append(request.user_id, Message(role="assistant", content=response.response))

    return response


@app.post("/chat/assistant", response_model=ChatResponse)
async def assistant_chat(request: ChatRequest):
    history = request.conversation_history or conversation_manager.get_history(request.user_id)

    try:
        response = await chat_service.assistant_chat(request.message, request.user_context, history)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq provider error: {exc}") from exc

    conversation_manager.append(request.user_id, Message(role="user", content=request.message))
    conversation_manager.append(request.user_id, Message(role="assistant", content=response.response))

    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
