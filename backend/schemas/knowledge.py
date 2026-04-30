from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models import NodeType, RelationshipType


class NodeOut(BaseModel):
    id: UUID
    node_type: NodeType
    reference_id: UUID
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="node_metadata")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class EdgeOut(BaseModel):
    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    relationship_type: RelationshipType

    model_config = ConfigDict(from_attributes=True)


class GraphOut(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]
