from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models import CheckStatus, CheckType, ModelEventType


class ModelEventCreate(BaseModel):
    event_type: ModelEventType
    timestamp: datetime
    duration: Optional[int] = None
    revit_file_name: Optional[str] = None
    revit_version: Optional[str] = None
    project_id: UUID


class ModelEventOut(BaseModel):
    id: UUID
    event_type: ModelEventType
    timestamp: datetime
    duration: Optional[int]
    revit_file_name: Optional[str]
    revit_version: Optional[str]
    project_id: UUID
    user_id: Optional[UUID]

    model_config = ConfigDict(from_attributes=True)


class CheckResultCreate(BaseModel):
    check_type: CheckType
    status: CheckStatus
    issues: list[Any] = []
    timestamp: datetime
    model_event_id: UUID

    model_config = ConfigDict(protected_namespaces=())


class CheckResultOut(BaseModel):
    id: UUID
    check_type: CheckType
    status: CheckStatus
    issues: list[Any]
    timestamp: datetime
    model_event_id: UUID
    user_id: Optional[UUID]

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
