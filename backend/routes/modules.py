"""Firm-module on/off API.

Module rows are pre-created for every known module key when a firm is
seeded (see seed._ensure_firm_modules). The frontend reads the full set
on login and caches it; the PATCH endpoint flips a row's is_active and
stamps activated_at when turning a module on.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import FirmModule, MODULE_KEYS, User
from schemas.module import FirmModuleCheck, FirmModuleOut, FirmModuleUpdate
from services import auth_service

router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("/", response_model=list[FirmModuleOut])
def list_modules(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[FirmModule]:
    """Every module row for the caller's firm.

    Always returns one row per known module key (seed guarantees this).
    Inactive modules return is_active=False rather than being absent —
    keeps the frontend gating logic uniform.
    """
    return (
        db.query(FirmModule)
        .filter(FirmModule.firm_id == user.firm_id)
        .order_by(FirmModule.module_key)
        .all()
    )


@router.patch("/{module_key}", response_model=FirmModuleOut)
def toggle_module(
    module_key: str,
    payload: FirmModuleUpdate,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_admin),
) -> FirmModule:
    """Flip a module's is_active flag. Admin only.

    Stamps activated_at on a False -> True transition; leaves it alone
    on a True -> False transition so the original activation timestamp
    survives a deactivate / reactivate cycle.
    """
    if module_key not in MODULE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown module key '{module_key}'",
        )
    row = (
        db.query(FirmModule)
        .filter(
            FirmModule.firm_id == user.firm_id,
            FirmModule.module_key == module_key,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        )

    if payload.is_active and not row.is_active:
        row.activated_at = datetime.utcnow()
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)
    return row


@router.get("/check/{module_key}", response_model=FirmModuleCheck)
def check_module(
    module_key: str,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> FirmModuleCheck:
    """Quick yes/no check for a single module — used for ad-hoc gating.

    For the dashboard we prefer the bulk /modules/ cached at login;
    this endpoint is for spots where we need a fresh signal (e.g.
    after an admin flips a module in another tab).
    """
    if module_key not in MODULE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown module key '{module_key}'",
        )
    row = (
        db.query(FirmModule)
        .filter(
            FirmModule.firm_id == user.firm_id,
            FirmModule.module_key == module_key,
        )
        .first()
    )
    return FirmModuleCheck(active=bool(row and row.is_active))
