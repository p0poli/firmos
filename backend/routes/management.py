"""
Management routes — admin / project_manager only.

Endpoints:
  GET /management/team-utilization?period=week|month
  GET /management/activity-log?limit=50&before=<ISO datetime>
  GET /management/project-health
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import ModelEvent, Project, Session, Task, TaskStatus, User, UserRole
from schemas.management import (
    ActivityLogItem,
    ActivityLogResponse,
    ProjectHealthOut,
    ProjectHoursOut,
    TeamMemberUtilizationOut,
)
from services import auth_service

router = APIRouter(prefix="/management", tags=["management"])


def _require_manager(user: User) -> User:
    """Raise 403 unless the caller is admin or project_manager."""
    if user.role not in (UserRole.admin, UserRole.project_manager):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Management endpoints require admin or project_manager role.",
        )
    return user


def _period_start(period: str) -> datetime:
    if period == "month":
        return datetime.utcnow() - timedelta(days=30)
    return datetime.utcnow() - timedelta(days=7)


# ---------------------------------------------------------------------------
# GET /management/team-utilization
# ---------------------------------------------------------------------------

@router.get("/team-utilization", response_model=list[TeamMemberUtilizationOut])
def team_utilization(
    period: str = Query(default="week", regex="^(week|month)$"),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[TeamMemberUtilizationOut]:
    _require_manager(user)
    now = datetime.utcnow()
    start = _period_start(period)

    # All users in the firm
    firm_users = (
        db.query(User)
        .filter(User.firm_id == user.firm_id)
        .order_by(User.name)
        .all()
    )

    # Sessions in period for the whole firm
    sessions_in_period = (
        db.query(Session)
        .join(User, Session.user_id == User.id)
        .filter(
            User.firm_id == user.firm_id,
            Session.login_time >= start,
        )
        .all()
    )

    # ModelEvents in period
    events_in_period = (
        db.query(ModelEvent)
        .join(Project, ModelEvent.project_id == Project.id)
        .filter(
            Project.firm_id == user.firm_id,
            ModelEvent.timestamp >= start,
        )
        .all()
    )

    # Tasks marked done (no completion timestamp — count current status)
    done_tasks = (
        db.query(Task)
        .join(Project, Task.project_id == Project.id)
        .filter(
            Project.firm_id == user.firm_id,
            Task.status == TaskStatus.done,
        )
        .all()
    )

    # Load all projects for name lookup
    projects = db.query(Project).filter(Project.firm_id == user.firm_id).all()
    project_names = {p.id: p.name for p in projects}

    result = []
    for u in firm_users:
        user_sessions = [s for s in sessions_in_period if s.user_id == u.id]

        # Total hours: use stored duration for completed sessions;
        # for the still-active session compute elapsed time.
        total_seconds = 0.0
        project_seconds: dict = {}
        for s in user_sessions:
            if s.logout_time is not None and s.duration is not None:
                secs = float(s.duration)
            elif s.logout_time is None:
                # Ongoing session
                secs = max(0.0, (now - s.login_time).total_seconds())
            else:
                secs = 0.0
            total_seconds += secs
            if s.active_project_id:
                project_seconds[s.active_project_id] = (
                    project_seconds.get(s.active_project_id, 0.0) + secs
                )

        hours_per_project = [
            ProjectHoursOut(
                project_id=pid,
                project_name=project_names.get(pid, "Unknown"),
                hours=round(secs / 3600, 1),
            )
            for pid, secs in project_seconds.items()
            if secs > 0
        ]

        revit_events_count = sum(
            1 for e in events_in_period if e.user_id == u.id
        )
        tasks_completed = sum(
            1 for t in done_tasks if t.assigned_user_id == u.id
        )

        result.append(
            TeamMemberUtilizationOut(
                user_id=u.id,
                user_name=u.name,
                role=u.role.value if u.role else "architect",
                total_hours=round(total_seconds / 3600, 1),
                hours_per_project=hours_per_project,
                revit_events_count=revit_events_count,
                tasks_completed=tasks_completed,
            )
        )

    result.sort(key=lambda r: r.total_hours, reverse=True)
    return result


# ---------------------------------------------------------------------------
# GET /management/activity-log
# ---------------------------------------------------------------------------

_REVIT_EVENT_TYPE_MAP = {
    "opened":    "revit_open",
    "closed":    "revit_close",
    "synced":    "revit_sync",
    "check_run": "revit_sync",
}


@router.get("/activity-log", response_model=ActivityLogResponse)
def activity_log(
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[datetime] = Query(default=None),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> ActivityLogResponse:
    _require_manager(user)

    # ---- Gather all projects for name lookup ---------------------------------
    projects = db.query(Project).filter(Project.firm_id == user.firm_id).all()
    project_names = {p.id: p.name for p in projects}

    # ---- All firm users for name lookup -------------------------------------
    firm_user_ids = {u.id for u in db.query(User.id).filter(User.firm_id == user.firm_id).all()}
    firm_users = db.query(User).filter(User.firm_id == user.firm_id).all()
    user_names = {u.id: u.name for u in firm_users}

    # ---- Session events (login + logout) ------------------------------------
    session_q = (
        db.query(Session)
        .join(User, Session.user_id == User.id)
        .filter(User.firm_id == user.firm_id)
    )
    if before:
        # Include sessions where login_time < before OR logout_time < before
        session_q = session_q.filter(Session.login_time < before)

    sessions = session_q.all()

    items: list[ActivityLogItem] = []

    for s in sessions:
        u_name = user_names.get(s.user_id, "Unknown")
        items.append(
            ActivityLogItem(
                timestamp=s.login_time,
                type="login",
                user_name=u_name,
                description=f"{u_name} logged in",
                project_name=None,
            )
        )
        if s.logout_time and (before is None or s.logout_time < before):
            items.append(
                ActivityLogItem(
                    timestamp=s.logout_time,
                    type="logout",
                    user_name=u_name,
                    description=f"{u_name} logged out"
                    + (f" after {round(s.duration / 3600, 1)}h" if s.duration else ""),
                    project_name=None,
                )
            )

    # ---- Revit model events -------------------------------------------------
    event_q = (
        db.query(ModelEvent)
        .join(Project, ModelEvent.project_id == Project.id)
        .filter(Project.firm_id == user.firm_id)
    )
    if before:
        event_q = event_q.filter(ModelEvent.timestamp < before)

    for e in event_q.all():
        evt_type = _REVIT_EVENT_TYPE_MAP.get(
            e.event_type.value if hasattr(e.event_type, "value") else e.event_type,
            "revit_sync",
        )
        u_name = user_names.get(e.user_id, "Unknown")
        file_part = f" — {e.revit_file_name}" if e.revit_file_name else ""
        verb = {
            "revit_open":  "opened",
            "revit_close": "closed",
            "revit_sync":  "synced",
        }.get(evt_type, "updated")
        p_name = project_names.get(e.project_id)
        items.append(
            ActivityLogItem(
                timestamp=e.timestamp,
                type=evt_type,
                user_name=u_name,
                description=f"{u_name} {verb} Revit model{file_part}",
                project_name=p_name,
            )
        )

    # ---- Sort, paginate -----------------------------------------------------
    items.sort(key=lambda i: i.timestamp, reverse=True)
    paginated = items[:limit]
    next_cursor = (
        paginated[-1].timestamp.isoformat() if len(paginated) == limit else None
    )

    return ActivityLogResponse(items=paginated, next_cursor=next_cursor)


# ---------------------------------------------------------------------------
# GET /management/project-health
# ---------------------------------------------------------------------------

@router.get("/project-health", response_model=list[ProjectHealthOut])
def project_health(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[ProjectHealthOut]:
    _require_manager(user)

    projects = (
        db.query(Project)
        .filter(Project.firm_id == user.firm_id, Project.status == "active")
        .order_by(Project.name)
        .all()
    )

    today = datetime.utcnow().date()
    result = []
    for p in projects:
        tasks = (
            db.query(Task).filter(Task.project_id == p.id).all()
        )
        tasks_total = len(tasks)
        tasks_done = sum(1 for t in tasks if t.status == TaskStatus.done)
        overdue_tasks = sum(
            1 for t in tasks
            if t.status != TaskStatus.done
            and t.due_date is not None
            and t.due_date < today
        )
        member_count = len(p.members) if p.members else 0

        # Most recent Revit event for this project
        last_event = (
            db.query(ModelEvent)
            .filter(ModelEvent.project_id == p.id)
            .order_by(ModelEvent.timestamp.desc())
            .first()
        )

        result.append(
            ProjectHealthOut(
                project_id=p.id,
                project_name=p.name,
                status=p.status.value if hasattr(p.status, "value") else p.status,
                tasks_total=tasks_total,
                tasks_done=tasks_done,
                deadline=str(p.deadline) if p.deadline else None,
                overdue_tasks=overdue_tasks,
                member_count=member_count,
                last_revit_activity=last_event.timestamp if last_event else None,
            )
        )

    return result
