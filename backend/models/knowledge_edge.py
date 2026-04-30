import enum
import uuid

from sqlalchemy import Column, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class RelationshipType(str, enum.Enum):
    belongs_to = "belongs_to"
    assigned_to = "assigned_to"
    references = "references"
    tagged_with = "tagged_with"
    relates_to = "relates_to"


class KnowledgeEdge(Base):
    __tablename__ = "knowledge_edges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_node_id = Column(
        UUID(as_uuid=True), ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=False
    )
    target_node_id = Column(
        UUID(as_uuid=True), ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=False
    )
    relationship_type = Column(Enum(RelationshipType, name="relationship_type"), nullable=False)

    source = relationship("KnowledgeNode", foreign_keys=[source_node_id])
    target = relationship("KnowledgeNode", foreign_keys=[target_node_id])
