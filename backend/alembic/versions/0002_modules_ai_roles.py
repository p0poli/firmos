"""modules table, firm AI fields, expanded user roles

Revision ID: 0002_modules_ai_roles
Revises: 0001_initial
Create Date: 2026-05-05

Three groups of changes:

1. New `firm_modules` table — one row per (firm, module_key); flips
   on/off as admins activate features in the Settings page.
2. Two new columns on `firms`: `ai_provider` (defaults to "anthropic"
   so existing rows backfill cleanly) and `ai_api_key_encrypted`
   (nullable; Fernet-encrypted at rest).
3. Replace the `user_role` enum: `admin / member` →
   `admin / project_manager / architect`. Existing `member` rows are
   migrated to `architect`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_modules_ai_roles"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. firm_modules
    # ------------------------------------------------------------------
    op.create_table(
        "firm_modules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "firm_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("firms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_key", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("firm_id", "module_key", name="uq_firm_modules_firm_key"),
    )
    op.create_index(
        "ix_firm_modules_firm_id", "firm_modules", ["firm_id"], unique=False
    )
    op.create_index(
        "ix_firm_modules_module_key",
        "firm_modules",
        ["module_key"],
        unique=False,
    )

    # ------------------------------------------------------------------
    # 2. firms.ai_provider, firms.ai_api_key_encrypted
    # ------------------------------------------------------------------
    op.add_column(
        "firms",
        sa.Column(
            "ai_provider",
            sa.String(),
            nullable=False,
            server_default="anthropic",
        ),
    )
    op.add_column(
        "firms",
        sa.Column("ai_api_key_encrypted", sa.String(), nullable=True),
    )

    # ------------------------------------------------------------------
    # 3. user_role enum: admin/member  →  admin/project_manager/architect
    # ------------------------------------------------------------------
    # Postgres won't drop a value from an enum cleanly, so we recreate
    # the type. Steps:
    #   a) rename the existing type to user_role_old
    #   b) create the new user_role with the three values
    #   c) alter users.role to TEXT temporarily, mapping member→architect
    #   d) cast back to the new user_role enum
    #   e) drop the old type
    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    op.execute(
        "CREATE TYPE user_role AS ENUM ('admin', 'project_manager', 'architect')"
    )
    op.execute(
        """
        ALTER TABLE users
            ALTER COLUMN role TYPE user_role
            USING (
                CASE role::text
                    WHEN 'admin' THEN 'admin'
                    WHEN 'member' THEN 'architect'
                    ELSE 'architect'
                END
            )::user_role
        """
    )
    op.execute("DROP TYPE user_role_old")


def downgrade() -> None:
    # Reverse the role enum first — needs to happen while users.role
    # still references the new enum so we can cast cleanly.
    op.execute("ALTER TYPE user_role RENAME TO user_role_new")
    op.execute("CREATE TYPE user_role AS ENUM ('admin', 'member')")
    op.execute(
        """
        ALTER TABLE users
            ALTER COLUMN role TYPE user_role
            USING (
                CASE role::text
                    WHEN 'admin' THEN 'admin'
                    ELSE 'member'
                END
            )::user_role
        """
    )
    op.execute("DROP TYPE user_role_new")

    op.drop_column("firms", "ai_api_key_encrypted")
    op.drop_column("firms", "ai_provider")

    op.drop_index("ix_firm_modules_module_key", table_name="firm_modules")
    op.drop_index("ix_firm_modules_firm_id", table_name="firm_modules")
    op.drop_table("firm_modules")
