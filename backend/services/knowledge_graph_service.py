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


from datetime import datetime as _datetime


async def extract_knowledge_tags(
    db: OrmSession,
    text: str,
    source_project_id=None,
    source_insight_id=None,
) -> None:
    """AI-powered tag extraction.  Calls the configured LLM and parses
    a JSON array of {label, type, confidence} objects.

    This is a best-effort call — failures are swallowed so the caller is
    never blocked.  Only tags with confidence > 0.7 are stored.
    Supported types: regulation | technique | building_type | location | tag
    """
    import asyncio
    import json
    import logging
    from config import settings

    logger = logging.getLogger("uvicorn.error")

    # Map AI tag types to NodeType enum values
    _type_map = {
        "regulation":    NodeType.regulation,
        "technique":     NodeType.technique,
        "building_type": NodeType.building_type,
        "location":      NodeType.location,
        "tag":           NodeType.tag,
    }

    prompt = (
        "Extract knowledge tags from this text. "
        "Return ONLY a JSON array of objects: "
        "[{\"label\": \"tag name\", \"type\": \"regulation|technique|building_type|location|tag\", \"confidence\": 0.0}] "
        "Only include tags with confidence > 0.7. Return [] if none found.\n\n"
        f"Text: {text[:2000]}"
    )

    try:
        import httpx
        api_key = settings.anthropic_api_key
        if not api_key:
            return

        def _call() -> list[dict]:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5",
                    "max_tokens": 512,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=15,
            )
            if resp.status_code != 200:
                return []
            content = resp.json()["content"][0]["text"].strip()
            # Extract JSON array from response
            start = content.find("[")
            end = content.rfind("]") + 1
            if start == -1 or end == 0:
                return []
            return json.loads(content[start:end])

        tags_raw = await asyncio.to_thread(_call)

        if source_project_id:
            project_node = _get_or_create_node(db, NodeType.project, source_project_id, "")

        for item in tags_raw:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            tag_type_str = str(item.get("type", "tag"))
            confidence = float(item.get("confidence", 0))
            if not label or confidence < 0.7:
                continue
            node_type = _type_map.get(tag_type_str, NodeType.tag)
            import uuid as _uuid
            ref_id = _uuid.uuid4()
            node = _get_or_create_node(db, node_type, ref_id, label, metadata={"auto_tagged": True})
            node.last_active = _datetime.utcnow()
            if source_project_id:
                _add_edge(db, node, project_node, RelationshipType.tagged_with)

        db.commit()

    except Exception as e:
        logger.warning("extract_knowledge_tags failed: %s", e)
