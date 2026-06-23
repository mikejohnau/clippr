from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
import yt_dlp
import uuid
import os
import glob
import pathlib
import shutil


def _download_tiktok(url: str, out_path: str):
    """Download a TikTok video using yt-dlp CLI with curl_cffi impersonation."""
    import subprocess, sys
    yt_dlp_bin = str(pathlib.Path(sys.executable).parent / "yt-dlp")
    result = subprocess.run([
        yt_dlp_bin,
        "--impersonate", "chrome",
        "-f", "best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", os.path.join(out_path, "%(title)s.%(ext)s"),
        url,
    ], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "yt-dlp failed")

router = APIRouter()
CLIPS_DIR = str(pathlib.Path(__file__).parent.parent.parent.parent / "clips")

from app.routers.settings import INSTAGRAM_COOKIES_PATH

class DownloadRequest(BaseModel):
    url: str
    title: str = ""

class DownloadStatus(BaseModel):
    job_id: str
    status: str  # queued, downloading, done, error
    filename: str | None = None
    error: str | None = None
    error_type: str | None = None  # see ERROR_TYPES below; lets the UI show a precise fix, not a guess

jobs: dict[str, DownloadStatus] = {}

# Known, stable substrings from yt-dlp's own error messages, mapped to a
# specific cause + fix. Anything not matched here falls back to "unknown"
# so the UI never has to guess what went wrong.
ERROR_TYPES = {
    "instagram_login_required": [
        "login required",
        "rate-limit reached",
    ],
    "tiktok_blocked": [
        "unable to extract webpage",
        "this content is currently unavailable",
    ],
    "video_unavailable": [
        "video unavailable",
        "private video",
        "this video is not available",
    ],
    "rate_limited": [
        "http error 429",
        "too many requests",
    ],
}


def _classify_error(err: str, is_instagram: bool, is_tiktok: bool) -> str:
    low = err.lower()
    for error_type, needles in ERROR_TYPES.items():
        if any(n in low for n in needles):
            # "login required"/"rate-limit reached" only mean an Instagram cookie
            # problem when the URL is actually Instagram — TikTok/YouTube can also
            # rate-limit, which should fall into the generic rate_limited bucket.
            if error_type == "instagram_login_required" and not is_instagram:
                continue
            return error_type
    return "unknown"

def run_download(job_id: str, url: str):
    job = jobs[job_id]
    job.status = "downloading"
    out_path = os.path.join(CLIPS_DIR, job_id)
    os.makedirs(out_path, exist_ok=True)

    ydl_opts = {
        "outtmpl": os.path.join(out_path, "%(title)s.%(ext)s"),
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
        "merge_output_format": "mp4",
        "extractor_args": {"youtube": {"player_client": ["tv_embedded"]}},
        "postprocessors": [{
            "key": "FFmpegVideoConvertor",
            "preferedformat": "mp4",
        }],
        "quiet": False,
        "no_warnings": False,
    }

    is_tiktok = "tiktok.com" in url
    is_instagram = "instagram.com" in url
    if is_instagram and os.path.exists(INSTAGRAM_COOKIES_PATH):
        ydl_opts["cookiefile"] = INSTAGRAM_COOKIES_PATH

    try:
        if is_tiktok:
            _download_tiktok(url, out_path)
        else:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

        files = glob.glob(os.path.join(out_path, "*.mp4"))
        if not files:
            files = glob.glob(os.path.join(out_path, "*.*"))
        if files:
            job.filename = f"/clips/{job_id}/{os.path.basename(files[0])}"
            job.status = "done"
        else:
            job.status = "error"
            job.error = "Download completed but file not found"
    except Exception as e:
        job.status = "error"
        job.error = str(e)
        job.error_type = _classify_error(job.error, is_instagram, is_tiktok)

@router.post("/", response_model=DownloadStatus)
async def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    job = DownloadStatus(job_id=job_id, status="queued")
    jobs[job_id] = job
    background_tasks.add_task(run_download, job_id, req.url)
    return job

@router.get("/{job_id}", response_model=DownloadStatus)
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/{job_id}/serve")
async def serve_file(job_id: str):
    """Serve the downloaded file for the browser to save. Keeps the file for editing."""
    job = jobs.get(job_id)
    if not job or not job.filename:
        raise HTTPException(status_code=404, detail="File not found")

    rel = job.filename.lstrip("/clips/").lstrip("clips/")
    file_path = os.path.join(CLIPS_DIR, rel)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    filename = os.path.basename(file_path)
    # FileResponse supports Range requests so the browser video player can seek
    return FileResponse(
        file_path,
        media_type="video/mp4",
        filename=filename,
    )

@router.delete("/{job_id}")
async def delete_job(job_id: str):
    job_dir = os.path.join(CLIPS_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir)
    jobs.pop(job_id, None)
    return {"ok": True}
