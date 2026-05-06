"""Fernet-backed encrypt/decrypt for per-firm secrets.

Used by the AI service (read encrypted firm AI key) and by the Settings
API (write a new encrypted firm AI key). Both operations no-op safely
when ENCRYPTION_KEY is unset — encrypt() refuses to run, decrypt()
returns None — so the rest of the system can fall back to env-var keys
without crashing.
"""
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger("uvicorn.error")

_fernet: Optional[Fernet] = None


def _get_fernet() -> Optional[Fernet]:
    """Cached Fernet instance, or None if ENCRYPTION_KEY isn't configured."""
    global _fernet
    if _fernet is not None:
        return _fernet
    key = settings.encryption_key
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        logger.warning("ENCRYPTION_KEY is set but invalid: %s", exc)
        return None
    return _fernet


def is_available() -> bool:
    """True iff encryption is configured — useful for the Settings page
    to surface a 'set ENCRYPTION_KEY' notice."""
    return _get_fernet() is not None


def encrypt(plaintext: str) -> Optional[str]:
    """Encrypt plaintext to a UTF-8 token string.

    Returns None if ENCRYPTION_KEY isn't configured. Callers should
    treat None as a hard error and refuse the operation (we don't want
    to silently store cleartext keys).
    """
    f = _get_fernet()
    if f is None or not plaintext:
        return None
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: Optional[str]) -> Optional[str]:
    """Decrypt a token previously produced by encrypt().

    Returns None if the token is empty, the key isn't configured, or
    the token is malformed (rotated/invalid). Callers fall back to the
    env-var key in any of those cases.
    """
    if not token:
        return None
    f = _get_fernet()
    if f is None:
        return None
    try:
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        logger.warning("Failed to decrypt token: %s", exc)
        return None
