import asyncio
import os
import praw
from app.models import Clip

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")

# Domains known to host embeddable/downloadable video that PRAW's is_video
# flag doesn't catch (that flag is true only for natively-hosted v.redd.it posts)
EXTERNAL_VIDEO_DOMAINS = {"youtube.com", "youtu.be", "gfycat.com", "streamable.com", "redgifs.com"}

# Reddit returns these literal strings instead of a real thumbnail URL when
# there isn't one — filter them out rather than rendering a broken image
_PLACEHOLDER_THUMBS = {"self", "default", "nsfw", "spoiler", "image"}


def _iso_duration(seconds) -> str | None:
    if not seconds:
        return None
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    out = "PT"
    if h:
        out += f"{h}H"
    if m:
        out += f"{m}M"
    if s or not (h or m):
        out += f"{s}S"
    return out


def _search_reddit_sync(topic: str, max_results: int) -> list[Clip]:
    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent="clippr/1.0",
    )

    clips = []
    for submission in reddit.subreddit("all").search(
        topic, sort="top", time_filter="month", limit=50
    ):
        is_native_video = bool(getattr(submission, "is_video", False))
        if not is_native_video and submission.domain not in EXTERNAL_VIDEO_DOMAINS:
            continue

        thumb = getattr(submission, "thumbnail", None)
        if thumb in _PLACEHOLDER_THUMBS or not thumb:
            thumb = None

        duration = None
        if is_native_video:
            media = getattr(submission, "media", None) or {}
            duration = _iso_duration((media.get("reddit_video") or {}).get("duration"))

        # Native v.redd.it posts: yt-dlp's reddit extractor needs the discussion
        # permalink. External links (e.g. a Reddit post pointing at a YouTube
        # video): yt-dlp needs the actual external URL, not Reddit's wrapper page.
        video_url = (
            f"https://www.reddit.com{submission.permalink}"
            if is_native_video else submission.url
        )

        clips.append(Clip(
            id=submission.id,
            title=submission.title,
            url=video_url,
            thumbnail=thumb,
            likes=submission.score,
            comments=submission.num_comments,
            views=None,
            duration=duration,
            channel_name=f"r/{submission.subreddit.display_name}",
            published_at=None,
            platform="reddit",
        ))
        if len(clips) >= max_results:
            break

    return clips


async def search_reddit(topic: str, max_results: int = 10) -> list[Clip]:
    if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
        return []
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _search_reddit_sync, topic, max_results)
    except Exception as e:
        print(f"[reddit] search failed for '{topic}': {e}")
        return []
