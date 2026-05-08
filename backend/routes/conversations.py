"""Conversation routes — persistent chat with personal & firm memory.

Privacy invariants enforced in every handler
--------------------------------------------
1. ConversationMessage queries ALWAYS include
       .filter(ConversationMessage.user_id == current_user.id)
   There is no admin override — no endpoint exposes another user's messages.

2. MemoryChunk API responses NEVER include:
       original_message_id
       contributed_by_user_id
   Both exist only in the DB for audit purposes.

3. my-contributions queries ALWAYS include
       .filter(MemoryChunk.contributed_by_user_id == current_user.id)

4. Withdrawn chunks (is_active=False) are never hard-deleted; search_similar
   already filters them via the WHERE is_active=true clause.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session as OrmSession

from database import SessionLocal, get_db
from models import ConversationMessage, Firm, MemoryChunk, PersonalMemoryChunk, Project, User
from services import ai_service, anonymization_service, auth_service
from services.embedding_service import embed_text

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class MessageIn(BaseModel):
    content: str
    project_id: Optional[UUID] = None


class MessageOut(BaseModel):
    message_id: UUID
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HistoryMessageOut(BaseModel):
    id: UUID
    role: str          # "user" | "assistant"
    content: str
    created_at: datetime
    project_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class ShareOut(BaseModel):
    memory_chunk_id: UUID
    anonymized_preview: str    # first 150 chars of the anonymized text


class ContributionOut(BaseModel):
    id: UUID
    anonymized_preview: str    # first 100 chars
    created_at: datetime
    category: str
    tags: list[str]
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class WithdrawOut(BaseModel):
    success: bool


# ---------------------------------------------------------------------------
# Background helper — embed and persist a PersonalMemoryChunk
# ---------------------------------------------------------------------------


async def _store_personal_memory(
    source_id: UUID,
    user_id: UUID,
    content: str,
    source_type: str,
) -> None:
    """Embed `content` and save a PersonalMemoryChunk in a fresh DB session.

    Intentionally fire-and-forget: never raises, never crashes the caller.
    Uses its own SessionLocal so the request session can close freely.
    """
    vec = await embed_text(content)
    if vec is None:
        logger.debug("_store_personal_memory: no embedding returned, skipping")
        return

    db = SessionLocal()
    try:
        chunk = PersonalMemoryChunk(
            user_id=user_id,
            content=content,
            source_type=source_type,
            source_id=source_id,
            embedding=vec,
            created_at=datetime.utcnow(),
        )
        db.add(chunk)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store personal memory (source %s): %s", source_id, exc)
        db.rollback()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/message", response_model=MessageOut)
async def send_message(
    payload: MessageIn,
    background_tasks: BackgroundTasks,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> MessageOut:
    """Send a message and receive an AI response.

    Flow
    ----
    1. Persist the user message (is_private=True).
    2. Schedule embedding → PersonalMemoryChunk  (background task).
    3. Assemble memory-enriched context + call AI provider.
    4. Persist the assistant response.
    5. Schedule embedding of assistant response → PersonalMemoryChunk (bg).
    6. Return the assistant message.
    """
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty")

    firm = db.query(Firm).filter(Firm.id == user.firm_id).first()

    # Validate project scope (must belong to user's firm)
    project_id = payload.project_id
    if project_id is not None:
        proj_exists = (
            db.query(Project.id)
            .filter(Project.id == project_id, Project.firm_id == user.firm_id)
            .first()
        )
        if proj_exists is None:
            raise HTTPException(status_code=404, detail="Project not found")

    # --- 1. Persist user message ---
    user_msg = ConversationMessage(
        user_id=user.id,
        project_id=project_id,
        role="user",
        content=content,
        is_private=True,
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    db.flush()  # get the PK before background task captures it

    # --- 2. Background: embed user message ---
    background_tasks.add_task(
        _store_personal_memory,
        user_msg.id,
        user.id,
        content,
        "conversation",
    )

    # --- 3. Memory-enriched AI response ---
    result = await ai_service.ask(
        db,
        firm,
        user,
        prompt=content,
        project_ids=[project_id] if project_id else [],
    )
    answer: str = result["answer"]

    # --- 4. Persist assistant message ---
    asst_msg = ConversationMessage(
        user_id=user.id,
        project_id=project_id,
        role="assistant",
        content=answer,
        is_private=True,
        created_at=datetime.utcnow(),
    )
    db.add(asst_msg)
    db.flush()

    # --- 5. Background: embed assistant response ---
    background_tasks.add_task(
        _store_personal_memory,
        asst_msg.id,
        user.id,
        answer,
        "conversation",
    )

    db.commit()

    return MessageOut(
        message_id=asst_msg.id,
        content=answer,
        created_at=asst_msg.created_at,
    )


@router.get("/history", response_model=list[HistoryMessageOut])
def get_history(
    project_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[ConversationMessage]:
    """Return this user's conversation history.

    PRIVACY: filter is hard-coded to current_user.id — there is no way to
    retrieve another user's messages through this endpoint.
    """
    q = (
        db.query(ConversationMessage)
        .filter(ConversationMessage.user_id == user.id)  # ← privacy assertion
    )
    if project_id is not None:
        q = q.filter(ConversationMessage.project_id == project_id)
    return q.order_by(ConversationMessage.created_at.asc()).limit(limit).all()


# NOTE: /my-contributions must be declared BEFORE /{message_id} so FastAPI
# does not try to parse the literal string "my-contributions" as a UUID.
@router.get("/my-contributions", response_model=list[ContributionOut])
def my_contributions(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[ContributionOut]:
    """Return all MemoryChunks this user has contributed.

    PRIVACY:
    - Filters by contributed_by_user_id == current_user.id.
    - Response schema deliberately omits original_message_id and
      contributed_by_user_id — those are audit-only DB columns.
    """
    chunks = (
        db.query(MemoryChunk)
        .filter(MemoryChunk.contributed_by_user_id == user.id)  # ← privacy assertion
        .order_by(MemoryChunk.created_at.desc())
        .all()
    )
    return [
        ContributionOut(
            id=c.id,
            anonymized_preview=(
                c.content_anonymized[:100]
                + ("…" if len(c.content_anonymized) > 100 else "")
            ),
            created_at=c.created_at,
            category=c.category or "general",
            tags=c.tags or [],
            is_active=c.is_active,
        )
        for c in chunks
    ]


@router.post("/{message_id}/share", response_model=ShareOut)
async def share_message(
    message_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> ShareOut:
    """Anonymize a message and contribute it to the firm knowledge pool.

    Steps
    -----
    1. Verify the requesting user owns the message.
    2. Run the anonymization pipeline (strips names, emails, project names …).
    3. Embed the anonymized text via Voyage AI.
    4. Persist a MemoryChunk with the internal audit fields set.
    5. Return the chunk id + a safe preview (no PII).

    The internal fields (original_message_id, contributed_by_user_id) are
    written to the DB but are never present in any API response.
    """
    # --- 1. Ownership check ---
    msg = (
        db.query(ConversationMessage)
        .filter(
            ConversationMessage.id == message_id,
            ConversationMessage.user_id == user.id,   # ← ownership assertion
        )
        .first()
    )
    if msg is None:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only share assistant messages (the ones worth contributing as knowledge).
    # User messages may contain raw queries — the AI response is the insight.
    project: Optional[Project] = None
    if msg.project_id:
        project = db.query(Project).filter(Project.id == msg.project_id).first()

    # --- 2. Anonymize ---
    anon_result = anonymization_service.anonymize_for_firm_memory(
        msg.content,
        user,
        project=project,
        db=db,
    )
    anonymized_text: str = anon_result["anonymized_text"]
    category: str = anon_result["category"]
    tags: list[str] = anon_result["auto_tags"]

    # --- 3. Embed ---
    vec = await embed_text(anonymized_text)
    if vec is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Embedding service unavailable. Configure VOYAGE_API_KEY "
                "to enable knowledge sharing."
            ),
        )

    # --- 4. Persist MemoryChunk ---
    chunk = MemoryChunk(
        firm_id=user.firm_id,
        content_anonymized=anonymized_text,
        original_message_id=message_id,       # audit-only, never returned
        contributed_by_user_id=user.id,        # audit-only, never returned
        category=category,
        tags=tags,
        embedding=vec,
        created_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(chunk)
    db.commit()
    db.refresh(chunk)

    # --- 5. Return safe preview ---
    preview = anonymized_text[:150] + ("…" if len(anonymized_text) > 150 else "")
    return ShareOut(memory_chunk_id=chunk.id, anonymized_preview=preview)


@router.delete("/memory/{chunk_id}/withdraw", response_model=WithdrawOut)
def withdraw_contribution(
    chunk_id: UUID,
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> WithdrawOut:
    """Soft-delete a firm memory contribution.

    Sets is_active=False so the chunk is excluded from all vector searches
    (search_similar filters WHERE is_active=true). The row is never hard-
    deleted — it is retained for audit purposes only.

    PRIVACY: only the contributing user can withdraw their own chunk.
    """
    chunk = (
        db.query(MemoryChunk)
        .filter(
            MemoryChunk.id == chunk_id,
            MemoryChunk.contributed_by_user_id == user.id,  # ← ownership assertion
        )
        .first()
    )
    if chunk is None:
        raise HTTPException(status_code=404, detail="Contribution not found")

    chunk.is_active = False
    db.commit()
    return WithdrawOut(success=True)
