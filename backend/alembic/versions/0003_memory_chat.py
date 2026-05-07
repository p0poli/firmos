"""memory and chat tables (pgvector)

Revision ID: 0003_memory_chat
Revises: 0002_modules_ai_roles
Create Date: 2026-05-07

Three new tables:
  1. conversation_messages — per-user private chat history with embeddings.
  2. memory_chunks         — anonymized firm-wide knowledge pool.
  3. personal_memory_chunks — per-user private semantic memory.

Pre-requisite: the pgvector Postgres extension must be available on the
server (Supabase has it built in). We run CREATE EXTENSION IF NOT EXISTS
vector as the very first step so the `vector` column type is available
before any DDL that references it.

Note on the VectorType shim: we define a lightweight UserDefinedType
inline so this migration file stays self-contained and does not depend on
the `pgvector` Python package being importable at migration run-time.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.types import UserDefinedType

revision: str = "0003_memory_chat"
down_revision: Union[str, None] = "0002_modules_ai_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Lightweight shim — emits  vector(1024)  in CREATE TABLE DDL without
# requiring the pgvector Python package to be installed at migration time.
# ---------------------------------------------------------------------------
class _Vector(UserDefinedType):
    """Minimal SQLAlchemy type that renders as ``vector(<dim>)`` in DDL."""

    cache_ok = True

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def get_col_spec(self, **kw) -> str:  # noqa: ANN003
        return f"vector({self.dim})"


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # 0. Enable pgvector — idempotent, safe on every run.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ------------------------------------------------------------------
    # 1. conversation_messages
    # ------------------------------------------------------------------
    op.create_table(
        "conversation_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("embedding", _Vector(1024), nullable=True),
    )
    op.create_index(
        "ix_conversation_messages_user_id",
        "conversation_messages",
        ["user_id"],
    )
    op.create_index(
        "ix_conversation_messages_project_id",
        "conversation_messages",
        ["project_id"],
    )

    # ------------------------------------------------------------------
    # 2. memory_chunks  (anonymized firm knowledge pool)
    # ------------------------------------------------------------------
    op.create_table(
        "memory_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "firm_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("firms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content_anonymized", sa.Text(), nullable=False),
        # Internal audit columns — never exposed via API.
        sa.Column("original_message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contributed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("category", sa.String(), nullable=False, server_default="general"),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("embedding", _Vector(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_memory_chunks_firm_id", "memory_chunks", ["firm_id"])
    op.create_index("ix_memory_chunks_is_active", "memory_chunks", ["is_active"])

    # ------------------------------------------------------------------
    # 3. personal_memory_chunks  (per-user private semantic memory)
    # ------------------------------------------------------------------
    op.create_table(
        "personal_memory_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False, server_default="conversation"),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("embedding", _Vector(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_personal_memory_chunks_user_id",
        "personal_memory_chunks",
        ["user_id"],
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    op.drop_index("ix_personal_memory_chunks_user_id", "personal_memory_chunks")
    op.drop_table("personal_memory_chunks")

    op.drop_index("ix_memory_chunks_is_active", "memory_chunks")
    op.drop_index("ix_memory_chunks_firm_id", "memory_chunks")
    op.drop_table("memory_chunks")

    op.drop_index("ix_conversation_messages_project_id", "conversation_messages")
    op.drop_index("ix_conversation_messages_user_id", "conversation_messages")
    op.drop_table("conversation_messages")

    # We intentionally do NOT drop the vector extension — another tenant
    # or future migration may depend on it.
