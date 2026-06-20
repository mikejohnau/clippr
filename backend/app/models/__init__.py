from pydantic import BaseModel
from typing import Optional

class Clip(BaseModel):
    id: str
    title: str
    url: str
    thumbnail: Optional[str] = None
    likes: Optional[int] = None
    views: Optional[int] = None
    comments: Optional[int] = None
    platform: str
    duration: Optional[str] = None       # ISO 8601 e.g. PT4M13S
    channel_name: Optional[str] = None
    channel_id: Optional[str] = None
    published_at: Optional[str] = None   # ISO 8601 datetime
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    category: Optional[str] = None
