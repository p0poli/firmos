"""Auto-embedding pipeline — fire-and-forget hooks for platform events.

Whenever the platform creates a significant artifact (Insight, CheckResult,
Task) the relevant text is embedded via Voyage AI and saved as a
PersonalMemoryChunk so it surfaces in future conversations.

All public functions are async, accept plain scalar arguments (no ORM
objects), open their own DB session, and swallow every exception — callers
should schedule them with FastAPI BackgroundTasks and never await the result.

Usage (in a route handler):
    background_tasks.add_task(
        memory_pipeline.embed_insight,
        insight_id=insight.id,
        user_id=user.id,
        content=insight.content,
    )
"""
from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from database import SessionLocal
from models import PersonalMemoryChunk
from services.embedding_service import embed_text

logger = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Shared helper — identical pattern to conversations._store_personal_memory
# ---------------------------------------------------------------------------


async def _store(
    source_id: UUID,
    user_id: UUID,
    content: str,
    source_type: str,
) -> None:
    """Embed `content` and save a PersonalMemoryChunk.

    Uses its own SessionLocal so it can safely run in a BackgroundTask after
    the request session has already closed.  Never raises.
    """
    if not content or not content.strip():
        return

    vec = await embed_text(content.strip())
    if vec is None:
        logger.debug(
            "memory_pipeline._store: no embedding returned for %s %s",
            source_type,
            source_id,
        )
        return

    db = SessionLocal()
    try:
        chunk = PersonalMemoryChunk(
            user_id=user_id,
            content=content.strip(),
            source_type=source_type,
            source_id=source_id,
            embedding=vec,
            created_at=datetime.utcnow(),
        )
        db.add(chunk)
        db.commit()
        logger.debug(
            "memory_pipeline._store: saved PersonalMemoryChunk for user %s (%s %s)",
            user_id,
            source_type,
            source_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "memory_pipeline._store: failed to save chunk (source %s %s): %s",
            source_type,
            source_id,
            exc,
        )
        db.rollback()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Public hooks
# ---------------------------------------------------------------------------


async def embed_insight(
    insight_id: UUID,
    user_id: UUID,
    content: str,
) -> None:
    """Embed a generated Insight and save it to the user's personal memory.

    Call this after the Insight row is committed so the source_id FK is valid.
    """
    await _store(insight_id, user_id, content, "insight")


async def embed_check_result(
    check_id: UUID,
    user_id: UUID,
    check_type: str,
    status: str,
    issues: list | None,
) -> None:
    """Embed a Revit CheckResult summary into the submitter's personal memory.

    Builds a short prose summary from the check fields rather than storing
    raw JSON so the vector captures readable natural-language semantics.
    """
    issues = issues or []
    issue_count = len(issues)
    first_issue = issues[0].get("issue", "") if issues else ""

    lines = [
        f"Revit compliance check: {check_type} — result: {status}.",
        f"{issue_count} issue(s) detected.",
    ]
    if first_issue:
        lines.append(f"First issue: {first_issue}")

    await _store(check_id, user_id, " ".join(lines), "check_result")


async def embed_task(
    task_id: UUID,
    user_id: UUID,
    title: str,
    description: str | None,
) -> None:
    """Embed a newly created Task into the creator's personal memory.

    Includes the description when present so semantic search can match
    queries about specific work items.
    """
    parts = [f"Task: {title}."]
    if description and description.strip():
        parts.append(description.strip())

    await _store(task_id, user_id, " ".join(parts), "task")
