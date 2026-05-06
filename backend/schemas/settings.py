from pydantic import BaseModel


class FirmSettingsOut(BaseModel):
    """What the admin can see about the firm's AI configuration.

    We intentionally never return the key itself — only whether one is stored.
    The frontend uses `has_custom_key` to show a masked placeholder so the
    admin knows they don't need to re-enter the key after a page refresh.
    """

    ai_provider: str       # "anthropic" | "openai"
    has_custom_key: bool   # True iff ai_api_key_encrypted is set


class AiProviderUpdate(BaseModel):
    provider: str          # "anthropic" | "openai"


class AiKeyUpdate(BaseModel):
    api_key: str           # plaintext — encrypted server-side with Fernet
                           # empty string → clear the stored key
