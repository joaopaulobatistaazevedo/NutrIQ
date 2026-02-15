from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENAI_API_KEY", "GROQ_API_KEY")
    )
    model_name: str = "gpt-4o"
    max_tokens: int = 900
    temperature: float = 0.4
    allowed_origins: str = "*"
    backend_api_url: str = "http://localhost:7071"
    java_service_url: str = Field(
        default="http://localhost:7071",
        validation_alias=AliasChoices("JAVA_SERVICE_URL", "BACKEND_API_URL"),
    )
    backend_timeout_seconds: float = 6.0

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        protected_namespaces=(),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
