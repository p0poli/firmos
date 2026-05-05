"""Idempotent seed: creates a Firm + admin User so the system can be logged into.

Run inside the backend container after migrations:
    docker compose exec backend python seed.py

Override defaults with env vars: SEED_FIRM_NAME, SEED_ADMIN_EMAIL,
SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
"""
import os
from datetime import datetime

from database import SessionLocal
from models import Firm, FirmModule, MODULE_KEYS, User, UserRole
from services.auth_service import hash_password


def ensure_firm_modules(db, firm) -> int:
    """Create any missing FirmModule rows for a firm.

    Idempotent: safe to call on every seed run. Returns the number of
    rows actually inserted (0 means everything was already present).
    All rows start with is_active=False; populate_demo flips
    revit_connect on for the demo firm specifically.
    """
    existing = {
        row.module_key
        for row in db.query(FirmModule.module_key)
        .filter(FirmModule.firm_id == firm.id)
        .all()
    }
    inserted = 0
    for key in MODULE_KEYS:
        if key in existing:
            continue
        db.add(FirmModule(firm_id=firm.id, module_key=key, is_active=False))
        inserted += 1
    if inserted > 0:
        db.flush()
    return inserted


def seed() -> None:
    firm_name = os.getenv("SEED_FIRM_NAME", "Demo Firm")
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@firmos.dev")
    admin_password = os.getenv("SEED_ADMIN_PASSWORD", "admin")
    admin_name = os.getenv("SEED_ADMIN_NAME", "Admin")

    db = SessionLocal()
    try:
        firm = db.query(Firm).filter(Firm.name == firm_name).first()
        if firm is None:
            firm = Firm(name=firm_name, created_at=datetime.utcnow())
            db.add(firm)
            db.flush()
            print(f"Created firm: {firm.name} ({firm.id})")
        else:
            print(f"Firm exists: {firm.name} ({firm.id})")

        # Ensure module rows exist for this firm — runs every seed, fills
        # in any module keys added since the last run.
        added = ensure_firm_modules(db, firm)
        if added > 0:
            print(f"[modules] added {added} missing module row(s)")

        admin = db.query(User).filter(User.email == admin_email).first()
        if admin is None:
            admin = User(
                name=admin_name,
                email=admin_email,
                hashed_password=hash_password(admin_password),
                role=UserRole.admin,
                firm_id=firm.id,
            )
            db.add(admin)
            db.commit()
            print(f"Created admin: {admin_email} (password: {admin_password})")
        else:
            db.commit()
            print(f"Admin exists: {admin_email}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
