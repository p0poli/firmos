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
