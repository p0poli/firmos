import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from database import Base


class CheckType(str, enum.Enum):
    compliance = "compliance"
    fire_safety = "fire_safety"
    custom = "custom"


class CheckStatus(str, enum.Enum):
    passed = "pass"
    failed = "fail"
    warning = "warning"


class CheckResult(Base):
    __tablename__ = "check_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    check_type = Column(Enum(CheckType, name="check_type"), nullable=False)
    status = Column(Enum(CheckStatus, name="check_status"), nullable=False)
    issues = Column(JSONB, nullable=False, default=list)
    timestamp = Column(DateTime, nullable=False)

    model_event_id = Column(UUID(as_uuid=True), ForeignKey("model_events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    model_event = relationship("ModelEvent", back_populates="check_results")
    user = relationship("User")
