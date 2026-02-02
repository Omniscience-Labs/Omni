from pydantic import BaseModel
from typing import List, Optional, Literal

class CustomerRequestCreate(BaseModel):
    title: str
    description: str
    request_type: Literal["feature", "bug", "improvement", "agent", "other"]
    priority: Literal["low", "medium", "high", "urgent"]
    attachments: Optional[List[str]] = []
