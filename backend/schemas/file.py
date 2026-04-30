from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models import FileSource


class FileCreate(BaseModel):
    name: str
    url: str
    source: FileSource = FileSource.uploaded
    project_id: UUID


class FileOut(BaseModel):
    id: UUID
    name: str
    url: str
    source: FileSource
    project_id: UUID
    uploaded_by: Optional[UUID]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
