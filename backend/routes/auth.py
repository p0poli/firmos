import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Session, User, UserRole
from schemas.auth import LoginRequest, TokenResponse
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/setup-info")
def setup_info(db: OrmSession = Depends(get_db)):
    """Read-only diagnostics: returns the admin email seed() is configured to
    use, whether an admin user exists in the DB, and whether the
    SEED_ADMIN_PASSWORD env var is set (without revealing its value).
    Remove or gate this endpoint before going to production.
    """
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@firmos.dev")
    has_password_override = bool(os.getenv("SEED_ADMIN_PASSWORD"))
    admin_exists = (
        db.query(User)
        .filter(User.email == admin_email, User.role == UserRole.admin)
        .first()
    ) is not None
    # Also report how many admins there are in total
    admin_count = db.query(User).filter(User.role == UserRole.admin).count()
    return {
        "seed_admin_email": admin_email,
        "admin_exists_for_that_email": admin_exists,
        "seed_password_env_override": has_password_override,
        "total_admin_count": admin_count,
    }


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: OrmSession = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not auth_service.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    sess = Session(user_id=user.id, login_time=datetime.utcnow())
    db.add(sess)
    db.commit()
    db.refresh(sess)

    token = auth_service.create_access_token(
        str(user.id), role=user.role.value if user.role else None
    )
    return TokenResponse(access_token=token, session_id=str(sess.id))


@router.post("/logout")
def logout(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    sess = (
        db.query(Session)
        .filter(Session.user_id == user.id, Session.logout_time.is_(None))
        .order_by(Session.login_time.desc())
        .first()
    )
    if sess is None:
        return {"status": "no active session"}
    sess.logout_time = datetime.utcnow()
    sess.duration = int((sess.logout_time - sess.login_time).total_seconds())
    db.commit()
    return {"status": "ok", "session_id": str(sess.id), "duration": sess.duration}
