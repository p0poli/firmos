from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import File, Insight, Project, ProjectStatus, Task, User
from schemas.file import FileOut
from schemas.insight import InsightOut
from schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from schemas.task import TaskOut
from services import auth_service, knowledge_graph_service

router = APIRouter(prefix="/projects", tags=["projects"])


def _load_project(db: OrmSession, project_id: UUID, firm_id: UUID) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.firm_id == firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/", response_model=list[ProjectOut])
def list_projects(
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Project]:
    q = db.query(Project).filter(Project.firm_id == user.firm_id)
    if status_filter:
        q = q.filter(Project.status == status_filter)
    return q.all()


@router.post("/", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        status=payload.status,
        start_date=payload.start_date,
        deadline=payload.deadline,
        firm_id=user.firm_id,
    )
    if payload.member_ids:
        members = (
            db.query(User)
            .filter(User.id.in_(payload.member_ids), User.firm_id == user.firm_id)
            .all()
        )
        project.members = members
    db.add(project)
    db.flush()
    knowledge_graph_service.on_project_created(db, project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Project:
    return _load_project(db, project_id, user.firm_id)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Project:
    project = _load_project(db, project_id, user.firm_id)
    data = payload.model_dump(exclude_unset=True)
    member_ids = data.pop("member_ids", None)
    for k, v in data.items():
        setattr(project, k, v)
    if member_ids is not None:
        project.members = (
            db.query(User)
            .filter(User.id.in_(member_ids), User.firm_id == user.firm_id)
            .all()
        )
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def project_tasks(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Task]:
    _load_project(db, project_id, user.firm_id)
    return db.query(Task).filter(Task.project_id == project_id).all()


@router.get("/{project_id}/files", response_model=list[FileOut])
def project_files(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[File]:
    _load_project(db, project_id, user.firm_id)
    return db.query(File).filter(File.project_id == project_id).all()


@router.get("/{project_id}/insights", response_model=list[InsightOut])
def project_insights(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Insight]:
    _load_project(db, project_id, user.firm_id)
    return (
        db.query(Insight)
        .filter(Insight.project_id == project_id)
        .order_by(Insight.timestamp.desc())
        .all()
    )
