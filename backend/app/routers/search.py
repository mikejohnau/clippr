from fastapi import APIRouter, Query
from app.services.youtube import search_youtube
from app.services.reddit import search_reddit
from app.models import Clip
from pydantic import BaseModel

router = APIRouter()

class SearchResponse(BaseModel):
    clips: list[Clip]
    next_page_token: str = ""

@router.get("/", response_model=SearchResponse)
async def search(
    topic: str = Query(...),
    max_per_platform: int = Query(default=12, le=25),
    page_token: str = Query(default=""),
    date_filter: str = Query(default=""),
    duration_filter: str = Query(default=""),
    min_views: int = Query(default=0),
):
    clips, next_page_token = await search_youtube(
        topic, max_per_platform, page_token, date_filter, duration_filter, min_views
    )
    # Reddit search only runs on the first page — pagination here isn't
    # comparable to YouTube's page_token, so we don't try to merge it across pages
    if not page_token:
        reddit_clips = await search_reddit(topic, max_per_platform)
        clips = clips + reddit_clips
    return SearchResponse(clips=clips, next_page_token=next_page_token)
