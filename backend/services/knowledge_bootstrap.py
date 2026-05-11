"""Bootstrap the knowledge graph from existing operational data.

Run once (idempotent) during lifespan to seed:
1. Unique check_types from CheckResults -> regulation nodes
2. Unique Tag names -> tag nodes
3. MemoryChunk categories -> knowledge nodes

Safe to run on every boot -- _get_or_create_node is idempotent.
"""
from __future__ import annotations
import logging
from datetime import datetime

from database import SessionLocal
from models import (
    CheckResult,
    KnowledgeNode,
    MemoryChunk,
    NodeType,
    Tag,
    TagCategory,
)
from services.knowledge_graph_service import _get_or_create_node

logger = logging.getLogger("uvicorn.error")


def bootstrap_knowledge() -> None:
    db = SessionLocal()
    try:
        _bootstrap(db)
    except Exception as e:
        logger.warning("knowledge_bootstrap failed: %s", e)
    finally:
        db.close()


def _bootstrap(db) -> None:
    now = datetime.utcnow()

    # 1. Unique check types -> regulation nodes
    check_types = db.query(CheckResult.check_type).distinct().all()
    reg_count = 0
    for (ct,) in check_types:
        import uuid
        # Use a deterministic UUID based on check type name so it's truly idempotent
        ref_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"regulation:{ct.value}")
        node = _get_or_create_node(db, NodeType.regulation, ref_id, ct.value.replace("_", " ").title())
        if node.last_active is None:
            node.last_active = now
        reg_count += 1

    # 2. Unique tags -> tag/technique/building_type/location nodes
    tags = db.query(Tag).all()
    tag_count = 0
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
        tag_count += 1

    # 3. MemoryChunk categories -> knowledge nodes
    try:
        categories = db.query(MemoryChunk.category).distinct().all()
        km_count = 0
        for (cat,) in categories:
            if not cat:
                continue
            import uuid
            ref_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"knowledge:{cat}")
            node = _get_or_create_node(db, NodeType.knowledge, ref_id, str(cat))
            if node.last_active is None:
                node.last_active = now
            km_count += 1
    except Exception:
        km_count = 0

    db.commit()
    logger.info(
        "knowledge_bootstrap: %d regulations, %d tags/concepts, %d knowledge nodes",
        reg_count, tag_count, km_count,
    )
