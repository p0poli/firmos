import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class FileSource(str, enum.Enum):
    bim360 = "BIM360"
    acc = "ACC"
    uploaded = "uploaded"


class File(Base):
    __tablename__ = "files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    source = Column(
        Enum(FileSource, name="file_source", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=FileSource.uploaded,
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    project = relationship("Project", back_populates="files")
    uploader = relationship("User", back_populates="uploaded_files")
