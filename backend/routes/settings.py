"""Firm-level AI and configuration settings.

Three endpoints, all admin-only:

  GET  /settings/           → FirmSettingsOut
  PATCH /settings/ai-provider → switch anthropic ↔ openai
  PATCH /settings/ai-key    → encrypt + store (or clear) the per-firm API key

The key is never returned — only a `has_custom_key` boolean so the frontend
can show a masked placeholder without revealing the secret.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Firm, User
from schemas.settings import AiKeyUpdate, AiProviderUpdate, FirmSettingsOut
from services import auth_service
from services.encryption import encrypt, is_available

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_PROVIDERS = {"anthropic", "openai"}


# --- helpers ---------------------------------------------------------------


def _get_firm(admin: User, db: OrmSession) -> Firm:
    firm = db.query(Firm).filter(Firm.id == admin.firm_id).first()
    if firm is None:  # should never happen
        raise HTTPException(status_code=404, detail="Firm not found")
    return firm


def _out(firm: Firm) -> FirmSettingsOut:
    return FirmSettingsOut(
        ai_provider=firm.ai_provider or "anthropic",
        has_custom_key=bool(firm.ai_api_key_encrypted),
    )


# --- endpoints -------------------------------------------------------------


@router.get("/", response_model=FirmSettingsOut)
def get_settings(
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> FirmSettingsOut:
    """Return the firm's current AI configuration. Admin only."""
    return _out(_get_firm(admin, db))


@router.patch("/ai-provider", response_model=FirmSettingsOut)
def update_ai_provider(
    payload: AiProviderUpdate,
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> FirmSettingsOut:
    """Switch the firm's AI provider. Admin only."""
    if payload.provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown provider '{payload.provider}'. "
                f"Expected: {', '.join(sorted(VALID_PROVIDERS))}"
            ),
        )
    firm = _get_firm(admin, db)
    firm.ai_provider = payload.provider
    db.commit()
    return _out(firm)


@router.patch("/ai-key", response_model=FirmSettingsOut)
def update_ai_key(
    payload: AiKeyUpdate,
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> FirmSettingsOut:
    """Encrypt and store a per-firm API key. Admin only.

    Pass an empty string to clear the stored key and revert to the
    system-wide env-var fallback.

    Requires ENCRYPTION_KEY to be set in the server environment; returns
    HTTP 400 if the key cannot be encrypted so the caller gets a clear error
    rather than silently storing cleartext.
    """
    firm = _get_firm(admin, db)

    if not payload.api_key:
        # Empty string → clear the custom key, fall back to env var.
        firm.ai_api_key_encrypted = None
    else:
        if not is_available():
            raise HTTPException(
                status_code=400,
                detail=(
                    "Encryption is not configured on this server. "
                    "Set the ENCRYPTION_KEY environment variable to enable "
                    "per-firm API key storage."
                ),
            )
        encrypted = encrypt(payload.api_key)
        if not encrypted:
            raise HTTPException(
                status_code=500, detail="Encryption failed — check server logs."
            )
        firm.ai_api_key_encrypted = encrypted

    db.commit()
    return _out(firm)
