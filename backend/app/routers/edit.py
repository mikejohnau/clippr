from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
import os, re, glob, uuid, subprocess, json, pathlib, shutil

from app.routers.download import jobs, CLIPS_DIR

router = APIRouter()

_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def ranged_file_response(path: str, request: Request, media_type: str = "video/mp4") -> Response:
    """Serve a file with real HTTP Range support (206 Partial Content).

    Starlette's FileResponse in this dependency version always returns the
    whole file with 200 regardless of a Range header, which breaks seeking
    in <video> players — browsers expect 206 + Content-Range to scrub.
    """
    file_size = os.path.getsize(path)
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(path, media_type=media_type)

    match = _RANGE_RE.match(range_header)
    if not match:
        return FileResponse(path, media_type=media_type)

    start_str, end_str = match.groups()
    if not start_str:
        # Suffix range, e.g. "bytes=-500" means "the last 500 bytes" —
        # not "from byte 0 to 500". Browsers use this to probe the end of
        # an MP4 for its metadata atom when it isn't at the front of the file.
        if not end_str:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})
        suffix_len = int(end_str)
        start = max(0, file_size - suffix_len)
        end = file_size - 1
    else:
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
    end = min(end, file_size - 1)
    if start > end or start >= file_size:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}"})

    chunk_size = end - start + 1

    def _iterfile():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_size
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        _iterfile(),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
        },
    )

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


# font family id -> list of candidate file paths (Debian first, macOS fallback for local dev)
_FONT_FAMILIES: dict[str, list[str]] = {
    "sans-bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
    "sans-regular": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
    "serif-bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    ],
    "mono-bold": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    ],
}

FONTS = {
    "sans-bold": {"name": "Sans Bold"},
    "sans-regular": {"name": "Sans Regular"},
    "serif-bold": {"name": "Serif Bold"},
    "mono-bold": {"name": "Mono Bold"},
}

# template id -> default fontsize used when the segment doesn't override it
_TEMPLATE_DEFAULT_SIZE = {
    "bold-bottom": 54,
    "lower-third": 38,
    "top-banner": 42,
}


def _find_font(family: str) -> str | None:
    for path in _FONT_FAMILIES.get(family, _FONT_FAMILIES["sans-bold"]):
        if os.path.exists(path):
            return path
    return None


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "’")  # avoid quote-escaping headaches; use a typographic apostrophe
        .replace("%", "\\%")
    )


def _ffmpeg_color(hex_color: str) -> str:
    """Convert a #RRGGBB(AA) string to ffmpeg's 0xRRGGBB(AA) color syntax."""
    c = (hex_color or "#ffffff").strip()
    if c.startswith("#"):
        c = "0x" + c[1:]
    elif not c.startswith("0x"):
        c = "0x" + c
    return c


TEMPLATES = {
    "none": {"name": "No overlay"},
    "bold-bottom": {"name": "Bold Caption (Bottom)"},
    "lower-third": {"name": "Lower Third"},
    "top-banner": {"name": "Top Banner"},
}


def _build_overlay_filter(
    template: str, text: str, font_family: str, font_size: int, font_color: str,
) -> str | None:
    text = text.strip()
    if template == "none" or not text:
        return None

    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    esc = _escape_drawtext(text)
    size = font_size or _TEMPLATE_DEFAULT_SIZE.get(template, 42)
    color = _ffmpeg_color(font_color)

    if template == "bold-bottom":
        return (
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-text_h-70"
        )
    if template == "lower-third":
        return (
            "drawbox=x=0:y=ih-ih/6:w=iw:h=ih/6:color=black@0.55:t=fill,"
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            "x=40:y=ih-ih/6+(ih/6-text_h)/2"
        )
    if template == "top-banner":
        return (
            "drawbox=x=0:y=0:w=iw:h=90:color=black@0.65:t=fill,"
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            "x=(w-text_w)/2:y=(90-text_h)/2"
        )
    return None


ASPECT_RATIOS = {
    "original": {"name": "Original"},
    "9:16": {"name": "9:16 (Shorts / Reels / TikTok)"},
    "1:1": {"name": "1:1 (Square)"},
    "4:5": {"name": "4:5 (Instagram feed)"},
    "16:9": {"name": "16:9 (Landscape)"},
}


def _build_crop_filter(aspect_ratio: str) -> str | None:
    if aspect_ratio == "original" or aspect_ratio not in ASPECT_RATIOS:
        return None
    tw, th = (int(x) for x in aspect_ratio.split(":"))
    # crop the largest centered box matching the target ratio that fits inside the source frame
    return f"crop=w='min(iw,ih*{tw}/{th})':h='min(ih,iw*{th}/{tw})'"


# ── models ────────────────────────────────────────────────────────────────────

class Segment(BaseModel):
    start: float          # seconds
    end: float            # seconds
    mute: bool = False
    label: str = ""       # shown as filename hint
    title: str = ""              # overlay text, empty = no overlay
    template: str = "none"       # one of TEMPLATES keys
    font_family: str = "sans-bold"  # one of FONTS keys
    font_size: int = 0           # 0 = use template default
    font_color: str = "#ffffff"  # hex color
    aspect_ratio: str = "original"  # one of ASPECT_RATIOS keys


class ExtractRequest(BaseModel):
    segments: list[Segment]


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates():
    return [{"id": k, "name": v["name"]} for k, v in TEMPLATES.items()]


@router.get("/fonts")
def list_fonts():
    return [{"id": k, "name": v["name"]} for k, v in FONTS.items()]


@router.get("/aspect-ratios")
def list_aspect_ratios():
    return [{"id": k, "name": v["name"]} for k, v in ASPECT_RATIOS.items()]


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
def stream_source(job_id: str, request: Request):
    """Stream the source video with range support so the browser player can seek."""
    src = _source_path(job_id)
    if not src or not os.path.exists(src):
        raise HTTPException(404, "Source not found")
    return ranged_file_response(src, request)


@router.head("/workspace/{job_id}/stream")
def stream_source_head(job_id: str):
    """Browsers' video engines probe with HEAD to check Accept-Ranges/
    Content-Length before deciding how to fetch the body — without this,
    Chrome's <video> stalls forever waiting for a response that never comes."""
    src = _source_path(job_id)
    if not src or not os.path.exists(src):
        raise HTTPException(404, "Source not found")
    return Response(headers={
        "Content-Length": str(os.path.getsize(src)),
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
    })


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

        crop_filter = _build_crop_filter(seg.aspect_ratio)
        overlay_filter = _build_overlay_filter(
            seg.template, seg.title, seg.font_family, seg.font_size, seg.font_color,
        )
        # crop first so overlay coordinates are relative to the final cropped frame
        video_filter = ",".join(f for f in (crop_filter, overlay_filter) if f) or None

        cmd = ["ffmpeg", "-y", "-ss", str(seg.start), "-to", str(seg.end), "-i", src]
        if video_filter:
            # cropping or burning in an overlay requires re-encoding the video stream
            cmd += ["-vf", video_filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
        else:
            cmd += ["-c:v", "copy"]
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
