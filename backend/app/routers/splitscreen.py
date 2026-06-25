from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os, uuid, subprocess, shutil

from app.routers.download import CLIPS_DIR
from app.routers.ranking import ASPECT_CANVAS
from app.routers.edit import (
    _source_path, _outputs, _build_overlay_filter, _build_cta_filter, _cta_center_time,
)

router = APIRouter()

LAYOUTS = {
    "stacked": {"name": "Stacked (top / bottom)"},
    "side_by_side": {"name": "Side by side (left / right)"},
}


class SplitScreenItem(BaseModel):
    job_id: str
    start: float
    end: float
    mute: bool = False


class SplitScreenBuildRequest(BaseModel):
    items: list[SplitScreenItem]   # always exactly 2: [0] = top/left, [1] = bottom/right
    layout: str = "stacked"        # one of LAYOUTS keys
    aspect_ratio: str = "9:16"
    output_name: str = ""
    # Title overlay — shown throughout the whole combined video.
    title: str = ""
    title_template: str = "none"
    title_font_family: str = "sans-bold"
    title_font_size: int = 0
    title_font_color: str = "#ffffff"
    title_bg_color: str = ""
    title_stroke_width: int = -1
    title_stroke_color: str = ""
    # Call-to-action overlay ("Like & Subscribe", etc.) — held on screen for
    # `cta_duration` seconds at each selected moment in `cta_moments`.
    cta_text: str = ""
    cta_duration: float = 3.0
    cta_moments: list[str] = ["end"]
    cta_position: str = "bottom-center"
    cta_font_family: str = "sans-bold"
    cta_font_size: int = 0
    cta_font_color: str = "#ffffff"
    cta_bg_color: str = ""
    cta_stroke_width: int = -1
    cta_stroke_color: str = ""
    cta_animation: str = "none"
    cta_transition: float = 0.5


class SplitScreenBuildStatus(BaseModel):
    build_id: str
    status: str  # queued, building, done, error
    progress: int = 0
    step: str = ""
    output_id: str | None = None
    filename: str | None = None
    size: int | None = None
    error: str | None = None


builds: dict[str, SplitScreenBuildStatus] = {}


def _safe_filename(name: str, fallback: str = "split_screen_video") -> str:
    name = (name or "").strip()
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return f"{safe or fallback}.mp4"


def _run_build(build_id: str, req: SplitScreenBuildRequest):
    status = builds[build_id]
    out_dir = os.path.join(CLIPS_DIR, "_splitscreen", build_id)
    os.makedirs(out_dir, exist_ok=True)

    try:
        if len(req.items) != 2:
            raise RuntimeError("Split-screen needs exactly 2 clips")

        status.status = "building"
        status.step = "Rendering split-screen video"
        status.progress = 20

        item_a, item_b = req.items
        for label, item in (("first", item_a), ("second", item_b)):
            if item.end <= item.start:
                raise RuntimeError(f"The {label} clip has an invalid trim range")

        src_a = _source_path(item_a.job_id)
        src_b = _source_path(item_b.job_id)
        if not src_a or not os.path.exists(src_a):
            raise RuntimeError(f"Source not found for the first clip (job_id={item_a.job_id})")
        if not src_b or not os.path.exists(src_b):
            raise RuntimeError(f"Source not found for the second clip (job_id={item_b.job_id})")

        canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])
        if req.layout == "side_by_side":
            half_w, half_h = canvas_w // 2, canvas_h
        else:
            half_w, half_h = canvas_w, canvas_h // 2

        duration_a = item_a.end - item_a.start
        duration_b = item_b.end - item_b.start
        clip_duration = min(duration_a, duration_b)  # the shorter clip caps the final output

        title_overlay = _build_overlay_filter(
            req.title_template, req.title, req.title_font_family, req.title_font_size,
            req.title_font_color, req.title_bg_color, req.title_stroke_width, req.title_stroke_color,
            canvas_w,
        )
        cta_overlays = []
        for moment in req.cta_moments:
            center = _cta_center_time(moment, req.cta_duration, req.cta_transition, clip_duration)
            cta_overlay = _build_cta_filter(
                req.cta_text, req.cta_font_family, req.cta_font_size, req.cta_font_color, req.cta_bg_color,
                req.cta_stroke_width, req.cta_stroke_color, req.cta_position, req.cta_duration, clip_duration,
                canvas_w, req.cta_animation, req.cta_transition, center,
            )
            if cta_overlay:
                cta_overlays.append(cta_overlay)

        stack_filter = "hstack" if req.layout == "side_by_side" else "vstack"
        parts = [
            f"[0:v]scale={half_w}:{half_h}:force_original_aspect_ratio=increase,crop={half_w}:{half_h}[v0]",
            f"[1:v]scale={half_w}:{half_h}:force_original_aspect_ratio=increase,crop={half_w}:{half_h}[v1]",
        ]
        overlay_filters = [f for f in (title_overlay, *cta_overlays) if f]
        if overlay_filters:
            parts.append(f"[v0][v1]{stack_filter}=2[merged]")
            parts.append(f"[merged]{','.join(overlay_filters)}[outv]")
        else:
            parts.append(f"[v0][v1]{stack_filter}=2[outv]")

        # Per-clip mute toggle: mix both real tracks if neither is muted, fall
        # back to whichever single track survives, or silence if both are.
        if not item_a.mute and not item_b.mute:
            parts.append("[0:a][1:a]amix=inputs=2:duration=shortest[outa]")
            audio_map = ["-map", "[outa]"]
        elif not item_a.mute:
            audio_map = ["-map", "0:a"]
        elif not item_b.mute:
            audio_map = ["-map", "1:a"]
        else:
            parts.append("anullsrc=r=44100:cl=stereo[outa]")
            audio_map = ["-map", "[outa]"]

        filter_complex = ";".join(parts)
        final_path = os.path.join(out_dir, "split_screen_final.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(item_a.start), "-to", str(item_a.end), "-i", src_a,
            "-ss", str(item_b.start), "-to", str(item_b.end), "-i", src_b,
            "-filter_complex", filter_complex,
            "-map", "[outv]", *audio_map, "-shortest",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-r", "30", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "44100", "-ac", "2",
            final_path,
        ]
        status.progress = 60
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(final_path):
            raise RuntimeError(f"Failed to render: {(r.stderr or r.stdout)[-300:]}")

        output_id = str(uuid.uuid4())
        _outputs[output_id] = final_path

        status.output_id = output_id
        status.filename = _safe_filename(req.output_name)
        status.size = os.path.getsize(final_path)
        status.progress = 100
        status.step = "Done"
        status.status = "done"
    except Exception as e:
        status.status = "error"
        status.error = str(e)
        shutil.rmtree(out_dir, ignore_errors=True)


@router.post("/build", response_model=SplitScreenBuildStatus)
def build_split_screen(req: SplitScreenBuildRequest, background_tasks: BackgroundTasks):
    if len(req.items) != 2:
        raise HTTPException(400, "Split-screen needs exactly 2 clips")

    build_id = str(uuid.uuid4())
    status = SplitScreenBuildStatus(build_id=build_id, status="queued")
    builds[build_id] = status
    background_tasks.add_task(_run_build, build_id, req)
    return status


@router.get("/build/{build_id}", response_model=SplitScreenBuildStatus)
def get_build_status(build_id: str):
    status = builds.get(build_id)
    if not status:
        raise HTTPException(404, "Build not found")
    return status
