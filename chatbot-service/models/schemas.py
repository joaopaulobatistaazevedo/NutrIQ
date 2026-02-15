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


class FoodImageAnalysisRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    user_message: str = ""


class FoodImageAnalysisResponse(BaseModel):
    status: str
    dish_name: Optional[str] = None
    estimated_kcal: Optional[float] = None
    portion_description: Optional[str] = None
    kcal_range: Optional[Dict[str, float]] = None
    macros: Optional[Dict[str, float]] = None
    confidence: Optional[str] = None
    tips: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    disclaimer: Optional[str] = None
    message: Optional[str] = None