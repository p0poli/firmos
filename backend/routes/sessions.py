from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Project, Session, User
from schemas.session import ActiveSessionOut, SessionOut, SessionSetProject
from services import auth_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/me", response_model=list[SessionOut])
def my_sessions(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[Session]:
    return (
        db.query(Session)
        .filter(Session.user_id == user.id)
        .order_by(Session.login_time.desc())
        .all()
    )


@router.get("/active", response_model=list[ActiveSessionOut])
def active_sessions(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[ActiveSessionOut]:
    rows = (
        db.query(
            Session,
            User.name.label("user_name"),
            Project.name.label("project_name"),
        )
        .join(User, Session.user_id == User.id)
        .outerjoin(Project, Session.active_project_id == Project.id)
        .filter(User.firm_id == user.firm_id, Session.logout_time.is_(None))
        .order_by(Session.login_time.desc())
        .all()
    )
    return [
        ActiveSessionOut(
            id=s.id,
            login_time=s.login_time,
            user_id=s.user_id,
            user_name=u_name,
            active_project_id=s.active_project_id,
            active_project_name=p_name,
        )
        for s, u_name, p_name in rows
    ]


@router.patch("/{session_id}/project", response_model=SessionOut)
def set_active_project(
    session_id: UUID,
    payload: SessionSetProject,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> Session:
    sess = db.query(Session).filter(Session.id == session_id, Session.user_id == user.id).first()
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.project_id is not None:
        project = (
            db.query(Project)
            .filter(Project.id == payload.project_id, Project.firm_id == user.firm_id)
            .first()
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
    sess.active_project_id = payload.project_id
    db.commit()
    db.refresh(sess)
    return sess
