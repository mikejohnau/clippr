from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.models import Clip
from app.services.apify import search_tiktok, search_instagram, ApifyNotConfigured

router = APIRouter()

_DATE_FILTER_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}


class SocialSearchResponse(BaseModel):
    clips: list[Clip]


def _parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/", response_model=SocialSearchResponse)
async def search_social(
    topic: str = Query(...),
    platform: str = Query(..., pattern="^(tiktok|instagram)$"),
    max_items: int = Query(default=15, le=30),
    date_filter: str = Query(default=""),   # "", day, week, month, year
    min_views: int = Query(default=0),
    min_likes: int = Query(default=0),
):
    topic = topic.strip().lstrip("#")
    if not topic:
        raise HTTPException(400, "Topic is required")

    try:
        if platform == "tiktok":
            clips = await search_tiktok(topic, max_items, date_filter=date_filter)
        else:
            clips = await search_instagram(topic, max_items)
    except ApifyNotConfigured:
        raise HTTPException(503, "Apify isn't configured — set APIFY_API_TOKEN in the backend .env file")
    except Exception as e:
        raise HTTPException(502, f"Search failed: {e}")

    # Neither actor supports a minimum-engagement input, and Instagram's has
    # no date filter at all — enforce the exact thresholds ourselves. (For
    # TikTok this also tightens up the coarse date *bucket* the actor used
    # to a precise cutoff.)
    if date_filter in _DATE_FILTER_DAYS:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_DATE_FILTER_DAYS[date_filter])
        clips = [c for c in clips if (published := _parse_published_at(c.published_at)) is None or published >= cutoff]
    if min_views:
        clips = [c for c in clips if (c.views or 0) >= min_views]
    if min_likes:
        clips = [c for c in clips if (c.likes or 0) >= min_likes]

    # Surface the most-viral-looking results first, same framing as YouTube search.
    clips.sort(key=lambda c: (c.views or 0, c.likes or 0), reverse=True)
    return SocialSearchResponse(clips=clips)
