import enum
import uuid

from sqlalchemy import Column, Enum, String
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class TagCategory(str, enum.Enum):
    regulation = "regulation"
    location = "location"
    phase = "phase"
    discipline = "discipline"


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, index=True)
    category = Column(
        Enum(TagCategory, name="tag_category", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
