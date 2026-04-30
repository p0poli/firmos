from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import File, Project, User
from schemas.file import FileCreate, FileOut
from services import auth_service, knowledge_graph_service

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/", response_model=FileOut, status_code=status.HTTP_201_CREATED)
def register_file(
    payload: FileCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> File:
    project = (
        db.query(Project)
        .filter(Project.id == payload.project_id, Project.firm_id == user.firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    file = File(
        name=payload.name,
        url=payload.url,
        source=payload.source,
        project_id=payload.project_id,
        uploaded_by=user.id,
    )
    db.add(file)
    db.flush()
    knowledge_graph_service.on_file_registered(db, file)
    db.commit()
    db.refresh(file)
    return file


@router.get("/{file_id}", response_model=FileOut)
def get_file(
    file_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> File:
    file = (
        db.query(File)
        .join(Project, File.project_id == Project.id)
        .filter(File.id == file_id, Project.firm_id == user.firm_id)
        .first()
    )
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file
