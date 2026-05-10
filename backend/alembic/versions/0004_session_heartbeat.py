"""Add last_seen column to sessions for heartbeat-based presence

Revision ID: 0004_session_heartbeat
Revises: 0003_memory_chat
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_session_heartbeat"
down_revision: Union[str, None] = "0003_memory_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("last_seen", sa.DateTime(), nullable=True),
    )
    # Back-fill existing rows so they don't immediately drop out of the
    # online-users query: set last_seen = login_time for all existing sessions
    # that have no logout (i.e. were "active" before this migration).
    op.execute(
        "UPDATE sessions SET last_seen = login_time "
        "WHERE last_seen IS NULL AND logout_time IS NULL"
    )


def downgrade() -> None:
    op.drop_column("sessions", "last_seen")
