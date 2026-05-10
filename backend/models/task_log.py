import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class TaskLog(Base):
    """Work-log entry: records a block of time spent on a task."""

    __tablename__ = "task_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    duration_minutes = Column(Integer, nullable=False)
    notes = Column(Text, nullable=True)
    logged_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    task = relationship("Task", back_populates="logs")
    user = relationship("User")
