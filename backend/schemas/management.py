from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Team utilization
# ---------------------------------------------------------------------------

class ProjectHoursOut(BaseModel):
    project_id: UUID
    project_name: str
    hours: float


class TeamMemberUtilizationOut(BaseModel):
    user_id: UUID
    user_name: str
    role: str
    total_hours: float
    hours_per_project: list[ProjectHoursOut]
    revit_events_count: int
    tasks_completed: int


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------

class ActivityLogItem(BaseModel):
    timestamp: datetime
    type: str          # "login" | "logout" | "revit_open" | "revit_close" | "revit_sync" | "task_complete"
    user_name: str
    description: str
    project_name: Optional[str]


class ActivityLogResponse(BaseModel):
    items: list[ActivityLogItem]
    next_cursor: Optional[str]   # ISO-8601 timestamp of oldest item, for pagination


# ---------------------------------------------------------------------------
# Project health (for Section 3)
# ---------------------------------------------------------------------------

class ProjectHealthOut(BaseModel):
    project_id: UUID
    project_name: str
    status: str
    tasks_total: int
    tasks_done: int
    deadline: Optional[str]       # ISO date string
    overdue_tasks: int
    member_count: int
    last_revit_activity: Optional[datetime]
