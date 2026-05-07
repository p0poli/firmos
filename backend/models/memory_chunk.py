"""MemoryChunk — the anonymized firm-wide knowledge pool.

Privacy rules:
- content_anonymized has ALL personal identifiers stripped before insert.
- original_message_id and contributed_by_user_id are internal audit columns
  that are NEVER returned by any API endpoint.
- is_active=False (soft-delete) is used for withdrawal; rows are never hard-
  deleted so the audit trail remains intact.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship

from database import Base

try:
    from pgvector.sqlalchemy import Vector as _PGVector
    _VECTOR_TYPE = _PGVector
except ImportError:
    _VECTOR_TYPE = None


def _vec(dim: int):
    if _VECTOR_TYPE is not None:
        return _VECTOR_TYPE(dim)
    from sqlalchemy import Text  # noqa: PLC0415
    return Text()


class MemoryChunk(Base):
    __tablename__ = "memory_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(
        UUID(as_uuid=True),
        ForeignKey("firms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content_anonymized = Column(Text, nullable=False)

    # Internal audit references — never returned by the API.
    original_message_id = Column(UUID(as_uuid=True), nullable=True)
    contributed_by_user_id = Column(UUID(as_uuid=True), nullable=True)

    # "regulation" | "solution" | "process" | "technical" | "general"
    category = Column(String, nullable=False, default="general")
    # Auto-generated topic tags from the anonymization pipeline.
    tags = Column(ARRAY(String), nullable=False, default=list)

    embedding = Column(_vec(1024), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # False after a user withdraws their contribution.
    is_active = Column(Boolean, nullable=False, default=True)

    firm = relationship("Firm", foreign_keys=[firm_id])
