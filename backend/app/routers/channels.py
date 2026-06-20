from fastapi import APIRouter, Query, Path, HTTPException
from googleapiclient.discovery import build
from pydantic import BaseModel
import os

router = APIRouter()
API_KEY = os.getenv("YOUTUBE_API_KEY")


class ChannelDetail(BaseModel):
    id: str
    title: str
    description: str | None
    custom_url: str | None
    thumbnail: str | None
    banner: str | None
    subscribers: int | None
    total_views: int | None
    video_count: int | None
    country: str | None
    published_at: str | None
    url: str
    recent_videos: list[dict] = []


@router.get("/info/{channel_id}", response_model=ChannelDetail)
async def get_channel(channel_id: str = Path(...)):
    if not API_KEY:
        raise HTTPException(status_code=503, detail="No API key")
    yt = build("youtube", "v3", developerKey=API_KEY)

    ch_resp = yt.channels().list(
        part="snippet,statistics,brandingSettings,contentDetails",
        id=channel_id,
    ).execute()
    items = ch_resp.get("items", [])
    if not items:
        raise HTTPException(status_code=404, detail="Channel not found")
    ch = items[0]
    snippet = ch.get("snippet", {})
    stats = ch.get("statistics", {})
    branding = ch.get("brandingSettings", {})
    uploads_pl = ch.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")

    thumbnails = snippet.get("thumbnails", {})
    thumb = (thumbnails.get("high") or thumbnails.get("medium") or thumbnails.get("default") or {}).get("url")
    banner_base = (branding.get("image") or {}).get("bannerExternalUrl")
    banner = f"{banner_base}=w1280-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj" if banner_base else None

    recent_videos = []
    if uploads_pl:
        pl_resp = yt.playlistItems().list(
            part="contentDetails", playlistId=uploads_pl, maxResults=6
        ).execute()
        vids = [i["contentDetails"]["videoId"] for i in pl_resp.get("items", [])]
        if vids:
            v_resp = yt.videos().list(part="snippet,statistics", id=",".join(vids)).execute()
            for v in v_resp.get("items", []):
                vs = v.get("statistics", {})
                vsnip = v.get("snippet", {})
                recent_videos.append({
                    "id": v["id"],
                    "title": vsnip.get("title", ""),
                    "thumbnail": vsnip.get("thumbnails", {}).get("high", {}).get("url"),
                    "views": int(vs["viewCount"]) if vs.get("viewCount") else None,
                    "likes": int(vs["likeCount"]) if vs.get("likeCount") else None,
                    "published_at": vsnip.get("publishedAt"),
                    "url": f"https://www.youtube.com/watch?v={v['id']}",
                })

    return ChannelDetail(
        id=channel_id,
        title=snippet.get("title", ""),
        description=snippet.get("description", "")[:600] or None,
        custom_url=snippet.get("customUrl"),
        thumbnail=thumb,
        banner=banner,
        subscribers=int(stats["subscriberCount"]) if stats.get("subscriberCount") else None,
        total_views=int(stats["viewCount"]) if stats.get("viewCount") else None,
        video_count=int(stats["videoCount"]) if stats.get("videoCount") else None,
        country=snippet.get("country"),
        published_at=snippet.get("publishedAt"),
        url=f"https://www.youtube.com/channel/{channel_id}",
        recent_videos=recent_videos,
    )

CATEGORY_KEYWORDS: dict[str, str | None] = {
    "0":  "viral trending",
    "1":  "film animation",
    "2":  "autos cars",
    "10": "music",
    "15": "pets animals",
    "17": "sports",
    "20": "gaming",
    "22": "vlog lifestyle",
    "23": "comedy",
    "24": "entertainment",
    "25": "news politics",
    "26": "howto style beauty",
    "27": "education learning",
    "28": "science technology",
    "29": "nonprofit activism",
}


class Channel(BaseModel):
    id: str
    title: str
    thumbnail: str | None
    subscribers: int
    recent_views: int
    momentum: float
    url: str


@router.get("/rising", response_model=list[Channel])
async def rising_channels(
    category_id: str = Query(default="0"),
    region: str = Query(default="US"),
    max_results: int = Query(default=20, le=40),
):
    if not API_KEY:
        return []

    yt = build("youtube", "v3", developerKey=API_KEY)

    # 1. Search for channels — use keyword when category specified (100 quota units)
    keyword = CATEGORY_KEYWORDS.get(category_id) or "viral trending"
    search_kwargs: dict = dict(
        part="snippet",
        type="channel",
        q=keyword,
        regionCode=region,
        maxResults=max_results,
        order="viewCount",
    )

    search_resp = yt.search().list(**search_kwargs).execute()
    channel_ids = [item["snippet"]["channelId"] for item in search_resp.get("items", [])]
    if not channel_ids:
        return []

    # 2. Batch-fetch channel stats + upload playlist IDs (1 quota unit)
    ch_resp = yt.channels().list(
        part="snippet,statistics,contentDetails",
        id=",".join(channel_ids),
        maxResults=len(channel_ids),
    ).execute()

    channels_meta: dict[str, dict] = {}
    playlist_ids: dict[str, str] = {}
    for ch in ch_resp.get("items", []):
        cid = ch["id"]
        stats = ch.get("statistics", {})
        subs = int(stats["subscriberCount"]) if stats.get("subscriberCount") else 0
        pl_id = ch.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        thumb = (ch["snippet"].get("thumbnails", {}).get("high") or
                 ch["snippet"].get("thumbnails", {}).get("default") or {}).get("url")
        channels_meta[cid] = {"title": ch["snippet"]["title"], "thumbnail": thumb, "subscribers": subs}
        if pl_id:
            playlist_ids[cid] = pl_id

    # 3. Fetch recent video IDs from each channel's upload playlist (1 unit each)
    all_video_ids: list[str] = []
    channel_video_map: dict[str, list[str]] = {}
    for cid, pl_id in playlist_ids.items():
        try:
            pl_resp = yt.playlistItems().list(
                part="contentDetails", playlistId=pl_id, maxResults=8
            ).execute()
            vids = [i["contentDetails"]["videoId"] for i in pl_resp.get("items", [])]
            channel_video_map[cid] = vids
            all_video_ids.extend(vids)
        except Exception:
            channel_video_map[cid] = []

    # 4. Batch-fetch video view counts (1 quota unit per 50 videos)
    video_views: dict[str, int] = {}
    for i in range(0, len(all_video_ids), 50):
        batch = all_video_ids[i:i + 50]
        v_resp = yt.videos().list(part="statistics", id=",".join(batch)).execute()
        for v in v_resp.get("items", []):
            video_views[v["id"]] = int(v["statistics"].get("viewCount", 0))

    # 5. Score and sort
    results: list[Channel] = []
    for cid in channel_ids:
        meta = channels_meta.get(cid)
        if not meta:
            continue
        subs = meta["subscribers"]
        recent_views = sum(video_views.get(vid, 0) for vid in channel_video_map.get(cid, []))
        momentum = round(recent_views / subs, 2) if subs > 0 else 0.0
        results.append(Channel(
            id=cid,
            title=meta["title"],
            thumbnail=meta["thumbnail"],
            subscribers=subs,
            recent_views=recent_views,
            momentum=momentum,
            url=f"https://www.youtube.com/channel/{cid}",
        ))

    results.sort(key=lambda c: c.momentum, reverse=True)
    return results
