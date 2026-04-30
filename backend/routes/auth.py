from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import Session, User
from schemas.auth import LoginRequest, TokenResponse
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: OrmSession = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not auth_service.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    sess = Session(user_id=user.id, login_time=datetime.utcnow())
    db.add(sess)
    db.commit()
    db.refresh(sess)

    token = auth_service.create_access_token(str(user.id))
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
