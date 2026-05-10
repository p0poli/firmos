from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SessionOut(BaseModel):
    id: UUID
    login_time: datetime
    logout_time: Optional[datetime]
    duration: Optional[int]
    user_id: UUID
    active_project_id: Optional[UUID]
    last_seen: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class SessionSetProject(BaseModel):
    project_id: Optional[UUID]


class ActiveSessionOut(BaseModel):
    id: UUID
    login_time: datetime
    user_id: UUID
    user_name: str
    active_project_id: Optional[UUID]
    active_project_name: Optional[str]


class HeartbeatResponse(BaseModel):
    session_id: UUID
    last_seen: datetime


class OnlineUserOut(BaseModel):
    """Enriched presence record returned by GET /sessions/online."""

    user_id: UUID
    user_name: str
    role: str
    active_project_id: Optional[UUID]
    active_project_name: Optional[str]
    login_time: datetime
    last_seen: Optional[datetime]
    # Revit presence: true when the user's most recent ModelEvent is < 30 min old
    in_revit: bool
    last_revit_file: Optional[str]
