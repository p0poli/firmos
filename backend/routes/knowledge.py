from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import (
    Insight,
    KnowledgeEdge,
    KnowledgeNode,
    NodeType,
    Project,
    RelationshipType,
    Task,
    User,
    project_members,
)
from schemas.knowledge import (
    EdgeOut,
    GraphOut,
    KnowledgeStats,
    NodeOut,
    SearchResult,
    WorldEdgeOut,
    WorldGraphOut,
    WorldNodeOut,
)
from services import auth_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# ---- helpers ----------------------------------------------------------------

def _edge_weights(db: OrmSession) -> dict[str, int]:
    """Return {node_id_str: connection_count} for all nodes."""
    rows = (
        db.query(
            KnowledgeEdge.source_node_id,
            KnowledgeEdge.target_node_id,
        )
        .all()
    )
    counts: dict[str, int] = {}
    for src, tgt in rows:
        s, t = str(src), str(tgt)
        counts[s] = counts.get(s, 0) + 1
        counts[t] = counts.get(t, 0) + 1
    return counts


def _node_to_out(node: KnowledgeNode, weight: int = 0) -> NodeOut:
    return NodeOut(
        id=node.id,
        node_type=node.node_type,
        reference_id=node.reference_id,
        label=node.label,
        description=node.description,
        node_metadata=node.node_metadata or {},
        weight=weight,
        last_active=node.last_active,
    )


# ---- legacy + compat --------------------------------------------------------

