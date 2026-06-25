from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models import Clip
from app.services.apify import search_tiktok, search_instagram, ApifyNotConfigured

router = APIRouter()


class SocialSearchResponse(BaseModel):
    clips: list[Clip]


@router.get("/", response_model=SocialSearchResponse)
async def search_social(
    topic: str = Query(...),
    platform: str = Query(..., pattern="^(tiktok|instagram)$"),
    max_items: int = Query(default=15, le=30),
):
    topic = topic.strip().lstrip("#")
    if not topic:
        raise HTTPException(400, "Topic is required")

    try:
        if platform == "tiktok":
            clips = await search_tiktok(topic, max_items)
        else:
            clips = await search_instagram(topic, max_items)
    except ApifyNotConfigured:
        raise HTTPException(503, "Apify isn't configured — set APIFY_API_TOKEN in the backend .env file")
    except Exception as e:
        raise HTTPException(502, f"Search failed: {e}")

    # Surface the most-viral-looking results first, same framing as YouTube search.
    clips.sort(key=lambda c: (c.views or 0, c.likes or 0), reverse=True)
    return SocialSearchResponse(clips=clips)
