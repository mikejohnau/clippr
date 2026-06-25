from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel
import os, re, glob, uuid, subprocess, json, pathlib, shutil, textwrap

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


def _video_dims(path: str) -> tuple[int, int]:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    try:
        w, h = r.stdout.strip().split(",")
        return int(w), int(h)
    except Exception:
        return (0, 0)


def _cropped_width(src_width: int, src_height: int, aspect_ratio: str) -> int:
    """Mirror _build_crop_filter's crop math in Python, to know the actual
    pixel width text will need to fit inside (for word-wrapping)."""
    if src_width <= 0 or src_height <= 0:
        return 0
    if aspect_ratio == "original" or aspect_ratio not in ASPECT_RATIOS:
        return src_width
    tw, th = (int(x) for x in aspect_ratio.split(":"))
    return min(src_width, int(src_height * tw / th))


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


def _wrap_text(text: str, canvas_width: int, font_size: int, side_margin: int = 80) -> str:
    """Word-wrap text to fit within the video's width, so long titles/CTAs
    don't run off the edges of narrow canvases (e.g. 9:16). Returns text with
    real newline characters — ffmpeg's drawtext renders those as line breaks."""
    if canvas_width <= 0 or font_size <= 0:
        return text
    avg_char_width = font_size * 0.6  # rough estimate for a bold sans-serif glyph
    chars_per_line = max(4, int((canvas_width - 2 * side_margin) / avg_char_width))
    wrapped = textwrap.wrap(text, width=chars_per_line)
    return "\n".join(wrapped) if wrapped else text


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


_TEMPLATE_DEFAULT_STROKE_WIDTH = {
    "bold-bottom": 4,
    "lower-third": 2,
    "top-banner": 2,
}


def _build_overlay_filter(
    template: str, text: str, font_family: str, font_size: int, font_color: str,
    bg_color: str = "", stroke_width: int = -1, stroke_color: str = "", canvas_width: int = 0,
) -> str | None:
    text = text.strip()
    if template == "none" or not text:
        return None

    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    size = font_size or _TEMPLATE_DEFAULT_SIZE.get(template, 42)
    # lower-third/top-banner have side padding (x=40) the full-width box doesn't;
    # bold-bottom is centered with no fixed box, so just use the canvas width directly.
    margin = 40 if template in ("lower-third", "top-banner") else 80
    esc = _escape_drawtext(_wrap_text(text, canvas_width, size, margin))
    color = _ffmpeg_color(font_color)

    # stroke_width < 0 means "use the template default"; 0 means "no stroke"
    width = _TEMPLATE_DEFAULT_STROKE_WIDTH.get(template, 2) if stroke_width < 0 else stroke_width
    if width > 0:
        s_color = _ffmpeg_color(stroke_color) if stroke_color else ("black" if template == "bold-bottom" else "black@0.8")
        stroke = f"borderw={width}:bordercolor={s_color}:"
    else:
        stroke = ""

    # Quote x/y — unquoted parentheses in a drawtext option value are parsed
    # inconsistently between a plain -vf chain and a labelled -filter_complex
    # chain (the latter is stricter and fails with "missing '('" otherwise).
    if template == "bold-bottom":
        box = f":box=1:boxcolor={_ffmpeg_color(bg_color)}:boxborderw=14" if bg_color else ""
        return (
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            f"{stroke}x='(w-text_w)/2':y='h-text_h-70'{box}"
        )
    if template == "lower-third":
        bar_color = _ffmpeg_color(bg_color) + "@0.55" if bg_color else "black@0.55"
        return (
            # drawbox uses iw/ih (input dims); drawtext has no such constants —
            # it only knows w/h (the frame dims), so its y expression must use h.
            f"drawbox=x=0:y=ih-ih/6:w=iw:h=ih/6:color={bar_color}:t=fill,"
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            f"{stroke}x='40':y='h-h/6+(h/6-text_h)/2'"
        )
    if template == "top-banner":
        bar_color = _ffmpeg_color(bg_color) + "@0.65" if bg_color else "black@0.65"
        return (
            f"drawbox=x=0:y=0:w=iw:h=90:color={bar_color}:t=fill,"
            f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
            f"{stroke}x='(w-text_w)/2':y='(90-text_h)/2'"
        )
    return None


