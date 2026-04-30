"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-04-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "firms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    user_role = sa.Enum("admin", "member", name="user_role")
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    project_status = sa.Enum("active", "on-hold", "completed", "archived", name="project_status")
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", project_status, nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("firm_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("firms.id", ondelete="CASCADE"), nullable=False),
    )

    op.create_table(
        "project_members",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("login_time", sa.DateTime(), nullable=False),
        sa.Column("logout_time", sa.DateTime(), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("active_project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
    )

    task_status = sa.Enum("todo", "in-progress", "review", "done", name="task_status")
    task_priority = sa.Enum("low", "medium", "high", name="task_priority")
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", task_status, nullable=False),
        sa.Column("priority", task_priority, nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    file_source = sa.Enum("BIM360", "ACC", "uploaded", name="file_source")
    op.create_table(
        "files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("source", file_source, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    model_event_type = sa.Enum("opened", "synced", "closed", "check_run", name="model_event_type")
    op.create_table(
        "model_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_type", model_event_type, nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("revit_file_name", sa.String(), nullable=True),
        sa.Column("revit_version", sa.String(), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    check_type = sa.Enum("compliance", "fire_safety", "custom", name="check_type")
    check_status = sa.Enum("pass", "fail", "warning", name="check_status")
    op.create_table(
        "check_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("check_type", check_type, nullable=False),
        sa.Column("status", check_status, nullable=False),
        sa.Column("issues", postgresql.JSONB(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("model_event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("model_events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    insight_type = sa.Enum("delay_risk", "bottleneck", "progress_summary", name="insight_type")
    op.create_table(
        "insights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("type", insight_type, nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    )

    tag_category = sa.Enum("regulation", "location", "phase", "discipline", name="tag_category")
    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", tag_category, nullable=False),
    )
    op.create_index("ix_tags_name", "tags", ["name"])

    node_type = sa.Enum("project", "task", "file", "user", "regulation", "insight", "tag", name="node_type")
    op.create_table(
        "knowledge_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("node_type", node_type, nullable=False),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_knowledge_nodes_reference_id", "knowledge_nodes", ["reference_id"])

    relationship_type = sa.Enum(
        "belongs_to", "assigned_to", "references", "tagged_with", "relates_to", name="relationship_type"
    )
    op.create_table(
        "knowledge_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_node_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relationship_type", relationship_type, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("knowledge_edges")
    op.drop_index("ix_knowledge_nodes_reference_id", table_name="knowledge_nodes")
    op.drop_table("knowledge_nodes")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
    op.drop_table("insights")
    op.drop_table("check_results")
    op.drop_table("model_events")
    op.drop_table("files")
    op.drop_table("tasks")
    op.drop_table("sessions")
    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("firms")

    for enum_name in [
        "relationship_type",
        "node_type",
        "tag_category",
        "insight_type",
        "check_status",
        "check_type",
        "model_event_type",
        "file_source",
        "task_priority",
        "task_status",
        "project_status",
        "user_role",
    ]:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
