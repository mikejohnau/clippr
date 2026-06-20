from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
import os, glob, uuid, subprocess, json, pathlib, shutil

from app.routers.download import jobs, CLIPS_DIR

router = APIRouter()

# output_id -> absolute file path (in-memory; fine for single-server self-hosted use)
_outputs: dict[str, str] = {}


# ── helpers ───────────────────────────────────────────────────────────────────

def _source_path(job_id: str) -> str | None:
    job_dir = os.path.join(CLIPS_DIR, job_id)
    if not os.path.isdir(job_dir):
        return None
    for pat in ["*.mp4", "*.mkv", "*.webm", "*.*"]:
        files = [f for f in glob.glob(os.path.join(job_dir, pat))
                 if not f.endswith(os.sep + "outputs")]
        # skip the outputs subdir
        files = [f for f in files if "outputs" not in f]
        if files:
            return files[0]
    return None


def _duration(path: str) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


# ── models ────────────────────────────────────────────────────────────────────

class Segment(BaseModel):
    start: float          # seconds
    end: float            # seconds
    mute: bool = False
    label: str = ""       # shown as filename hint


class ExtractRequest(BaseModel):
    segments: list[Segment]


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/workspace")
def list_workspace():
    """Return all job files still on disk (available for editing)."""
    result = []
    for job_id, job in jobs.items():
        if job.status != "done" or not job.filename:
            continue
        src = _source_path(job_id)
        if src and os.path.exists(src):
            result.append({
                "job_id": job_id,
                "filename": os.path.basename(src),
                "size": os.path.getsize(src),
            })
    return result


@router.get("/workspace/{job_id}/info")
def workspace_info(job_id: str):
    src = _source_path(job_id)
    if not src:
        raise HTTPException(404, "Source not found")
    return {
        "job_id": job_id,
        "filename": os.path.basename(src),
        "duration": _duration(src),
        "size": os.path.getsize(src),
    }


@router.get("/workspace/{job_id}/stream")
def stream_source(job_id: str):
    """Stream the source video with range support so the browser player can seek."""
    src = _source_path(job_id)
    if not src or not os.path.exists(src):
        raise HTTPException(404, "Source not found")
    return FileResponse(src, media_type="video/mp4")


@router.post("/workspace/{job_id}/extract")
def extract_segments(job_id: str, req: ExtractRequest):
    src = _source_path(job_id)
    if not src or not os.path.exists(src):
        raise HTTPException(404, "Source not found")

    out_dir = os.path.join(CLIPS_DIR, job_id, "outputs")
    os.makedirs(out_dir, exist_ok=True)

    results = []
    for i, seg in enumerate(req.segments):
        output_id = str(uuid.uuid4())
        label = seg.label.strip() or f"clip_{i + 1}"
        # sanitise label for use as filename
        safe_label = "".join(c if c.isalnum() or c in "-_ " else "_" for c in label).strip()
        out_file = os.path.join(out_dir, f"{output_id}_{safe_label}.mp4")

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(seg.start),
            "-to", str(seg.end),
            "-i", src,
            "-c:v", "copy",
        ]
        if seg.mute:
            cmd.append("-an")
        else:
            cmd += ["-c:a", "copy"]
        cmd.append(out_file)

        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(out_file):
            _outputs[output_id] = out_file
            results.append({
                "output_id": output_id,
                "label": label,
                "filename": f"{safe_label}.mp4",
                "size": os.path.getsize(out_file),
            })
        else:
            results.append({
                "output_id": None,
                "label": label,
                "error": (r.stderr or r.stdout or "ffmpeg failed")[-300:],
            })

    return results


@router.get("/outputs/{output_id}/serve")
def serve_output(output_id: str):
    path = _outputs.get(output_id)
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Output not found")
    # strip the UUID prefix to get a clean download name
    basename = os.path.basename(path)
    parts = basename.split("_", 1)
    clean_name = parts[1] if len(parts) == 2 else basename

    def _stream():
        with open(path, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(
        _stream(),
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{clean_name}"'},
    )


@router.delete("/workspace/{job_id}")
def delete_workspace(job_id: str):
    """Delete source + all outputs for a job."""
    job_dir = os.path.join(CLIPS_DIR, job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
    jobs.pop(job_id, None)
    # clean up any in-memory output refs for this job
    stale = [oid for oid, p in _outputs.items() if job_id in p]
    for oid in stale:
        _outputs.pop(oid, None)
    return {"ok": True}
