"""PersonalMemoryChunk — per-user private semantic memory.

Content here is NOT anonymized — it keeps full context for the owner.
Only ever queried with .filter(user_id == current_user.id).
Never exposed to other users or admins.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
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


class PersonalMemoryChunk(Base):
    __tablename__ = "personal_memory_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content = Column(Text, nullable=False)
    # "conversation" | "insight" | "note"
    source_type = Column(String, nullable=False, default="conversation")
    # Points to the originating record (ConversationMessage id, Insight id …)
    source_id = Column(UUID(as_uuid=True), nullable=True)

    embedding = Column(_vec(1024), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