@router.get("/nodes", response_model=list[NodeOut])
def list_nodes(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[KnowledgeNode]:
    weights = _edge_weights(db)
    nodes = db.query(KnowledgeNode).all()
    return [_node_to_out(n, weights.get(str(n.id), 0)) for n in nodes]


@router.get("/edges", response_model=list[EdgeOut])
def list_edges(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[KnowledgeEdge]:
    return db.query(KnowledgeEdge).all()


@router.get("/graph", response_model=GraphOut)
def full_graph(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> GraphOut:
    weights = _edge_weights(db)
    nodes = db.query(KnowledgeNode).all()
    edges = db.query(KnowledgeEdge).all()
    return GraphOut(
        nodes=[_node_to_out(n, weights.get(str(n.id), 0)) for n in nodes],
        edges=[EdgeOut.model_validate(e) for e in edges],
    )


# ---- project graph (one project at a time) ----------------------------------

@router.get("/project/{project_id}", response_model=GraphOut)
def project_graph(
    project_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> GraphOut:
    """Return all knowledge nodes that belong to (or reference) a single project.

    Includes: project node, task nodes, file nodes, check nodes, insight nodes,
    regulation nodes, tag nodes connected to any of the above.
    """
    # Find the project's KnowledgeNode
    project_node = (
        db.query(KnowledgeNode)
        .filter(
            KnowledgeNode.node_type == NodeType.project,
            KnowledgeNode.reference_id == project_id,
        )
        .first()
    )
    if project_node is None:
        return GraphOut(nodes=[], edges=[])

    # BFS: collect all nodes reachable from the project node within 2 hops
    visited_ids: set[str] = {str(project_node.id)}
    frontier: list[str] = [str(project_node.id)]

    for _ in range(2):  # 2-hop BFS
        edges = (
            db.query(KnowledgeEdge)
            .filter(
                (KnowledgeEdge.source_node_id.in_([UUID(i) for i in frontier]))
                | (KnowledgeEdge.target_node_id.in_([UUID(i) for i in frontier]))
            )
            .all()
        )
        next_frontier: list[str] = []
        for e in edges:
            for nid in [str(e.source_node_id), str(e.target_node_id)]:
                if nid not in visited_ids:
                    visited_ids.add(nid)
                    next_frontier.append(nid)
        frontier = next_frontier
        if not frontier:
            break

    node_uuid_list = [UUID(i) for i in visited_ids]
    nodes = db.query(KnowledgeNode).filter(KnowledgeNode.id.in_(node_uuid_list)).all()

    edges_all = (
        db.query(KnowledgeEdge)
        .filter(
            KnowledgeEdge.source_node_id.in_(node_uuid_list),
            KnowledgeEdge.target_node_id.in_(node_uuid_list),
        )
        .all()
    )

    weights = _edge_weights(db)
    return GraphOut(
        nodes=[_node_to_out(n, weights.get(str(n.id), 0)) for n in nodes],
        edges=[EdgeOut.model_validate(e) for e in edges_all],
    )


# ---- knowledge web (firm-wide, concept nodes only) -------------------------

# Node types that belong in the Knowledge Web (no operational nodes like project/task/user/file)
_WEB_TYPES = {
    NodeType.tag,
    NodeType.regulation,
    NodeType.building_type,
    NodeType.location,
    NodeType.knowledge,
    NodeType.insight_topic,
    NodeType.technique,
}


@router.get("/web", response_model=GraphOut)
def knowledge_web(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> GraphOut:
    """Return only concept/knowledge nodes (tags, regulations, techniques, etc.).
    Includes weight (connection count) and last_active for each node.
    """
    weights = _edge_weights(db)
    nodes = (
        db.query(KnowledgeNode)
        .filter(KnowledgeNode.node_type.in_(list(_WEB_TYPES)))
        .all()
    )
    node_id_set = {n.id for n in nodes}
    edges = (
        db.query(KnowledgeEdge)
        .filter(
            KnowledgeEdge.source_node_id.in_(node_id_set),
            KnowledgeEdge.target_node_id.in_(node_id_set),
        )
        .all()
    )
    return GraphOut(
        nodes=[_node_to_out(n, weights.get(str(n.id), 0)) for n in nodes],
        edges=[EdgeOut.model_validate(e) for e in edges],
    )


# ---- my world (personal graph) ----------------------------------------------

@router.get("/my-world", response_model=WorldGraphOut)
def my_world(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> WorldGraphOut:
    """Personalized graph for the current user.

    Center node = current user.
    Connected to: projects (member of), tasks (assigned to me),
    colleagues (on same projects), tags (from projects),
    regulations (from checks on projects), insights (on projects).
    Max 150 nodes.
    """
    nodes: list[WorldNodeOut] = []
    edges: list[WorldEdgeOut] = []
    edge_count = 0

    def new_edge(src: str, tgt: str, label: str) -> None:
        nonlocal edge_count
        edges.append(WorldEdgeOut(id=f"e{edge_count}", source=src, target=tgt, label=label))
        edge_count += 1

    # Center: me
    me_id = f"me_{user.id}"
    nodes.append(WorldNodeOut(
        id=me_id,
        node_type="me",
        label=user.name or user.email,
        metadata={"email": user.email, "role": user.role.value if user.role else None},
    ))

    # Projects I'm a member of
    my_projects = (
        db.query(Project)
        .join(project_members, Project.id == project_members.c.project_id)
        .filter(project_members.c.user_id == user.id)
        .limit(20)
        .all()
    )
    project_ids = {p.id for p in my_projects}

    for p in my_projects:
        pid = f"project_{p.id}"
        nodes.append(WorldNodeOut(
            id=pid,
            node_type="project",
            label=p.name,
            metadata={"status": p.status.value if p.status else None, "ref": str(p.id)},
        ))
        new_edge(me_id, pid, "member of")

    # Tasks assigned to me (across all my projects)
    my_tasks = (
        db.query(Task)
        .filter(
            Task.project_id.in_(project_ids),
            Task.assigned_user_id == user.id,
        )
        .limit(30)
        .all()
    )
    for t in my_tasks:
        tid = f"task_{t.id}"
        nodes.append(WorldNodeOut(
            id=tid,
            node_type="task",
            label=t.title,
            metadata={
                "status": t.status.value if t.status else None,
                "due_date": str(t.due_date) if t.due_date else None,
                "ref": str(t.id),
                "project_id": str(t.project_id),
            },
        ))
        proj_id_str = f"project_{t.project_id}"
        new_edge(proj_id_str, tid, "contains")
        new_edge(tid, me_id, "assigned to me")

    # Colleagues (members of same projects, excluding self)
    colleague_seen: set = set()
    for p in my_projects:
        for m in p.members:
            if m.id == user.id or m.id in colleague_seen:
                continue
            colleague_seen.add(m.id)
            cid = f"colleague_{m.id}"
            nodes.append(WorldNodeOut(
                id=cid,
                node_type="colleague",
                label=m.name or m.email,
                metadata={"email": m.email, "role": m.role.value if m.role else None},
            ))
            new_edge(f"project_{p.id}", cid, "also working on")
            if len(nodes) >= 140:
                break
        if len(nodes) >= 140:
            break

    # Insights for my projects
    for p in my_projects[:5]:
        insights = (
            db.query(Insight)
            .filter(Insight.project_id == p.id)
            .limit(3)
            .all()
        )
        for ins in insights:
            iid = f"insight_{ins.id}"
            nodes.append(WorldNodeOut(
                id=iid,
                node_type="insight",
                label=ins.type.value.replace("_", " ").title(),
                metadata={"type": ins.type.value, "ref": str(ins.id), "project_id": str(ins.project_id)},
            ))
            new_edge(iid, f"project_{p.id}", "about")
            if len(nodes) >= 148:
                break

    # Concept nodes: tags + regulations from knowledge graph, connected to projects
    kn_nodes = (
        db.query(KnowledgeNode)
        .filter(KnowledgeNode.node_type.in_([NodeType.tag, NodeType.regulation]))
        .limit(20)
        .all()
    )
    # Map reference_id → project_id via edges
    kn_ids = {n.id for n in kn_nodes}
    kn_edges = (
        db.query(KnowledgeEdge)
        .filter(
            KnowledgeEdge.source_node_id.in_(kn_ids),
            KnowledgeEdge.relationship_type == RelationshipType.belongs_to,
        )
        .all()
    )
    kn_project_map: dict = {}
    for ke in kn_edges:
        kn_project_map[str(ke.source_node_id)] = str(ke.target_node_id)

    proj_kn_nodes = (
        db.query(KnowledgeNode)
        .filter(
            KnowledgeNode.node_type == NodeType.project,
            KnowledgeNode.reference_id.in_(project_ids),
        )
        .all()
    )
    proj_kn_id_map = {str(n.id): str(n.reference_id) for n in proj_kn_nodes}

    for kn in kn_nodes:
        if len(nodes) >= 150:
            break
        kn_proj_kn_id = kn_project_map.get(str(kn.id))
        if kn_proj_kn_id is None:
            continue
        ref_proj_id = proj_kn_id_map.get(kn_proj_kn_id)
        if ref_proj_id is None:
            continue
        node_id = f"kn_{kn.id}"
        nodes.append(WorldNodeOut(
            id=node_id,
            node_type=kn.node_type.value,
            label=kn.label,
            metadata={"kn_id": str(kn.id)},
        ))
        new_edge(f"project_{ref_proj_id}", node_id, "references")

    return WorldGraphOut(nodes=nodes[:150], edges=edges)


# ---- search -----------------------------------------------------------------

@router.get("/search", response_model=SearchResult)
def search_knowledge(
    q: str = Query(..., min_length=1),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> SearchResult:
    """Search knowledge nodes by label (case-insensitive substring match).
    Returns matching nodes + their immediate edges, plus focus_node_id.
    """
    q_lower = q.strip().lower()
    nodes = (
        db.query(KnowledgeNode)
        .filter(func.lower(KnowledgeNode.label).contains(q_lower))
        .limit(50)
        .all()
    )

    if not nodes:
        return SearchResult(nodes=[], edges=[], focus_node_id=None)

    # Exact match first, then prefix match, then any match
    exact = [n for n in nodes if n.label.lower() == q_lower]
    focus = (exact or nodes)[0]

    node_ids = {n.id for n in nodes}
    edges = (
        db.query(KnowledgeEdge)
        .filter(
            KnowledgeEdge.source_node_id.in_(node_ids),
            KnowledgeEdge.target_node_id.in_(node_ids),
        )
        .all()
    )

    weights = _edge_weights(db)
    return SearchResult(
        nodes=[_node_to_out(n, weights.get(str(n.id), 0)) for n in nodes],
        edges=[EdgeOut.model_validate(e) for e in edges],
        focus_node_id=str(focus.id),
    )


# ---- stats ------------------------------------------------------------------

@router.get("/stats", response_model=KnowledgeStats)
def knowledge_stats(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> KnowledgeStats:
    """Aggregate stats about the knowledge graph."""
    total_nodes = db.query(func.count(KnowledgeNode.id)).scalar() or 0
    edges_count = db.query(func.count(KnowledgeEdge.id)).scalar() or 0

    # nodes by type
    type_rows = (
        db.query(KnowledgeNode.node_type, func.count(KnowledgeNode.id))
        .group_by(KnowledgeNode.node_type)
        .all()
    )
    nodes_by_type = {str(t): c for t, c in type_rows}

    # activity last 7 days — based on last_active column (may be mostly null)
    now = datetime.utcnow()
    activity_last_7_days = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        rows = (
            db.query(KnowledgeNode.node_type)
            .filter(
                KnowledgeNode.last_active >= day_start,
                KnowledgeNode.last_active < day_end,
            )
            .all()
        )
        types_added = list({str(r[0]) for r in rows})
        activity_last_7_days.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "nodes_added": len(rows),
            "types": types_added,
        })

    last_node = (
        db.query(KnowledgeNode.last_active)
        .filter(KnowledgeNode.last_active.isnot(None))
        .order_by(KnowledgeNode.last_active.desc())
        .first()
    )
    last_updated = last_node[0] if last_node else None

    return KnowledgeStats(
        total_nodes=total_nodes,
        nodes_by_type=nodes_by_type,
        edges_count=edges_count,
        activity_last_7_days=activity_last_7_days,
        last_updated=last_updated,
    )


# ---- node CRUD (for Knowledge Web "Add node" feature) -----------------------

@router.post("/nodes", response_model=NodeOut, status_code=201)
def create_node(
    payload: dict,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> KnowledgeNode:
    """Manually create a knowledge node (user-created, not auto-tagged)."""
    import uuid as _uuid
    node = KnowledgeNode(
        id=_uuid.uuid4(),
        node_type=NodeType(payload["node_type"]),
        reference_id=_uuid.uuid4(),  # synthetic ref for manual nodes
        label=payload["label"],
        description=payload.get("description"),
        node_metadata=payload.get("metadata", {}),
        last_active=datetime.utcnow(),
    )
    db.add(node)

    # Connect to other nodes if provided
    connect_to = payload.get("connect_to", [])
    for target_id_str in connect_to:
        target = db.query(KnowledgeNode).filter(
            KnowledgeNode.id == UUID(target_id_str)
        ).first()
        if target:
            db.add(KnowledgeEdge(
                source_node_id=node.id,
                target_node_id=target.id,
                relationship_type=RelationshipType.relates_to,
            ))

    db.commit()
    db.refresh(node)
    return _node_to_out(node, 0)


@router.patch("/nodes/{node_id}", response_model=NodeOut)
def update_node(
    node_id: UUID,
    payload: dict,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> KnowledgeNode:
    node = db.query(KnowledgeNode).filter(KnowledgeNode.id == node_id).first()
    if node is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Node not found")
    if "label" in payload:
        node.label = payload["label"]
    if "description" in payload:
        node.description = payload["description"]
    node.last_active = datetime.utcnow()
    db.commit()
    db.refresh(node)
    weights = _edge_weights(db)
    return _node_to_out(node, weights.get(str(node.id), 0))


@router.delete("/nodes/{node_id}", status_code=204)
def delete_node(
    node_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> None:
    node = db.query(KnowledgeNode).filter(KnowledgeNode.id == node_id).first()
    if node:
        db.delete(node)
        db.commit()


@router.post("/edges", response_model=EdgeOut, status_code=201)
def create_edge(
    payload: dict,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> KnowledgeEdge:
    import uuid as _uuid
    edge = KnowledgeEdge(
        id=_uuid.uuid4(),
        source_node_id=UUID(payload["source_node_id"]),
        target_node_id=UUID(payload["target_node_id"]),
        relationship_type=RelationshipType.relates_to,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return EdgeOut.model_validate(edge)
