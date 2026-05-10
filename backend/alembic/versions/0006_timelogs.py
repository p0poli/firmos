"""time_logs table

Revision ID: 0006_timelogs
Revises: 0005_task_logs
Create Date: 2026-05-10
"""

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_timelogs"
down_revision: Union[str, None] = "0005_task_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "time_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_time_logs_task_id", "time_logs", ["task_id"])
    op.create_index("ix_time_logs_user_id", "time_logs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_time_logs_user_id", table_name="time_logs")
    op.drop_index("ix_time_logs_task_id", table_name="time_logs")
    op.drop_table("time_logs")
