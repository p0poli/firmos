from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from models import InsightType


class InsightOut(BaseModel):
    id: UUID
    type: InsightType
    content: str
    timestamp: datetime
    project_id: UUID

    model_config = ConfigDict(from_attributes=True)
