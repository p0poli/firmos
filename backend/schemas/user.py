from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from models import UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.member


class UserOut(BaseModel):
    id: UUID
    name: str
    email: EmailStr
    role: UserRole
    firm_id: UUID

    model_config = ConfigDict(from_attributes=True)
