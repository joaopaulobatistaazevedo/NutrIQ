from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    groq_api_key: str 
    model_name: str = "llama-3.1-8b-instant"
    max_tokens: int = 600
    temperature: float = 0.7
    allowed_origins: str = "*"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        protected_namespaces=(),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
