from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import CheckResult, ModelEvent, Project, User
from schemas.revit import (
    CheckResultCreate,
    CheckResultOut,
    ModelEventCreate,
    ModelEventOut,
)
from services import auth_service, knowledge_graph_service

router = APIRouter(prefix="/revit", tags=["revit"])


@router.post("/event", response_model=ModelEventOut, status_code=status.HTTP_201_CREATED)
def receive_event(
    payload: ModelEventCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> ModelEvent:
    project = (
        db.query(Project)
        .filter(Project.id == payload.project_id, Project.firm_id == user.firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    event = ModelEvent(
        event_type=payload.event_type,
        timestamp=payload.timestamp,
        duration=payload.duration,
        revit_file_name=payload.revit_file_name,
        revit_version=payload.revit_version,
        project_id=payload.project_id,
        user_id=user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.post("/check", response_model=CheckResultOut, status_code=status.HTTP_201_CREATED)
def receive_check(
    payload: CheckResultCreate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> CheckResult:
    event = (
        db.query(ModelEvent)
        .join(Project, ModelEvent.project_id == Project.id)
        .filter(ModelEvent.id == payload.model_event_id, Project.firm_id == user.firm_id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Model event not found")
    check = CheckResult(
        check_type=payload.check_type,
        status=payload.status,
        issues=payload.issues,
        timestamp=payload.timestamp,
        model_event_id=payload.model_event_id,
        user_id=user.id,
    )
    db.add(check)
    db.flush()
    knowledge_graph_service.on_check_result_saved(db, check, event.project_id)
    db.commit()
    db.refresh(check)
    return check


@router.get("/checks/recent", response_model=list[CheckResultOut])
def recent_checks(
    limit: int = Query(default=10, ge=1, le=100),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[CheckResult]:
    return (
        db.query(CheckResult)
        .join(ModelEvent, CheckResult.model_event_id == ModelEvent.id)
        .join(Project, ModelEvent.project_id == Project.id)
        .filter(Project.firm_id == user.firm_id)
        .order_by(CheckResult.timestamp.desc())
        .limit(limit)
        .all()
    )
