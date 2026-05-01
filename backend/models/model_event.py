import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class ModelEventType(str, enum.Enum):
    opened = "opened"
    synced = "synced"
    closed = "closed"
    check_run = "check_run"


class ModelEvent(Base):
    __tablename__ = "model_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(
        Enum(ModelEventType, name="model_event_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    timestamp = Column(DateTime, nullable=False)
    duration = Column(Integer, nullable=True)  # seconds
    revit_file_name = Column(String, nullable=True)
    revit_version = Column(String, nullable=True)

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    project = relationship("Project", back_populates="model_events")
    user = relationship("User")
    check_results = relationship("CheckResult", back_populates="model_event", cascade="all, delete-orphan")
