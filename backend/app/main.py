from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
import os, urllib.request

import asyncio

from app.db import init_db
from app.cleanup import run_periodic_cleanup
from app.routers import search, download, meta, trending, channels
from app.routers import projects, downloads_history, edit, settings, ranking, splitscreen, commentary, image_story, text_story

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
    # Sweeps /clips on startup and every few hours after — downloaded source
    # clips and ranking-build temp files are a working area, not permanent
    # storage, so old ones get deleted automatically instead of piling up.
    asyncio.create_task(run_periodic_cleanup())

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
app.include_router(settings.router, prefix="/api/settings")
app.include_router(ranking.router, prefix="/api/ranking")
app.include_router(splitscreen.router, prefix="/api/splitscreen")
app.include_router(commentary.router, prefix="/api/commentary")
app.include_router(image_story.router, prefix="/api/imagestory")
app.include_router(text_story.router, prefix="/api/textstory")

CLIPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "clips")
CLIPS_DIR = os.path.abspath(CLIPS_DIR)
os.makedirs(CLIPS_DIR, exist_ok=True)
app.mount("/clips", StaticFiles(directory=CLIPS_DIR), name="clips")
