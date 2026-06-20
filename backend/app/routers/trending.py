from fastapi import APIRouter, Query
from googleapiclient.discovery import build
from app.models import Clip
from app.services.youtube import _clip_from_item
import os, urllib.request, xml.etree.ElementTree as ET

router = APIRouter()

NS = "https://trends.google.com/trending/rss"

REGIONS = [
    ("US", "United States"), ("GB", "United Kingdom"), ("AU", "Australia"),
    ("CA", "Canada"), ("IN", "India"), ("DE", "Germany"), ("FR", "France"),
    ("BR", "Brazil"), ("MX", "Mexico"), ("JP", "Japan"), ("KR", "South Korea"),
    ("ZA", "South Africa"), ("NG", "Nigeria"), ("AE", "UAE"), ("SG", "Singapore"),
]

@router.get("/google/regions")
async def google_regions():
    return [{"code": code, "name": name} for code, name in REGIONS]

@router.get("/google")
async def google_trends(geo: str = Query(default="US")):
    url = f"https://trends.google.com/trending/rss?geo={geo}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        data = urllib.request.urlopen(req, timeout=8).read().decode()
    except Exception:
        return []
    root = ET.fromstring(data)
    results = []
    for item in root.findall(".//item"):
        title = item.findtext("title") or ""
        traffic = item.findtext(f"{{{NS}}}approx_traffic") or ""
        picture = item.findtext(f"{{{NS}}}picture") or ""
        picture_source = item.findtext(f"{{{NS}}}picture_source") or ""
        pub_date = item.findtext("pubDate") or ""
        news_items = []
        for ni in item.findall(f"{{{NS}}}news_item"):
            ni_title = ni.findtext(f"{{{NS}}}news_item_title") or ""
            ni_url = ni.findtext(f"{{{NS}}}news_item_url") or ""
            ni_pic = ni.findtext(f"{{{NS}}}news_item_picture") or ""
            ni_source = ni.findtext(f"{{{NS}}}news_item_source") or ""
            if ni_title:
                news_items.append({"title": ni_title, "url": ni_url, "picture": ni_pic, "source": ni_source})
        if title:
            results.append({
                "topic": title, "traffic": traffic,
                "picture": picture, "picture_source": picture_source,
                "pub_date": pub_date, "news_items": news_items,
            })
    return results
API_KEY = os.getenv("YOUTUBE_API_KEY")

CATEGORY_NAMES = {
    "0":  "All",
    "1":  "Film & Animation",
    "2":  "Autos & Vehicles",
    "10": "Music",
    "15": "Pets & Animals",
    "17": "Sports",
    "20": "Gaming",
    "22": "People & Blogs",
    "23": "Comedy",
    "24": "Entertainment",
    "25": "News & Politics",
    "26": "How-to & Style",
    "27": "Education",
    "28": "Science & Technology",
    "29": "Nonprofits & Activism",
}

@router.get("/categories")
async def get_categories():
    items = [{"id": k, "name": v} for k, v in CATEGORY_NAMES.items()]
    all_item = next(i for i in items if i["id"] == "0")
    rest = sorted((i for i in items if i["id"] != "0"), key=lambda x: x["name"])
    return [all_item] + rest

@router.get("/", response_model=list[Clip])
async def get_trending(
    category_id: str = Query(default="0"),
    region: str = Query(default="US"),
    max_results: int = Query(default=24, le=50),
):
    if not API_KEY:
        return []

    youtube = build("youtube", "v3", developerKey=API_KEY)
    resp = youtube.videos().list(
        part="snippet,statistics,contentDetails,localizations",
        chart="mostPopular",
        regionCode=region,
        videoCategoryId=category_id,
        maxResults=max_results,
    ).execute()

    return [_clip_from_item(item) for item in resp.get("items", [])]
