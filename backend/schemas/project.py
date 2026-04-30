from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models import ProjectStatus
from schemas.user import UserOut


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    member_ids: list[UUID] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    member_ids: Optional[list[UUID]] = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    status: ProjectStatus
    start_date: Optional[date]
    deadline: Optional[date]
    firm_id: UUID
    members: list[UserOut] = []

    model_config = ConfigDict(from_attributes=True)
