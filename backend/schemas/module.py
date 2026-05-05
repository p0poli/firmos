from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FirmModuleOut(BaseModel):
    id: UUID
    module_key: str
    is_active: bool
    activated_at: Optional[datetime]
    expires_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class FirmModuleUpdate(BaseModel):
    is_active: bool


class FirmModuleCheck(BaseModel):
    """Lightweight response for GET /modules/check/{module_key}."""

    active: bool
