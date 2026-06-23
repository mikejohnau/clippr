from fastapi import APIRouter
import httpx
import asyncio
import json
import os
import pathlib
import subprocess
import sys
import yt_dlp

from app.routers.settings import INSTAGRAM_COOKIES_PATH

router = APIRouter()


def _iso_duration(seconds) -> str | None:
    """Convert yt-dlp's plain-seconds duration into the ISO-8601-ish format
    the frontend's fmtDuration() already parses (e.g. "PT1M30S")."""
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


def _ydl_meta(url: str) -> dict:
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    if "instagram.com" in url and os.path.exists(INSTAGRAM_COOKIES_PATH):
        ydl_opts["cookiefile"] = INSTAGRAM_COOKIES_PATH
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title") or info.get("description", "")[:100],
                "thumbnail": info.get("thumbnail"),
                "views": info.get("view_count"),
                "likes": info.get("like_count"),
                "comments": info.get("comment_count"),
                "duration": _iso_duration(info.get("duration")),
            }
    except Exception as e:
        print(f"[meta] yt-dlp metadata fetch failed for {url}: {e}")
        return {"title": None, "thumbnail": None, "error": str(e)}


def _tiktok_meta(url: str) -> dict | None:
    """TikTok's oembed endpoint only returns title/thumbnail, no stats.
    Use the yt-dlp CLI with browser impersonation (same as the download
    path) to pull view/like/comment counts and duration too."""
    yt_dlp_bin = str(pathlib.Path(sys.executable).parent / "yt-dlp")
    try:
        result = subprocess.run(
            [yt_dlp_bin, "--impersonate", "chrome", "--skip-download", "-j", url],
            capture_output=True, text=True, timeout=20,
        )
        if result.returncode == 0 and result.stdout.strip():
            info = json.loads(result.stdout.strip().splitlines()[0])
            return {
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "views": info.get("view_count"),
                "likes": info.get("like_count"),
                "comments": info.get("comment_count"),
                "duration": _iso_duration(info.get("duration")),
            }
        print(f"[meta] tiktok yt-dlp metadata fetch failed for {url}: {result.stderr.strip()[-300:]}")
    except Exception as e:
        print(f"[meta] tiktok yt-dlp metadata fetch failed for {url}: {e}")
    return None


@router.get("/")
async def get_meta(url: str):
    """Fetch thumbnail + title + stats for a social URL."""
    loop = asyncio.get_event_loop()

    if "tiktok.com" in url:
        result = await loop.run_in_executor(None, _tiktok_meta, url)
        if result:
            return result
        # fall back to oembed for at least title/thumbnail if yt-dlp got blocked
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(f"https://www.tiktok.com/oembed?url={url}")
            if r.status_code == 200:
                data = r.json()
                return {"title": data.get("title"), "thumbnail": data.get("thumbnail_url")}
        return {"title": None, "thumbnail": None}

    # Instagram (and fallback) — use yt-dlp, with Instagram session cookies if uploaded
    return await loop.run_in_executor(None, _ydl_meta, url)
