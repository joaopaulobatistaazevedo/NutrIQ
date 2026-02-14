from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_id: str = "anonymous"
    conversation_history: List[Message] = Field(default_factory=list)
    user_context: Optional[Dict[str, Any]] = None
    backend_token: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    onboarding_complete: bool = False
    extracted_preferences: Optional[Dict[str, Any]] = None
    meal_plan_draft: Optional[Dict[str, Any]] = None

