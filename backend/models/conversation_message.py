"""ConversationMessage — stores every chat turn for a user.

Privacy rules (enforced at the route layer):
- Always queried with .filter(user_id == current_user.id).
- is_private=True by default; the content never crosses user boundaries.
- The embedding column is used for personal semantic memory search only.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base

try:
    from pgvector.sqlalchemy import Vector as _PGVector
    _VECTOR_TYPE = _PGVector
except ImportError:  # local dev without pgvector installed
    _VECTOR_TYPE = None


def _vec(dim: int):
    if _VECTOR_TYPE is not None:
        return _VECTOR_TYPE(dim)
    from sqlalchemy import Text  # noqa: PLC0415
    return Text()


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # "user" | "assistant"
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    is_private = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # 1 024-dim Voyage AI embedding; NULL until the embedding job completes.
    embedding = Column(_vec(1024), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    project = relationship("Project", foreign_keys=[project_id])
