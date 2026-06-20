from googleapiclient.discovery import build
from app.models import Clip
from datetime import datetime, timedelta, timezone
import os

API_KEY = os.getenv("YOUTUBE_API_KEY")

CATEGORY_MAP = {
    "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music",
    "15": "Pets & Animals", "17": "Sports", "18": "Short Movies",
    "19": "Travel & Events", "20": "Gaming", "21": "Videoblogging",
    "22": "People & Blogs", "23": "Comedy", "24": "Entertainment",
    "25": "News & Politics", "26": "How-to & Style", "27": "Education",
    "28": "Science & Technology", "29": "Nonprofits & Activism",
}

def _published_after(period: str) -> str | None:
    now = datetime.now(timezone.utc)
    delta = {"day": 1, "week": 7, "month": 30, "year": 365}.get(period)
    if delta is None:
        return None
    return (now - timedelta(days=delta)).strftime("%Y-%m-%dT%H:%M:%SZ")

def _clip_from_item(item: dict) -> Clip:
    stats = item.get("statistics", {})
    snippet = item.get("snippet", {})
    content = item.get("contentDetails", {})
    return Clip(
        id=item["id"],
        title=snippet.get("title", ""),
        url=f"https://www.youtube.com/watch?v={item['id']}",
        thumbnail=snippet.get("thumbnails", {}).get("high", {}).get("url"),
        likes=int(stats["likeCount"]) if stats.get("likeCount") else None,
        views=int(stats["viewCount"]) if stats.get("viewCount") else None,
        comments=int(stats["commentCount"]) if stats.get("commentCount") else None,
        platform="youtube",
        duration=content.get("duration"),
        channel_name=snippet.get("channelTitle"),
        channel_id=snippet.get("channelId"),
        published_at=snippet.get("publishedAt"),
        description=snippet.get("description", "")[:500] or None,
        tags=snippet.get("tags", [])[:20] or None,
        category=CATEGORY_MAP.get(snippet.get("categoryId", ""), None),
    )

async def search_youtube(
    topic: str,
    max_results: int = 12,
    page_token: str = "",
    date_filter: str = "",
    duration_filter: str = "",
    min_views: int = 0,
) -> tuple[list[Clip], str]:
    if not API_KEY:
        return [], ""

    youtube = build("youtube", "v3", developerKey=API_KEY)

    kwargs: dict = dict(
        q=topic,
        part="id,snippet",
        type="video",
        maxResults=min(max_results * 2, 50),
        order="viewCount",
    )
    if page_token:
        kwargs["pageToken"] = page_token
    if duration_filter in ("short", "medium", "long"):
        kwargs["videoDuration"] = duration_filter
    pub_after = _published_after(date_filter)
    if pub_after:
        kwargs["publishedAfter"] = pub_after

    search_resp = youtube.search().list(**kwargs).execute()
    next_page_token = search_resp.get("nextPageToken", "")

    video_ids = [item["id"]["videoId"] for item in search_resp.get("items", [])]
    if not video_ids:
        return [], ""

    stats_resp = youtube.videos().list(
        part="statistics,contentDetails,snippet",
        id=",".join(video_ids),
    ).execute()

    clips = []
    for item in stats_resp.get("items", []):
        clip = _clip_from_item(item)
        if min_views and (clip.views or 0) < min_views:
            continue
        clips.append(clip)

    clips.sort(key=lambda c: c.likes or 0, reverse=True)
    return clips[:max_results], next_page_token
