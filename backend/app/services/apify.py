import os, re
import httpx

from app.models import Clip

APIFY_TOKEN = os.getenv("APIFY_API_TOKEN")
APIFY_BASE = "https://api.apify.com/v2/actors"

# username~actor-name slugs, per Apify's actor-id convention
TIKTOK_ACTOR = "clockworks~tiktok-scraper"
INSTAGRAM_ACTOR = "apify~instagram-hashtag-scraper"

# Instagram's hashtag actor rejects spaces/punctuation outright (its input
# validation requires a single token matching this shape) — TikTok's keyword
# search has no such restriction, so only this path needs sanitizing.
_HASHTAG_DISALLOWED = re.compile(r"""[!?.,:;\-+=*&%$#@/~^|<>()\[\]{}"'`\s]+""")


def _to_hashtag(topic: str) -> str:
    return _HASHTAG_DISALLOWED.sub("", topic)


class ApifyNotConfigured(Exception):
    pass


async def _run_actor(actor_id: str, payload: dict, timeout_s: float = 90.0) -> list[dict]:
    if not APIFY_TOKEN:
        raise ApifyNotConfigured("APIFY_API_TOKEN is not set")
    url = f"{APIFY_BASE}/{actor_id}/run-sync-get-dataset-items"
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        r = await client.post(
            url,
            params={"timeout": int(timeout_s)},
            headers={"Authorization": f"Bearer {APIFY_TOKEN}"},
            json=payload,
        )
        r.raise_for_status()
        return r.json()


async def search_tiktok(topic: str, max_items: int = 15, sort: str = "MOST_RELEVANT") -> list[Clip]:
    items = await _run_actor(TIKTOK_ACTOR, {
        "searchQueries": [topic],
        "searchSection": "/video",
        "resultsPerPage": max_items,
        "videoSearchSorting": sort,
    })
    clips = []
    for it in items:
        author = it.get("authorMeta") or {}
        video = it.get("videoMeta") or {}
        post_url = it.get("webVideoUrl") or ""
        if not post_url:
            continue
        # hashtags come back as [{"id":..,"name":..,"title":..,"cover":..}, ...]
        hashtag_names = [h.get("name") for h in (it.get("hashtags") or []) if h.get("name")]
        clips.append(Clip(
            id=str(it.get("id") or post_url),
            title=(it.get("text") or "").strip() or "(no caption)",
            url=post_url,
            thumbnail=video.get("coverUrl"),
            likes=it.get("diggCount"),
            views=it.get("playCount"),
            comments=it.get("commentCount"),
            platform="tiktok",
            channel_name=author.get("nickName") or author.get("name"),
            channel_id=author.get("name"),
            published_at=it.get("createTimeISO"),
            tags=hashtag_names or None,
        ))
    return clips


async def search_instagram(topic: str, max_items: int = 15) -> list[Clip]:
    hashtag = _to_hashtag(topic)
    if not hashtag:
        raise ValueError(f"\"{topic}\" can't be turned into a valid Instagram hashtag")
    items = await _run_actor(INSTAGRAM_ACTOR, {
        "hashtags": [hashtag],
        "resultsType": "reels",
        "resultsLimit": max_items,
        "keywordSearch": True,
    })
    clips = []
    for it in items:
        post_url = it.get("url") or ""
        if not post_url:
            continue
        view_count = it.get("videoPlayCount")
        if view_count is not None and view_count < 0:
            view_count = None  # -1 means hidden by the poster
        caption = (it.get("caption") or "").strip()
        clips.append(Clip(
            id=str(it.get("id") or it.get("shortCode") or post_url),
            title=caption[:200] if caption else "(no caption)",
            url=post_url,
            thumbnail=it.get("displayUrl"),
            likes=it.get("likesCount"),
            views=view_count,
            comments=it.get("commentsCount"),
            platform="instagram",
            channel_name=it.get("ownerFullName") or it.get("ownerUsername"),
            channel_id=it.get("ownerUsername"),
            published_at=it.get("timestamp"),
            tags=it.get("hashtags") or None,
        ))
    return clips
