"""knowledge_nodes v2 — new node types + description + last_active

Revision ID: 0007_knowledge_v2
Revises: 0006_timelogs
Create Date: 2026-05-11
"""
from typing import Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_knowledge_v2"
down_revision: Union[str, None] = "0006_timelogs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Postgres ALTER TYPE … ADD VALUE is irreversible and cannot run inside a
    # transaction.  Alembic wraps each migration in a transaction by default,
    # so we must execute each ADD VALUE outside the implicit transaction by
    # using COMMIT / BEGIN around each statement.
    op.execute("COMMIT")
    for value in ["building_type", "location", "knowledge", "insight_topic", "technique"]:
        op.execute(
            f"ALTER TYPE node_type ADD VALUE IF NOT EXISTS '{value}'"
        )
    op.execute("BEGIN")

    op.add_column(
        "knowledge_nodes",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "knowledge_nodes",
        sa.Column("last_active", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_nodes", "last_active")
    op.drop_column("knowledge_nodes", "description")
    # Postgres doesn't support removing enum values; downgrade only drops columns.
