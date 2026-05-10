from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import ModelEvent, Project, Session, User
from schemas.session import (
    ActiveSessionOut,
    HeartbeatResponse,
    OnlineUserOut,
    SessionOut,
    SessionSetProject,
)
from services import auth_service

router = APIRouter(prefix="/sessions", tags=["sessions"])

# Presence thresholds
_ONLINE_CUTOFF_MINUTES = 20   # last_seen must be within this window
_REVIT_CUTOFF_MINUTES  = 30   # ModelEvent must be within this window


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


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> HeartbeatResponse:
    """
    Keeps the user's active session alive.

    - Finds the user's most recent session with logout_time IS NULL.
    - Updates last_seen to now().
    - If no active session exists (e.g. server restart cleared state),
      creates a new one so the user stays "online" seamlessly.

    Called by the frontend every 5 minutes.
    """
    now = datetime.utcnow()
    sess = (
        db.query(Session)
        .filter(Session.user_id == user.id, Session.logout_time.is_(None))
        .order_by(Session.login_time.desc())
        .first()
    )
    if sess is None:
        # Recreate a session so the user remains visible as online.
        sess = Session(user_id=user.id, login_time=now, last_seen=now)
        db.add(sess)
    else:
        sess.last_seen = now
    db.commit()
    db.refresh(sess)
    return HeartbeatResponse(session_id=sess.id, last_seen=sess.last_seen)


@router.get("/online", response_model=list[OnlineUserOut])
def online_users(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[OnlineUserOut]:
    """
    Returns users in the current firm whose session is active
    (logout_time IS NULL) AND have been seen within the last 20 minutes.

    Also indicates whether each user is currently active in Revit
    (most recent ModelEvent < 30 minutes ago).
    """
    now = datetime.utcnow()
    online_cutoff = now - timedelta(minutes=_ONLINE_CUTOFF_MINUTES)
    revit_cutoff  = now - timedelta(minutes=_REVIT_CUTOFF_MINUTES)

    rows = (
        db.query(
            Session,
            User.name.label("user_name"),
            User.role.label("user_role"),
            Project.name.label("project_name"),
        )
        .join(User, Session.user_id == User.id)
        .outerjoin(Project, Session.active_project_id == Project.id)
        .filter(
            User.firm_id == user.firm_id,
            Session.logout_time.is_(None),
            Session.last_seen > online_cutoff,
        )
        .order_by(Session.login_time.desc())
        .all()
    )

    result = []
    for sess, u_name, u_role, p_name in rows:
        # Most recent Revit event for this user
        last_event = (
            db.query(ModelEvent)
            .filter(ModelEvent.user_id == sess.user_id)
            .order_by(ModelEvent.timestamp.desc())
            .first()
        )
        in_revit = (
            last_event is not None
            and last_event.timestamp is not None
            and last_event.timestamp > revit_cutoff
        )
        result.append(
            OnlineUserOut(
                user_id=sess.user_id,
                user_name=u_name,
                role=u_role.value if u_role else "architect",
                active_project_id=sess.active_project_id,
                active_project_name=p_name,
                login_time=sess.login_time,
                last_seen=sess.last_seen,
                in_revit=in_revit,
                last_revit_file=last_event.revit_file_name if in_revit else None,
            )
        )
    return result


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
    sess = (
        db.query(Session)
        .filter(Session.id == session_id, Session.user_id == user.id)
        .first()
    )
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.project_id is not None:
        project = (
            db.query(Project)
            .filter(
                Project.id == payload.project_id,
                Project.firm_id == user.firm_id,
            )
            .first()
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
    sess.active_project_id = payload.project_id
    db.commit()
    db.refresh(sess)
    return sess
