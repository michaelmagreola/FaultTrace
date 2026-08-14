from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Load from environment / backend/.env — see backend/.env.example."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "FaultTrace"
    database_url: str = "sqlite:///./faulttrace.db"
    # NoDecode: allow CORS_ORIGINS=* without pydantic-settings JSON-decoding the env value first.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    # dev | cognito
    auth_mode: Literal["dev", "cognito"] = "dev"
    # local | bedrock
    ai_mode: Literal["local", "bedrock"] = "local"

    # HMAC secret for demo session tokens (set a long random value in .env)
    session_secret: str = ""
    session_ttl_seconds: int = Field(default=28_800, ge=300, le=604_800)  # 8h default

    login_rate_window_seconds: int = Field(default=300, ge=30, le=3600)
    login_rate_max_attempts: int = Field(default=10, ge=3, le=100)

    cognito_region: str = "us-east-1"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""

    aws_region: str = "us-east-1"
    bedrock_chat_model_id: str = "anthropic.claude-3-5-sonnet-20240620-v1:0"
    bedrock_embed_model_id: str = "amazon.titan-embed-text-v2:0"

    retrieval_top_k: int = Field(default=5, ge=1, le=50)
    retrieval_min_score: float = Field(default=0.12, ge=0.0, le=1.0)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors(cls, value: object) -> object:
        """Allow CORS_ORIGINS as JSON list, '*', or comma-separated string."""
        import json

        if isinstance(value, str):
            text = value.strip()
            if not text or text in {"*", "[*]", "['*']", '["*"]'}:
                return ["*"]
            if text.startswith("["):
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return ["*"] if "*" in text else []
            return [part.strip() for part in text.split(",") if part.strip()]
        return value

    @model_validator(mode="after")
    def normalize_security(self) -> "Settings":
        # Allow explicit "*" for same-origin container deploys; strip empties otherwise.
        origins = [o for o in self.cors_origins if o]
        if origins != ["*"]:
            origins = [o for o in origins if o != "*"]
        object.__setattr__(self, "cors_origins", origins)

        # Known weak / documented placeholders — never accept as a live signing key.
        weak_secrets = {
            "",
            "dev-only-faulttrace-session-secret-change-me",
            "faulttrace-ecs-express-session-secret",
            "faulttrace-apprunner-session-secret",
            "replace-with-a-long-random-secret",
        }

        secret = (self.session_secret or "").strip()
        allow_insecure = (self.auth_mode == "dev") and (
            __import__("os").environ.get("ALLOW_INSECURE_DEV_SECRET", "").strip().lower()
            in {"1", "true", "yes"}
        )

        if secret in weak_secrets or not secret:
            if self.auth_mode != "dev":
                raise ValueError(
                    "SESSION_SECRET is required when AUTH_MODE is not dev "
                    "(unset or placeholder secrets are not allowed)."
                )
            if not allow_insecure:
                # Crash on boot rather than silently signing with a predictable key.
                raise ValueError(
                    "SESSION_SECRET is unset or equals a known placeholder. "
                    "Set a long random SESSION_SECRET (or ALLOW_INSECURE_DEV_SECRET=1 "
                    "for local-only demo)."
                )
            secret = "dev-only-faulttrace-session-secret-change-me"

        if len(secret) < 32 and not allow_insecure:
            raise ValueError("SESSION_SECRET must be at least 32 characters")
        if len(secret) < 16:
            raise ValueError("SESSION_SECRET must be at least 16 characters")

        object.__setattr__(self, "session_secret", secret)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