CTA_POSITIONS = {
    "top-left": {"name": "Top left", "x": "40", "y": "40"},
    "top-right": {"name": "Top right", "x": "w-text_w-40", "y": "40"},
    "top-center": {"name": "Top center", "x": "(w-text_w)/2", "y": "40"},
    "bottom-left": {"name": "Bottom left", "x": "40", "y": "h-text_h-40"},
    "bottom-right": {"name": "Bottom right", "x": "w-text_w-40", "y": "h-text_h-40"},
    "bottom-center": {"name": "Bottom center", "x": "(w-text_w)/2", "y": "h-text_h-40"},
    "center": {"name": "Center", "x": "(w-text_w)/2", "y": "(h-text_h)/2"},
}


CTA_ANIMATIONS = {
    "none": {"name": "None (just appears)"},
    "fade": {"name": "Fade in/out"},
    "slide": {"name": "Slide in, fade out"},
}


CTA_MOMENTS = {
    "start": {"name": "Start of video"},
    "middle": {"name": "Middle of video"},
    "end": {"name": "End of video"},
}


def _cta_center_time(moment: str, show_for: float, transition: float, clip_duration: float) -> float:
    """The timestamp (within this clip's own local timeline) around which a
    CTA's hold period should be centered, so that its appear/disappear
    envelope lands exactly at the start, middle, or end of the clip."""
    half_hold = show_for / 2
    if moment == "start":
        return half_hold + transition  # envelope begins exactly at t=0
    if moment == "end":
        return clip_duration - half_hold - transition  # envelope ends exactly at clip_duration
    return clip_duration / 2  # "middle" — envelope centered on the midpoint


