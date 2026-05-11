import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, Enum, String, Text
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
    building_type = "building_type"
    location = "location"
    knowledge = "knowledge"
    insight_topic = "insight_topic"
    technique = "technique"


class KnowledgeNode(Base):
    __tablename__ = "knowledge_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_type = Column(
        Enum(NodeType, name="node_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    reference_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    label = Column(String, nullable=False)
    node_metadata = Column("metadata", JSONB, nullable=False, default=dict)
    description = Column(Text, nullable=True)
    last_active = Column(DateTime, nullable=True)
