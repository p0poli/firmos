from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import User
from schemas.user import UserCreate, UserOut, UserRoleUpdate
from services import auth_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(auth_service.get_current_user)) -> User:
    return user


@router.get("/", response_model=list[UserOut])
def list_users(
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> list[User]:
    return db.query(User).filter(User.firm_id == admin.firm_id).all()


@router.patch("/{user_id}/role", response_model=UserOut)
def update_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> User:
    """Change a team member's role. Admin only. Cannot change own role."""
    target = (
        db.query(User)
        .filter(User.id == user_id, User.firm_id == admin.firm_id)
        .first()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(
            status_code=400, detail="You cannot change your own role"
        )
    target.role = payload.role
    db.commit()
    db.refresh(target)
    return target


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: OrmSession = Depends(get_db),
    admin: User = Depends(auth_service.get_current_admin),
) -> User:
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=auth_service.hash_password(payload.password),
        role=payload.role,
        firm_id=admin.firm_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