def _build_cta_filter(
    text: str, font_family: str, font_size: int, font_color: str, bg_color: str,
    stroke_width: int, stroke_color: str, position: str, show_for: float, clip_duration: float,
    canvas_width: int = 0, animation: str = "none", transition: float = 0.5,
    center_time: float | None = None,
) -> str | None:
    """A 'Like & Subscribe'-style call-to-action with two independent timers:
    `show_for` is how long it's held fully on screen, `transition` is how
    long the appear/disappear animation itself takes. The two stack — the
    CTA spends `transition` seconds appearing, is fully visible for
    `show_for` seconds, then spends `transition` seconds disappearing, with
    the whole envelope centered on `center_time` (defaults to ending exactly
    at the clip's end, i.e. the original end-of-video behavior)."""
    text = text.strip()
    if not text or show_for <= 0 or clip_duration <= 0:
        return None

    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    size = font_size or 48
    esc = _escape_drawtext(_wrap_text(text, canvas_width, size))
    color = _ffmpeg_color(font_color)

    width = 2 if stroke_width < 0 else stroke_width
    if width > 0:
        s_color = _ffmpeg_color(stroke_color) if stroke_color else "black@0.8"
        stroke = f"borderw={width}:bordercolor={s_color}:"
    else:
        stroke = ""

    box = f":box=1:boxcolor={_ffmpeg_color(bg_color)}:boxborderw=10" if bg_color else ""
    pos = CTA_POSITIONS.get(position, CTA_POSITIONS["bottom-center"])
    transition = max(transition, 0.0)
    if center_time is None:
        center_time = _cta_center_time("end", show_for, transition, clip_duration)
    # The appear/disappear animations are *additional* to the hold time, not
    # carved out of it — the whole envelope is centered on `center_time`.
    start = max(0.0, center_time - show_for / 2 - transition)
    end = min(clip_duration, center_time + show_for / 2 + transition)
    window = end - start
    # if the clip is too short for the full envelope, shrink the transition
    # rather than let appear/disappear overlap each other
    tr = min(transition, window / 2) if window > 0 else 0

    x_expr = pos["x"]
    y_expr = pos["y"]
    alpha_expr = None

    # `enable` always gates visibility to [start, end]; alpha/position
    # expressions below only need to shape the transition *within* that
    # window — they don't need their own "before start" / "after end" cases.
    if animation == "fade" and tr > 0:
        alpha_expr = (
            f"if(lt(t,{start + tr:.3f}),(t-{start:.3f})/{tr:.3f},"
            f"if(lt(t,{end - tr:.3f}),1,({end:.3f}-t)/{tr:.3f}))"
        )
    elif animation == "slide" and tr > 0:
        # Slide in from the nearest off-screen edge, then fade out at the end.
        slide_px = 160
        sign = -1 if position.startswith("top") else 1
        y_expr = (
            f"({pos['y']})+{sign * slide_px}-{sign * slide_px}*"
            f"(t-{start:.3f})/{tr:.3f}*between(t,{start:.3f},{start + tr:.3f})"
        )
        alpha_expr = f"if(lt(t,{end - tr:.3f}),1,({end:.3f}-t)/{tr:.3f})"

    alpha = f":alpha='{alpha_expr}'" if alpha_expr else ""
    enable = f":enable='between(t,{start:.3f},{end:.3f})'"

    # Quote x/y — the slide animation's y expression calls between(t,a,b),
    # whose commas would otherwise be misread as filtergraph separators.
    return (
        f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
        f"{stroke}x='{x_expr}':y='{y_expr}'{enable}{alpha}{box}"
    )


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
    bg_color: str = ""           # hex color, "" = template default
    stroke_width: int = -1       # -1 = template default, 0 = no stroke
    stroke_color: str = ""       # hex color, "" = template default
    aspect_ratio: str = "original"  # one of ASPECT_RATIOS keys
    # Call-to-action overlay ("Like & Subscribe", etc.) — held on screen for
    # `cta_duration` seconds at each selected moment in `cta_moments`.
    cta_text: str = ""
    cta_duration: float = 3.0
    cta_moments: list[str] = ["end"]  # any of CTA_MOMENTS keys: start, middle, end
    cta_position: str = "bottom-center"  # one of CTA_POSITIONS keys
    cta_font_family: str = "sans-bold"
    cta_font_size: int = 0
    cta_font_color: str = "#ffffff"
    cta_bg_color: str = ""
    cta_stroke_width: int = -1
    cta_stroke_color: str = ""
    cta_animation: str = "none"  # one of CTA_ANIMATIONS keys
    cta_transition: float = 0.5  # seconds the fade/slide itself takes


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
    src_w, src_h = _video_dims(src)

    results = []
    for i, seg in enumerate(req.segments):
        output_id = str(uuid.uuid4())
        label = seg.label.strip() or f"clip_{i + 1}"
        # sanitise label for use as filename
        safe_label = "".join(c if c.isalnum() or c in "-_ " else "_" for c in label).strip()
        out_file = os.path.join(out_dir, f"{output_id}_{safe_label}.mp4")

        canvas_w = _cropped_width(src_w, src_h, seg.aspect_ratio)
        crop_filter = _build_crop_filter(seg.aspect_ratio)
        overlay_filter = _build_overlay_filter(
            seg.template, seg.title, seg.font_family, seg.font_size, seg.font_color, seg.bg_color,
            seg.stroke_width, seg.stroke_color, canvas_w,
        )
        clip_duration = seg.end - seg.start
        cta_filters = []
        for moment in seg.cta_moments:
            center_time = _cta_center_time(moment, seg.cta_duration, seg.cta_transition, clip_duration)
            cta_filters.append(_build_cta_filter(
                seg.cta_text, seg.cta_font_family, seg.cta_font_size, seg.cta_font_color, seg.cta_bg_color,
                seg.cta_stroke_width, seg.cta_stroke_color, seg.cta_position, seg.cta_duration, clip_duration,
                canvas_w, seg.cta_animation, seg.cta_transition, center_time,
            ))
        # crop first so overlay coordinates are relative to the final cropped frame
        video_filter = ",".join(f for f in (crop_filter, overlay_filter, *cta_filters) if f) or None

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
def serve_output(output_id: str, request: Request):
    path = _outputs.get(output_id)
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Output not found")
    # Range support lets the result preview <video> seek; the frontend's
    # download button still forces a save via the <a download> attribute.
    return ranged_file_response(path, request)


@router.head("/outputs/{output_id}/serve")
def serve_output_head(output_id: str):
    path = _outputs.get(output_id)
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Output not found")
    return Response(headers={
        "Content-Length": str(os.path.getsize(path)),
        "Accept-Ranges": "bytes",
        "Content-Type": "video/mp4",
    })


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
