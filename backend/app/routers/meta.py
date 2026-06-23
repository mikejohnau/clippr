from fastapi import APIRouter
import httpx
import asyncio
import os
import yt_dlp

from app.routers.settings import INSTAGRAM_COOKIES_PATH

router = APIRouter()

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
            }
    except Exception as e:
        print(f"[meta] yt-dlp metadata fetch failed for {url}: {e}")
        return {"title": None, "thumbnail": None, "error": str(e)}

@router.get("/")
async def get_meta(url: str):
    """Fetch thumbnail + title for a social URL."""
    if "tiktok.com" in url:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(f"https://www.tiktok.com/oembed?url={url}")
            if r.status_code == 200:
                data = r.json()
                return {"title": data.get("title"), "thumbnail": data.get("thumbnail_url")}

    # Instagram (and fallback) — use yt-dlp, with Instagram session cookies if uploaded
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _ydl_meta, url)
