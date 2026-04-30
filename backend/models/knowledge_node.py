import enum
import uuid

from sqlalchemy import Column, Enum, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from database import Base


class NodeType(str, enum.Enum):
    project = "project"
    task = "task"
    file = "file"
    user = "user"
    regulation = "regulation"
    insight = "insight"
    tag = "tag"


class KnowledgeNode(Base):
    __tablename__ = "knowledge_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_type = Column(Enum(NodeType, name="node_type"), nullable=False)
    reference_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    label = Column(String, nullable=False)
    # Mapped to DB column "metadata"; Python attribute renamed to avoid clash with SQLAlchemy Base.metadata.
    node_metadata = Column("metadata", JSONB, nullable=False, default=dict)
