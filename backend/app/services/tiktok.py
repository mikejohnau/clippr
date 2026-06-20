import asyncio
import httpx
import browser_cookie3
from app.models import Clip


def _get_cookies() -> dict:
    try:
        cj = browser_cookie3.chrome(domain_name='.tiktok.com')
        return {c.name: c.value for c in cj}
    except Exception:
        return {}


async def search_tiktok(topic: str, max_results: int = 10) -> list[Clip]:
    loop = asyncio.get_event_loop()
    cookies = await loop.run_in_executor(None, _get_cookies)
    if not cookies:
        return []

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Referer": "https://www.tiktok.com/",
        "Accept": "application/json, text/plain, */*",
    }

    params = {
        "keyword": topic,
        "count": max_results * 2,
        "cursor": 0,
        "app_language": "en",
        "app_name": "tiktok_web",
        "channel": "tiktok_web",
        "device_platform": "web_pc",
        "focus_state": "true",
        "from_page": "search",
        "history_len": 2,
        "is_fullscreen": "false",
        "is_page_visible": "true",
        "web_search_code": '{"tiktok":{"client_params_x":{"search_engine":{"ies_mt_user_live_video_card_use_libra":1,"mt_search_general_user_live_card":1}},"search_server":{}}}',
        "WebIdLastTime": cookies.get("WIDLastTime", ""),
    }

    clips = []
    async with httpx.AsyncClient(headers=headers, cookies=cookies, follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(
                "https://www.tiktok.com/api/search/general/full/",
                params=params,
            )
            if resp.status_code != 200:
                print(f"TikTok status: {resp.status_code}")
                return []

            data = resp.json()
            for item in data.get("data", []):
                video = item.get("item", {})
                if not video or video.get("type") != 1:
                    continue
                vid_id = video.get("id", "")
                author = video.get("author", {}).get("uniqueId", "user")
                stats = video.get("stats", {})
                clips.append(Clip(
                    id=vid_id,
                    title=(video.get("desc") or "TikTok clip")[:120],
                    url=f"https://www.tiktok.com/@{author}/video/{vid_id}",
                    thumbnail=video.get("video", {}).get("cover"),
                    likes=stats.get("diggCount"),
                    views=stats.get("playCount"),
                    platform="tiktok",
                ))
                if len(clips) >= max_results:
                    break
        except Exception as e:
            print(f"TikTok error: {e}")
            return []

    clips.sort(key=lambda c: c.likes or 0, reverse=True)
    return clips
