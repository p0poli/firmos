from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Project, Task, User
from schemas.task import TaskCreate, TaskOut, TaskUpdate
from services import auth_service, knowledge_graph_service

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
