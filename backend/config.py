from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://firmos:firmos@db:5432/firmos"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    supabase_url: str = ""
    cors_origins: str = "http://localhost:3000"

    # AI providers — system-wide fallback. Empty string means "not set";
    # the AI service treats either as "no key" and falls back through
    # firm key -> env key -> stub response.
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Fernet key for encrypting per-firm AI keys at rest. When unset,
    # per-firm key storage is disabled (env keys above are still used).
    encryption_key: str = ""

    # AI request timeout in seconds — provider call gives up after this
    # so a hung provider can't wedge a request handler.
    ai_request_timeout: int = 30

    # Voyage AI — used for semantic embeddings in the memory layer.
    # Sign up at https://www.voyageai.com to obtain a key.
    voyage_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
