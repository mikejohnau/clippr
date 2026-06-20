from fastapi import APIRouter
import httpx
import asyncio
import yt_dlp

router = APIRouter()

def _ydl_meta(url: str) -> dict:
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True, "cookiesfrombrowser": ("chrome",)}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title") or info.get("description", "")[:100],
                "thumbnail": info.get("thumbnail"),
            }
    except Exception:
        return {"title": None, "thumbnail": None}

@router.get("/")
async def get_meta(url: str):
    """Fetch thumbnail + title for a social URL."""
    if "tiktok.com" in url:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            r = await client.get(f"https://www.tiktok.com/oembed?url={url}")
            if r.status_code == 200:
                data = r.json()
                return {"title": data.get("title"), "thumbnail": data.get("thumbnail_url")}

    # Instagram (and fallback) — use yt-dlp with Chrome cookies
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _ydl_meta, url)
