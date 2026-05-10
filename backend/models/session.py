import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    login_time = Column(DateTime, nullable=False)
    logout_time = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True)  # seconds, calculated on logout

    # Heartbeat-based presence: updated by POST /sessions/heartbeat every 5 min.
    # Users are considered "online" when logout_time IS NULL AND
    # last_seen > now() - 20 minutes.
    last_seen = Column(DateTime, nullable=True, default=datetime.utcnow)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    active_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

    user = relationship("User", back_populates="sessions")
    active_project = relationship("Project")
