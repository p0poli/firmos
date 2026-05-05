import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class Firm(Base):
    __tablename__ = "firms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # AI provider preference and the firm's own API key (Fernet-encrypted
    # at rest). When ai_api_key_encrypted is NULL the AI service falls
    # back to the system-wide ANTHROPIC_API_KEY / OPENAI_API_KEY env
    # vars — that's the default for the demo firm.
    ai_provider = Column(String, nullable=False, server_default="anthropic")
    ai_api_key_encrypted = Column(String, nullable=True)

    users = relationship("User", back_populates="firm", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="firm", cascade="all, delete-orphan")
    modules = relationship(
        "FirmModule", back_populates="firm", cascade="all, delete-orphan"
    )
