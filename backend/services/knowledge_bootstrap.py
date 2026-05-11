"""Bootstrap the knowledge graph from existing operational data.

Run once (idempotent) during lifespan to seed concept nodes and the
semantic edges that connect them.  Also backfills connectivity from
operational data so no node is isolated.

Philosophy:
  - Every run is safe to re-run (idempotent).
  - Concept nodes use deterministic UUIDs (uuid5) so they're stable
    across restarts.
  - We build concept→concept edges directly so the /knowledge/web
    endpoint (which only returns WEB_TYPE nodes + edges) shows a
    connected graph, not isolated dots.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from itertools import combinations

from database import SessionLocal
from models import (
    CheckResult,
    KnowledgeEdge,
    KnowledgeNode,
    MemoryChunk,
    NodeType,
    RelationshipType,
    Tag,
    TagCategory,
)
from services.knowledge_graph_service import _add_edge, _get_or_create_node

logger = logging.getLogger("uvicorn.error")

# Node types that appear in /knowledge/web
_WEB_TYPES = {
    NodeType.tag,
    NodeType.regulation,
    NodeType.building_type,
    NodeType.location,
    NodeType.knowledge,
    NodeType.insight_topic,
    NodeType.technique,
}

NS = uuid.NAMESPACE_DNS  # namespace for deterministic UUIDs


def _ref(node_type: NodeType, label: str) -> uuid.UUID:
    """Deterministic UUID for a concept node so bootstrap is idempotent."""
    return uuid.uuid5(NS, f"{node_type.value}:{label.lower()}")


def bootstrap_knowledge() -> None:
    db = SessionLocal()
    try:
        _bootstrap(db)
    except Exception as e:
        logger.warning("knowledge_bootstrap failed: %s", e)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _bootstrap(db) -> None:
    now = datetime.utcnow()

    # 1. Seed rich architectural concept nodes
    nodes = _seed_concepts(db, now)

    # 2. Create semantic edges between related concepts
    _seed_semantic_edges(db, nodes)

    # 3. Backfill from operational data (checks, tags, memory)
    _seed_from_checks(db, now, nodes)
    _seed_from_tags(db, now, nodes)
    _seed_from_memory(db, now)

    # 4. Connect concept nodes that appear on the same project
    _connect_shared_project_concepts(db)

    # 5. Ensure every node has at least one connection
    _connect_isolated_nodes(db, nodes)

    db.commit()
    logger.info("knowledge_bootstrap: complete")


# ---------------------------------------------------------------------------
# 1. Rich concept vocabulary for an architectural firm
# ---------------------------------------------------------------------------

def _seed_concepts(db, now: datetime) -> dict[str, KnowledgeNode]:
    """Create a vocabulary of architectural concept nodes.

    Returns a dict of {label_lower: KnowledgeNode} for all created nodes.
    """
    concept_spec: list[tuple[NodeType, list[str]]] = [
        # --- Building types ---
        (NodeType.building_type, [
            "Hospital",
            "School",
            "Office Tower",
            "Tram Depot",
            "Library",
            "Residential",
            "Mixed-Use",
        ]),
        # --- Locations ---
        (NodeType.location, [
            "Oslo",
            "Bryggen",
            "Riverside",
            "Sundby",
            "Kvartal",
        ]),
        # --- Regulations ---
        (NodeType.regulation, [
            "Fire Safety",
            "Structural Compliance",
            "Accessibility (UU)",
            "Planning Permission",
            "Environmental Impact",
            "Building Code (TEK17)",
            "Energy Requirements",
        ]),
        # --- Techniques ---
        (NodeType.technique, [
            "BIM Coordination",
            "MEP Design",
            "Structural Analysis",
            "Facade Engineering",
            "Renovation",
            "Acoustic Design",
            "Civil Engineering",
            "Foundation Design",
        ]),
        # --- Tags ---
        (NodeType.tag, [
            "HVAC",
            "Structural Drawings",
            "Building Permits",
            "Curtain Wall",
            "Foundation",
            "Roof Structure",
            "Drainage",
            "Electrical Infrastructure",
            "Zoning",
            "Sustainability",
            "Wind Load",
            "Seismic",
            "Concrete",
            "Steel",
            "Facade Panels",
        ]),
        # --- Knowledge / memory ---
        (NodeType.knowledge, [
            "Fire Egress Planning",
            "Seismic Resistance",
            "Thermal Performance",
            "Acoustic Requirements",
            "Load Bearing Calculations",
            "Material Specifications",
            "Construction Phasing",
            "Daylighting Standards",
        ]),
    ]

    result: dict[str, KnowledgeNode] = {}
    for node_type, labels in concept_spec:
        for label in labels:
            ref_id = _ref(node_type, label)
            node = _get_or_create_node(db, node_type, ref_id, label)
            if node.last_active is None:
                node.last_active = now
            result[label.lower()] = node

    db.flush()
    return result


# ---------------------------------------------------------------------------
# 2. Semantic edges
# ---------------------------------------------------------------------------

def _seed_semantic_edges(db, nodes: dict[str, KnowledgeNode]) -> None:
    """Create meaningful edges between related concept nodes."""

    def link(a: str, b: str) -> None:
        na = nodes.get(a.lower())
        nb = nodes.get(b.lower())
        if na and nb and na.id != nb.id:
            _add_edge(db, na, nb, RelationshipType.relates_to)

    # Regulation ↔ Regulation
    link("Fire Safety",            "Building Code (TEK17)")
    link("Accessibility (UU)",     "Building Code (TEK17)")
    link("Energy Requirements",    "Building Code (TEK17)")
    link("Energy Requirements",    "Environmental Impact")
    link("Structural Compliance",  "Building Code (TEK17)")
    link("Planning Permission",    "Environmental Impact")

    # Building type ↔ Regulation
    link("Hospital",    "Fire Safety")
    link("Hospital",    "Accessibility (UU)")
    link("Hospital",    "Structural Compliance")
    link("School",      "Fire Safety")
    link("School",      "Accessibility (UU)")
    link("Office Tower","Planning Permission")
    link("Office Tower","Structural Compliance")
    link("Office Tower","Fire Safety")
    link("Tram Depot",  "Environmental Impact")
    link("Tram Depot",  "Civil Engineering")
    link("Library",     "Accessibility (UU)")
    link("Residential", "Planning Permission")
    link("Residential", "Energy Requirements")
    link("Mixed-Use",   "Planning Permission")

    # Building type ↔ Technique
    link("Hospital",    "MEP Design")
    link("Hospital",    "Renovation")
    link("Hospital",    "BIM Coordination")
    link("Office Tower","Facade Engineering")
    link("Office Tower","Foundation Design")
    link("Office Tower","BIM Coordination")
    link("Tram Depot",  "Foundation Design")
    link("Tram Depot",  "Roof Structure")
    link("School",      "Acoustic Design")

    # Technique ↔ Regulation
    link("Structural Analysis", "Structural Compliance")
    link("Facade Engineering",  "Building Code (TEK17)")
    link("MEP Design",          "Energy Requirements")
    link("Civil Engineering",   "Environmental Impact")
    link("Foundation Design",   "Structural Compliance")
    link("Acoustic Design",     "Building Code (TEK17)")

    # Technique ↔ Tag
    link("BIM Coordination",   "Structural Drawings")
    link("MEP Design",         "HVAC")
    link("MEP Design",         "Electrical Infrastructure")
    link("Facade Engineering", "Curtain Wall")
    link("Facade Engineering", "Facade Panels")
    link("Facade Engineering", "Wind Load")
    link("Civil Engineering",  "Drainage")
    link("Civil Engineering",  "Foundation")
    link("Foundation Design",  "Concrete")
    link("Foundation Design",  "Foundation")
    link("Structural Analysis","Concrete")
    link("Structural Analysis","Steel")
    link("Structural Analysis","Wind Load")
    link("Structural Analysis","Seismic")
    link("Renovation",         "Structural Drawings")
    link("Renovation",         "Building Permits")
    link("Acoustic Design",    "Acoustic Requirements")

    # Tag ↔ Tag (demo clusters)
    link("HVAC",                "Electrical Infrastructure")
    link("Curtain Wall",        "Facade Panels")
    link("Curtain Wall",        "Wind Load")
    link("Concrete",            "Steel")
    link("Concrete",            "Foundation")
    link("Foundation",          "Seismic")
    link("Building Permits",    "Zoning")
    link("Zoning",              "Planning Permission")
    link("Sustainability",      "Energy Requirements")

    # Tag ↔ Regulation
    link("Building Permits",    "Planning Permission")
    link("Roof Structure",      "Structural Compliance")
    link("Roof Structure",      "Fire Safety")
    link("Seismic",             "Structural Compliance")

    # Location ↔ Building type
    link("Bryggen",   "Hospital")
    link("Riverside", "Tram Depot")
    link("Sundby",    "School")
    link("Oslo",      "Office Tower")
    link("Oslo",      "Mixed-Use")
    link("Kvartal",   "Office Tower")

    # Knowledge ↔ Technique/Regulation
    link("Fire Egress Planning",     "Fire Safety")
    link("Fire Egress Planning",     "Building Code (TEK17)")
    link("Seismic Resistance",       "Structural Analysis")
    link("Seismic Resistance",       "Structural Compliance")
    link("Thermal Performance",      "Energy Requirements")
    link("Acoustic Requirements",    "Acoustic Design")
    link("Acoustic Requirements",    "Building Code (TEK17)")
    link("Load Bearing Calculations","Structural Analysis")
    link("Material Specifications",  "Structural Compliance")
    link("Material Specifications",  "Facade Engineering")
    link("Construction Phasing",     "Civil Engineering")
    link("Daylighting Standards",    "Building Code (TEK17)")
    link("Daylighting Standards",    "Energy Requirements")

    # Knowledge ↔ Tag
    link("Seismic Resistance",       "Seismic")
    link("Load Bearing Calculations","Concrete")
    link("Load Bearing Calculations","Steel")
    link("Material Specifications",  "Curtain Wall")

    db.flush()


# ---------------------------------------------------------------------------
# 3. Backfill from operational data
# ---------------------------------------------------------------------------

def _seed_from_checks(db, now: datetime, nodes: dict[str, KnowledgeNode]) -> None:
    """Seed regulation nodes from existing CheckResult check_types."""
    check_types = db.query(CheckResult.check_type).distinct().all()
    for (ct,) in check_types:
        ref_id = uuid.uuid5(NS, f"regulation:{ct.value}")
        node = _get_or_create_node(
            db, NodeType.regulation, ref_id,
            ct.value.replace("_", " ").title()
        )
        if node.last_active is None:
            node.last_active = now
        nodes[node.label.lower()] = node

        # Connect check-based regulation to canonical regulation nodes
        _try_connect_regulation(db, node, nodes)

    db.flush()


def _try_connect_regulation(db, reg_node: KnowledgeNode, nodes: dict) -> None:
    """Connect a regulation node to semantically related canonical nodes."""
    label = reg_node.label.lower()
    keyword_map = {
        "fire":         ["fire safety", "building code (tek17)"],
        "compliance":   ["structural compliance", "building code (tek17)"],
        "custom":       ["building code (tek17)"],
        "structural":   ["structural compliance", "structural analysis"],
        "accessibility":["accessibility (uu)", "building code (tek17)"],
        "energy":       ["energy requirements"],
        "planning":     ["planning permission"],
    }
    for keyword, targets in keyword_map.items():
        if keyword in label:
            for target_label in targets:
                target = nodes.get(target_label)
                if target and target.id != reg_node.id:
                    _add_edge(db, reg_node, target, RelationshipType.relates_to)


def _seed_from_tags(db, now: datetime, nodes: dict[str, KnowledgeNode]) -> None:
    """Seed tag/technique/location nodes from the Tag table."""
    tags = db.query(Tag).all()
    type_map = {
        TagCategory.regulation: NodeType.regulation,
        TagCategory.location:   NodeType.location,
        TagCategory.phase:      NodeType.tag,
        TagCategory.discipline: NodeType.technique,
    }
    for tag in tags:
        node_type = type_map.get(tag.category, NodeType.tag)
        node = _get_or_create_node(db, node_type, tag.id, tag.name)
        if node.last_active is None:
            node.last_active = now
        existing = nodes.get(tag.name.lower())
        if existing and existing.id != node.id:
            # Connect the operational tag node to the matching concept node
            _add_edge(db, node, existing, RelationshipType.relates_to)
        nodes[tag.name.lower()] = node

    db.flush()


def _seed_from_memory(db, now: datetime) -> None:
    """Seed knowledge nodes from MemoryChunk categories."""
    try:
        categories = db.query(MemoryChunk.category).distinct().all()
        for (cat,) in categories:
            if not cat:
                continue
            ref_id = uuid.uuid5(NS, f"knowledge:{cat}")
            node = _get_or_create_node(db, NodeType.knowledge, ref_id, str(cat))
            if node.last_active is None:
                node.last_active = now
        db.flush()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 4. Connect concept nodes that share a project
# ---------------------------------------------------------------------------

def _connect_shared_project_concepts(db) -> None:
    """For every project node, collect all concept nodes reachable in 1-2 hops,
    then connect those concepts to each other.

    This is the key fix for isolated nodes: tags that were created on the
    same project (via files, checks, tasks) end up connected to each other
    in the concept graph, making the /knowledge/web view dense and connected.
    """
    # Gather all project knowledge nodes
    project_nodes = (
        db.query(KnowledgeNode)
        .filter(KnowledgeNode.node_type == NodeType.project)
        .all()
    )

    for proj_node in project_nodes:
        # 1-hop: nodes directly connected to this project
        hop1_edges = (
            db.query(KnowledgeEdge)
            .filter(
                (KnowledgeEdge.source_node_id == proj_node.id)
                | (KnowledgeEdge.target_node_id == proj_node.id)
            )
            .all()
        )
        hop1_ids = set()
        for e in hop1_edges:
            for nid in [e.source_node_id, e.target_node_id]:
                if nid != proj_node.id:
                    hop1_ids.add(nid)

        # 2-hop: nodes connected to the hop-1 nodes
        if not hop1_ids:
            continue
        hop2_edges = (
            db.query(KnowledgeEdge)
            .filter(
                (KnowledgeEdge.source_node_id.in_(hop1_ids))
                | (KnowledgeEdge.target_node_id.in_(hop1_ids))
            )
            .all()
        )
        all_ids = set(hop1_ids)
        for e in hop2_edges:
            for nid in [e.source_node_id, e.target_node_id]:
                all_ids.add(nid)

        # Filter to only WEB_TYPE (concept) nodes
        if not all_ids:
            continue
        concept_nodes = (
            db.query(KnowledgeNode)
            .filter(
                KnowledgeNode.id.in_(all_ids),
                KnowledgeNode.node_type.in_(list(_WEB_TYPES)),
            )
            .all()
        )

        if len(concept_nodes) < 2:
            continue

        # Connect concept nodes in a star topology around the most-connected
        # one (to avoid O(n²) edges on large projects).
        anchor = concept_nodes[0]
        for other in concept_nodes[1:]:
            if anchor.id != other.id:
                _add_edge(db, anchor, other, RelationshipType.relates_to)

    db.flush()


# ---------------------------------------------------------------------------
# 5. No isolated nodes
# ---------------------------------------------------------------------------

def _connect_isolated_nodes(db, nodes: dict[str, KnowledgeNode]) -> None:
    """Any concept node with zero edges gets connected to the nearest
    canonical node in its type category, ensuring nothing is isolated."""

    # Find all web-type nodes
    all_concept_nodes = (
        db.query(KnowledgeNode)
        .filter(KnowledgeNode.node_type.in_(list(_WEB_TYPES)))
        .all()
    )

    # Count existing edges
    edge_rows = db.query(
        KnowledgeEdge.source_node_id, KnowledgeEdge.target_node_id
    ).all()
    connected_ids: set = set()
    for src, tgt in edge_rows:
        connected_ids.add(src)
        connected_ids.add(tgt)

    # Default anchors per type — each isolated node connects to its category hub
    type_anchor_label = {
        NodeType.tag:           "building code (tek17)",
        NodeType.regulation:    "building code (tek17)",
        NodeType.building_type: "oslo",
        NodeType.location:      "oslo",
        NodeType.technique:     "bim coordination",
        NodeType.knowledge:     "fire egress planning",
        NodeType.insight_topic: "building code (tek17)",
    }

    for node in all_concept_nodes:
        if node.id in connected_ids:
            continue
        # Find anchor
        anchor_label = type_anchor_label.get(node.node_type)
        if not anchor_label:
            continue
        anchor = nodes.get(anchor_label)
        if anchor and anchor.id != node.id:
            _add_edge(db, node, anchor, RelationshipType.relates_to)
            connected_ids.add(node.id)
            connected_ids.add(anchor.id)

    db.flush()
