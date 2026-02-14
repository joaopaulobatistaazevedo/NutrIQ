from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


GoalType = Literal["lose_weight", "gain_weight", "maintain", "gain_muscle"]


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_id: str = "anonymous"
    conversation_history: List[Message] = Field(default_factory=list)
    user_context: Optional[Dict[str, Any]] = None
    backend_token: Optional[str] = None
    # Goal is optional here – if provided it overrides what the LLM extracts
    goal: Optional[GoalType] = None


class ChatResponse(BaseModel):
    response: str
    onboarding_complete: bool = False
    extracted_preferences: Optional[Dict[str, Any]] = None
    meal_plan_draft: Optional[Dict[str, Any]] = None
    meal_plan: Optional[Dict[str, Any]] = None
    meal_plan_persisted: bool = False
    shopping_cart: Optional[Dict[str, Any]] = None