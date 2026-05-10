import enum
import uuid

from sqlalchemy import Column, Date, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in-progress"
    review = "review"
    done = "done"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # values_callable forces SQLAlchemy to send the enum's `.value`
    # ("in-progress") rather than the Python attribute name
    # ("in_progress"), matching the Postgres enum type definition.
    status = Column(
        Enum(TaskStatus, name="task_status", values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
        default=TaskStatus.todo,
    )
    priority = Column(
        Enum(TaskPriority, name="task_priority", values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
        default=TaskPriority.medium,
    )
    due_date = Column(Date, nullable=True)

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    assigned_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    project = relationship("Project", back_populates="tasks")
    assigned_user = relationship("User", back_populates="assigned_tasks")
    logs = relationship("TaskLog", back_populates="task", cascade="all, delete-orphan")
    time_logs = relationship("TimeLog", back_populates="task", cascade="all, delete-orphan")
