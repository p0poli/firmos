from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Insight, Project, User
from schemas.insight import InsightOut
from services import ai_service, auth_service

router = APIRouter(prefix="/insights", tags=["insights"])


# Note: /recent and /generate/{id} must be declared before /{project_id}
# so FastAPI doesn't try to parse "recent"/"generate" as a UUID path param.


@router.get("/recent", response_model=list[InsightOut])
def recent_insights(
    limit: int = Query(default=10, ge=1, le=100),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Insight]:
    return (
        db.query(Insight)
        .join(Project, Insight.project_id == Project.id)
        .filter(Project.firm_id == user.firm_id)
        .order_by(Insight.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.post("/generate/{project_id}", response_model=list[InsightOut])
def generate(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Insight]:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.firm_id == user.firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    insights = ai_service.generate_insights(db, project_id)
    db.commit()
    return insights


@router.get("/{project_id}", response_model=list[InsightOut])
def get_insights(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Insight]:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.firm_id == user.firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return (
        db.query(Insight)
        .filter(Insight.project_id == project_id)
        .order_by(Insight.timestamp.desc())
        .all()
    )
