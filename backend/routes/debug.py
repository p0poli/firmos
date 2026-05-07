"""Temporary diagnostic endpoint — remove before production.

GET /debug/my-role
  Requires a valid Bearer token. Returns every representation of the
  caller's role so we can pinpoint exactly what the database holds vs
  what the ORM is returning.
"""
import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from database import SessionLocal, get_db
from models import User
from services import auth_service

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/my-role")
def my_role(
    current_user: User = Depends(auth_service.get_current_user),
    db: OrmSession = Depends(get_db),
):
    email = current_user.email

    # 1. ORM object as returned by get_current_user (may be cached in session)
    orm_role = current_user.role
    orm_role_repr = repr(orm_role)
    orm_role_value = orm_role.value if orm_role else None
    orm_role_type = type(orm_role).__name__

    # 2. Fresh ORM query in the *same* request session (bypasses identity map
    #    by using db.get with a new load — expire first)
    db.expire(current_user)
    refreshed = db.query(User).filter(User.email == email).first()
    refreshed_role = refreshed.role if refreshed else None
    refreshed_role_repr = repr(refreshed_role)
    refreshed_role_value = refreshed_role.value if refreshed_role else None

    # 3. Fresh ORM query in a *brand-new* session (zero connection to request)
    fresh_db = SessionLocal()
    try:
        fresh_user = fresh_db.query(User).filter(User.email == email).first()
        fresh_role = fresh_user.role if fresh_user else None
        fresh_role_repr = repr(fresh_role)
        fresh_role_value = fresh_role.value if fresh_role else None
    finally:
        fresh_db.close()

    # 4. Raw SQL — bypasses the ORM enum mapping entirely
    raw = db.execute(
        sa.text("SELECT role FROM users WHERE email = :email"),
        {"email": email},
    ).fetchone()
    raw_role_string = raw[0] if raw else None

    # 5. Raw SQL in a fresh connection
    fresh_db2 = SessionLocal()
    try:
        raw2 = fresh_db2.execute(
            sa.text("SELECT role::text FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()
        raw_role_string_fresh = raw2[0] if raw2 else None
    finally:
        fresh_db2.close()

    return {
        "email": email,
        "user_id": str(current_user.id),
        "orm_via_dependency": {
            "role_repr": orm_role_repr,
            "role_value": orm_role_value,
            "role_type": orm_role_type,
        },
        "orm_same_session_after_expire": {
            "role_repr": refreshed_role_repr,
            "role_value": refreshed_role_value,
        },
        "orm_fresh_session": {
            "role_repr": fresh_role_repr,
            "role_value": fresh_role_value,
        },
        "raw_sql_same_session": raw_role_string,
        "raw_sql_fresh_session": raw_role_string_fresh,
    }
