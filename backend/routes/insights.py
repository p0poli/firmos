from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Firm, Insight, Project, User
from schemas.insight import InsightOut
from services import ai_service, auth_service

router = APIRouter(prefix="/insights", tags=["insights"])

# Order matters: /recent, /firm/, /generate/{id}, /ask must all be
# declared before /{project_id} so FastAPI doesn't try to parse those
# segments as UUIDs.


# --- response shapes ------------------------------------------------------


class InsightWithProjectOut(BaseModel):
    """Same as InsightOut, plus the project name for the firm-wide view."""

    id: UUID
    type: str
    content: str
    timestamp: str
    project_id: UUID
    project_name: str

    model_config = ConfigDict(from_attributes=True)


class AskRequest(BaseModel):
    prompt: str
    project_ids: Optional[list[UUID]] = None


class AskResponse(BaseModel):
    answer: str
    used_provider: str
    used_key_source: str  # "firm" | "env" | "none"


# --- list / firm-wide ----------------------------------------------------


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


@router.get("/firm/", response_model=list[InsightWithProjectOut])
def firm_insights(
    limit: int = Query(default=50, ge=1, le=200),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_admin),
) -> list[InsightWithProjectOut]:
    """Every insight across the firm, with the project name joined in.

    Admin only — used by the AdminDashboard recent-insights row.
    """
    rows = (
        db.query(Insight, Project.name.label("project_name"))
        .join(Project, Insight.project_id == Project.id)
        .filter(Project.firm_id == user.firm_id)
        .order_by(Insight.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        InsightWithProjectOut(
            id=i.id,
            type=i.type.value if i.type else "",
            content=i.content,
            timestamp=i.timestamp.isoformat() if i.timestamp else "",
            project_id=i.project_id,
            project_name=project_name,
        )
        for i, project_name in rows
    ]


# --- generation ----------------------------------------------------------


@router.post("/generate/{project_id}", response_model=list[InsightOut])
async def generate(
    project_id: UUID,
    type: Optional[str] = Query(
        default=None,
        description=(
            "Insight type to generate: progress_summary | delay_risk | "
            "bottleneck. Omit for back-compat behaviour (progress + "
            "delay_risk if a deadline exists)."
        ),
    ),
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

    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()

    if type is None:
        insights = await ai_service.generate_insights(db, project_id)
    else:
        if type not in ai_service.INSIGHT_PROMPTS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown insight type '{type}'. Expected: "
                    f"{', '.join(ai_service.INSIGHT_PROMPTS)}"
                ),
            )
        insights = [await ai_service.generate_insight(db, firm, user, project, type)]

    db.commit()
    return insights


@router.post("/ask", response_model=AskResponse)
async def ask_vitruvius(
    payload: AskRequest,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> AskResponse:
    """Free-form chat with the AI — context-aware, memory-enriched, ephemeral.

    The answer is returned to the caller and not persisted (no Insight row
    is created). Pass `project_ids` to scope the context to one or more
    projects. The prompt is used as the semantic query for memory retrieval.
    """
    if not payload.prompt or not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()
    result = await ai_service.ask(
        db,
        firm,
        user,
        prompt=payload.prompt,
        project_ids=payload.project_ids or [],
    )
    return AskResponse(**result)


# --- per-project list (must come last so the named routes win) -----------


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
