from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import User
from schemas.user import UserCreate, UserOut
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
