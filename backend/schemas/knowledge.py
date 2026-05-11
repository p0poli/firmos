from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models import NodeType, RelationshipType


class NodeOut(BaseModel):
    id: UUID
    node_type: NodeType
    reference_id: UUID
    label: str
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="node_metadata")
    weight: int = 0
    last_active: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class EdgeOut(BaseModel):
    id: UUID
    source_node_id: UUID
    target_node_id: UUID
    relationship_type: RelationshipType
    label: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GraphOut(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]


class SearchResult(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    focus_node_id: Optional[str] = None


class KnowledgeStats(BaseModel):
    total_nodes: int
    nodes_by_type: dict[str, int]
    edges_count: int
    activity_last_7_days: list[dict[str, Any]]
    last_updated: Optional[datetime]


# ---- My World node types (virtual, not stored) ----------------------------

class WorldNodeOut(BaseModel):
    """A node in the /my-world personal graph.

    node_type is one of: me | project | task | colleague | tag |
                          regulation | insight | knowledge
    """
    id: str
    node_type: str
    label: str
    description: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorldEdgeOut(BaseModel):
    id: str
    source: str
    target: str
    label: str


class WorldGraphOut(BaseModel):
    nodes: list[WorldNodeOut]
    edges: list[WorldEdgeOut]
