from fastapi import APIRouter
from pydantic import BaseModel
from app.db import get_db

router = APIRouter()

class DownloadRecord(BaseModel):
    clip_id: str
    platform: str
    title: str = ""

@router.post("/")
def record_download(body: DownloadRecord):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO downloads (clip_id, platform, title) VALUES (?,?,?)",
            (body.clip_id, body.platform, body.title)
        )
    return {"ok": True}

@router.get("/")
def get_downloaded():
    with get_db() as conn:
        rows = conn.execute("SELECT clip_id, platform, downloaded_at FROM downloads").fetchall()
        return [dict(r) for r in rows]
