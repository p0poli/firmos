import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


# Known module keys. Stored as a free-form string in the DB so adding a
# new module is a one-line change here; the API only allows toggling
# rows that already exist, and rows are seeded on firm creation.
MODULE_KEYS = (
    "revit_connect",
    "regulations_engine",
    "fire_safety",
    "autocad_connect",
)


class FirmModule(Base):
    __tablename__ = "firm_modules"
    __table_args__ = (
        UniqueConstraint("firm_id", "module_key", name="uq_firm_modules_firm_key"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(
        UUID(as_uuid=True),
        ForeignKey("firms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_key = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=False)
    activated_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    firm = relationship("Firm", back_populates="modules")
