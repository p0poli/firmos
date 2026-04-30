"""Auto-tagging logic. Creates KnowledgeNodes/Edges and Tags when domain events happen."""
import re
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session as OrmSession

from models import (
    CheckResult,
    File,
    Insight,
    KnowledgeEdge,
    KnowledgeNode,
    NodeType,
    Project,
    RelationshipType,
    Tag,
    TagCategory,
    Task,
)


def _get_or_create_node(
    db: OrmSession,
    node_type: NodeType,
    reference_id: UUID,
    label: str,
    metadata: Optional[dict] = None,
) -> KnowledgeNode:
    existing = (
        db.query(KnowledgeNode)
        .filter(KnowledgeNode.node_type == node_type, KnowledgeNode.reference_id == reference_id)
        .first()
    )
    if existing:
        if label and not existing.label:
            existing.label = label
        if metadata:
            merged = dict(existing.node_metadata or {})
            merged.update(metadata)
            existing.node_metadata = merged
        return existing
    node = KnowledgeNode(
        node_type=node_type,
        reference_id=reference_id,
        label=label or "",
        node_metadata=metadata or {},
    )
    db.add(node)
    db.flush()
    return node


def _add_edge(
    db: OrmSession,
    source: KnowledgeNode,
    target: KnowledgeNode,
    relationship_type: RelationshipType,
) -> None:
    exists = (
        db.query(KnowledgeEdge)
        .filter(
            KnowledgeEdge.source_node_id == source.id,
            KnowledgeEdge.target_node_id == target.id,
            KnowledgeEdge.relationship_type == relationship_type,
        )
        .first()
    )
    if exists:
        return
    db.add(
        KnowledgeEdge(
            source_node_id=source.id,
            target_node_id=target.id,
            relationship_type=relationship_type,
        )
    )


def _get_or_create_tag(db: OrmSession, name: str, category: TagCategory) -> Tag:
    name = name.strip().lower()
    if not name:
        return None
    existing = db.query(Tag).filter(Tag.name == name, Tag.category == category).first()
    if existing:
        return existing
    tag = Tag(name=name, category=category)
    db.add(tag)
    db.flush()
    return tag


def _attach_tag(db: OrmSession, entity_node: KnowledgeNode, tag: Tag) -> None:
    if tag is None:
        return
    tag_node = _get_or_create_node(db, NodeType.tag, tag.id, tag.name, metadata={"category": tag.category.value})
    _add_edge(db, entity_node, tag_node, RelationshipType.tagged_with)


def on_project_created(db: OrmSession, project: Project) -> KnowledgeNode:
    node = _get_or_create_node(
        db,
        NodeType.project,
        project.id,
        project.name,
        metadata={"status": project.status.value if project.status else None},
    )
    if project.status:
        status_tag = _get_or_create_tag(db, project.status.value, TagCategory.phase)
        _attach_tag(db, node, status_tag)
    return node


def on_task_created(db: OrmSession, task: Task) -> KnowledgeNode:
    project_node = _get_or_create_node(db, NodeType.project, task.project_id, "")
    task_node = _get_or_create_node(db, NodeType.task, task.id, task.title)
    _add_edge(db, task_node, project_node, RelationshipType.belongs_to)
    if task.assigned_user_id:
        user_node = _get_or_create_node(db, NodeType.user, task.assigned_user_id, "")
        _add_edge(db, task_node, user_node, RelationshipType.assigned_to)
    return task_node


def on_file_registered(db: OrmSession, file: File) -> KnowledgeNode:
    project_node = _get_or_create_node(db, NodeType.project, file.project_id, "")
    file_node = _get_or_create_node(
        db,
        NodeType.file,
        file.id,
        file.name,
        metadata={"source": file.source.value if file.source else None},
    )
    _add_edge(db, file_node, project_node, RelationshipType.belongs_to)

    # Tags from filename: split on common separators, drop short/noisy tokens.
    base = re.split(r"[\\/]", file.name)[-1]
    base = re.sub(r"\.[^.]+$", "", base)
    tokens = [t for t in re.split(r"[\s_\-.]+", base) if len(t) >= 3 and not t.isdigit()]
    for token in tokens[:8]:
        tag = _get_or_create_tag(db, token, TagCategory.discipline)
        _attach_tag(db, file_node, tag)
    return file_node


def on_check_result_saved(
    db: OrmSession, check: CheckResult, project_id: UUID
) -> KnowledgeNode:
    project_node = _get_or_create_node(db, NodeType.project, project_id, "")
    check_node = _get_or_create_node(
        db,
        NodeType.regulation,
        check.id,
        f"{check.check_type.value} ({check.status.value})",
        metadata={
            "check_type": check.check_type.value,
            "status": check.status.value,
        },
    )
    _add_edge(db, check_node, project_node, RelationshipType.belongs_to)

    type_tag = _get_or_create_tag(db, check.check_type.value, TagCategory.regulation)
    _attach_tag(db, check_node, type_tag)
    status_tag = _get_or_create_tag(db, check.status.value, TagCategory.regulation)
    _attach_tag(db, check_node, status_tag)
    return check_node


def on_insight_generated(db: OrmSession, insight: Insight) -> KnowledgeNode:
    project_node = _get_or_create_node(db, NodeType.project, insight.project_id, "")
    insight_node = _get_or_create_node(
        db,
        NodeType.insight,
        insight.id,
        insight.type.value,
        metadata={"type": insight.type.value},
    )
    _add_edge(db, insight_node, project_node, RelationshipType.belongs_to)
    return insight_node
