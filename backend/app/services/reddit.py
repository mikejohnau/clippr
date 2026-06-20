import praw
import os
from app.models import Clip

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")

VIDEO_DOMAINS = {"v.redd.it", "youtube.com", "youtu.be", "gfycat.com", "streamable.com"}

async def search_reddit(topic: str, max_results: int = 10) -> list[Clip]:
    if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
        return []

    reddit = praw.Reddit(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent="clippr/1.0",
    )

    clips = []
    for submission in reddit.subreddit("all").search(
        topic, sort="top", time_filter="month", limit=50
    ):
        if not submission.is_video and submission.domain not in VIDEO_DOMAINS:
            continue
        clips.append(Clip(
            id=submission.id,
            title=submission.title,
            url=submission.url,
            thumbnail=getattr(submission, "thumbnail", None),
            likes=submission.score,
            views=None,
            platform="reddit",
        ))
        if len(clips) >= max_results:
            break

    return clips
