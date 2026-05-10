from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Project, Task, TaskLog, TimeLog, User
from schemas.task import (
    TaskCreate,
    TaskLogCreate,
    TaskLogOut,
    TaskOut,
    TaskUpdate,
    TimeLogCreate,
    TimeLogOut,
    TimeLogTotalOut,
)
from services import auth_service, knowledge_graph_service, memory_pipeline

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _load_task(db: OrmSession, task_id: UUID, firm_id: UUID) -> Task:
    task = (
        db.query(Task)
        .join(Project, Task.project_id == Project.id)
        .filter(Task.id == task_id, Project.firm_id == firm_id)
        .first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Task:
    project = (
        db.query(Project)
        .filter(Project.id == payload.project_id, Project.firm_id == user.firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    task = Task(**payload.model_dump())
    db.add(task)
    db.flush()
    knowledge_graph_service.on_task_created(db, task)
    db.commit()
    db.refresh(task)

    # Background: embed task into the creator's personal memory so task
    # context surfaces in future Vitruvius conversations.
    background_tasks.add_task(
        memory_pipeline.embed_task,
        task_id=task.id,
        user_id=user.id,
        title=task.title,
        description=getattr(task, "description", None),
    )

    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Task:
    task = _load_task(db, task_id, user.firm_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    task = _load_task(db, task_id, user.firm_id)
    db.delete(task)
    db.commit()
    return None


@router.post("/{task_id}/log", response_model=TaskLogOut, status_code=status.HTTP_201_CREATED)
def log_work(
    task_id: UUID,
    payload: TaskLogCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> TaskLog:
    """Log a block of work against a task (Revit plugin Quick Task Logger)."""
    task = _load_task(db, task_id, user.firm_id)
    entry = TaskLog(
        task_id=task.id,
        user_id=user.id,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        logged_at=payload.logged_at or datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/my", response_model=list[TaskOut])
def my_tasks(
    project_id: UUID | None = None,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Task]:
    """Return tasks assigned to the current user, optionally filtered by project."""
    q = (
        db.query(Task)
        .join(Project, Task.project_id == Project.id)
        .filter(
            Project.firm_id == user.firm_id,
            Task.assigned_user_id == user.id,
        )
    )
    if project_id:
        q = q.filter(Task.project_id == project_id)
    return q.order_by(Task.due_date.asc().nullslast()).limit(20).all()


# ── Timer-based time log endpoints ─────────────────────────────────────────────

@router.post(
    "/{task_id}/timelog",
    response_model=TimeLogOut,
    status_code=status.HTTP_201_CREATED,
)
def create_timelog(
    task_id: UUID,
    payload: TimeLogCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> TimeLog:
    """Record a timed work session (started_at → ended_at) for a task."""
    task = _load_task(db, task_id, user.firm_id)
    entry = TimeLog(
        task_id=task.id,
        user_id=user.id,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    # Attach user name for frontend display
    out = TimeLogOut.model_validate(entry)
    out.user_name = user.name
    return out


@router.get("/{task_id}/timelogs", response_model=list[TimeLogOut])
def list_timelogs(
    task_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[TimeLogOut]:
    """Return all time log entries for a task, newest first."""
    task = _load_task(db, task_id, user.firm_id)
    rows = (
        db.query(TimeLog, User.name.label("user_name"))
        .join(User, TimeLog.user_id == User.id)
        .filter(TimeLog.task_id == task.id)
        .order_by(TimeLog.started_at.desc())
        .all()
    )
    result = []
    for tl, uname in rows:
        out = TimeLogOut.model_validate(tl)
        out.user_name = uname
        result.append(out)
    return result


@router.get("/{task_id}/timelogs/total", response_model=TimeLogTotalOut)
def timelogs_total(
    task_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> TimeLogTotalOut:
    """Return the sum of all logged minutes for a task."""
    task = _load_task(db, task_id, user.firm_id)
    total = (
        db.query(func.coalesce(func.sum(TimeLog.duration_minutes), 0))
        .filter(TimeLog.task_id == task.id)
        .scalar()
    )
    return TimeLogTotalOut(task_id=task.id, total_minutes=int(total))
