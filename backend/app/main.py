from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
import os, urllib.request

from app.db import init_db
from app.routers import search, download, meta, trending, channels
from app.routers import projects, downloads_history, edit

app = FastAPI(title="Clippr")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/api/imgproxy")
async def img_proxy(url: str = Query(...)):
    try:
        req = urllib.request.Request(url, headers={"Referer": "https://www.youtube.com/", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = r.read()
            ct = r.headers.get("Content-Type", "image/jpeg")
        return Response(content=data, media_type=ct)
    except Exception:
        return Response(status_code=404)

app.include_router(search.router, prefix="/api/search")
app.include_router(download.router, prefix="/api/download")
app.include_router(meta.router, prefix="/api/meta")
app.include_router(trending.router, prefix="/api/trending")
app.include_router(channels.router, prefix="/api/channels")
app.include_router(projects.router, prefix="/api/projects")
app.include_router(downloads_history.router, prefix="/api/downloads-history")
app.include_router(edit.router, prefix="/api/edit")

CLIPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "clips")
CLIPS_DIR = os.path.abspath(CLIPS_DIR)
os.makedirs(CLIPS_DIR, exist_ok=True)
app.mount("/clips", StaticFiles(directory=CLIPS_DIR), name="clips")
