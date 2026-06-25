from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os, uuid, subprocess, shutil

from app.routers.download import CLIPS_DIR
from app.routers.ranking import ASPECT_CANVAS
from app.routers.edit import (
    _source_path, _outputs, _build_overlay_filter, _build_cta_filter, _cta_center_time,
)

router = APIRouter()

PIP_POSITIONS = {
    "top-left": {"name": "Top left"},
    "top-right": {"name": "Top right"},
    "bottom-left": {"name": "Bottom left"},
    "bottom-right": {"name": "Bottom right"},
}


class CommentaryItem(BaseModel):
    job_id: str
    start: float
    end: float
    mute: bool = False


class CommentaryBuildRequest(BaseModel):
    items: list[CommentaryItem]   # always exactly 2: [0] = base (full frame), [1] = reaction (PiP)
    aspect_ratio: str = "9:16"
    pip_position: str = "bottom-right"  # one of PIP_POSITIONS keys
    pip_scale: float = 0.35             # PiP width as a fraction of the full canvas width
    pip_border_width: int = 0           # 0 = no border
    pip_border_color: str = "#ffffff"
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


class CommentaryBuildStatus(BaseModel):
    build_id: str
    status: str  # queued, building, done, error
    progress: int = 0
    step: str = ""
    output_id: str | None = None
    filename: str | None = None
    size: int | None = None
    error: str | None = None


builds: dict[str, CommentaryBuildStatus] = {}


def _safe_filename(name: str, fallback: str = "commentary_video") -> str:
    name = (name or "").strip()
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return f"{safe or fallback}.mp4"


def _even(n: float) -> int:
    """libx264 with yuv420p needs even width/height — round down to the
    nearest even pixel."""
    return max(2, int(n) - (int(n) % 2))


def _run_build(build_id: str, req: CommentaryBuildRequest):
    status = builds[build_id]
    out_dir = os.path.join(CLIPS_DIR, "_commentary", build_id)
    os.makedirs(out_dir, exist_ok=True)

    try:
        if len(req.items) != 2:
            raise RuntimeError("Commentary needs exactly 2 clips: a base clip and a reaction clip")

        status.status = "building"
        status.step = "Rendering commentary video"
        status.progress = 20

        base_item, pip_item = req.items
        for label, item in (("base", base_item), ("reaction", pip_item)):
            if item.end <= item.start:
                raise RuntimeError(f"The {label} clip has an invalid trim range")

        src_base = _source_path(base_item.job_id)
        src_pip = _source_path(pip_item.job_id)
        if not src_base or not os.path.exists(src_base):
            raise RuntimeError(f"Source not found for the base clip (job_id={base_item.job_id})")
        if not src_pip or not os.path.exists(src_pip):
            raise RuntimeError(f"Source not found for the reaction clip (job_id={pip_item.job_id})")

        canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])

        duration_base = base_item.end - base_item.start
        duration_pip = pip_item.end - pip_item.start
        clip_duration = min(duration_base, duration_pip)  # the shorter clip caps the final output

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

        pip_scale = min(max(req.pip_scale, 0.1), 0.8)
        pip_w = _even(canvas_w * pip_scale)
        pip_h = _even(pip_w * canvas_h / canvas_w)  # same aspect as the full canvas

        border = max(req.pip_border_width, 0)
        outer_w, outer_h = pip_w + 2 * border, pip_h + 2 * border

        margin = 40
        if req.pip_position == "top-left":
            ox, oy = margin, margin
        elif req.pip_position == "top-right":
            ox, oy = canvas_w - outer_w - margin, margin
        elif req.pip_position == "bottom-left":
            ox, oy = margin, canvas_h - outer_h - margin
        else:  # bottom-right
            ox, oy = canvas_w - outer_w - margin, canvas_h - outer_h - margin

        parts = [
            f"[0:v]scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase,crop={canvas_w}:{canvas_h}[base]",
            f"[1:v]scale={pip_w}:{pip_h}:force_original_aspect_ratio=increase,crop={pip_w}:{pip_h}[pipraw]",
        ]
        if border > 0:
            border_color = req.pip_border_color or "#ffffff"
            border_hex = border_color if border_color.startswith("#") else f"#{border_color}"
            parts.append(f"[pipraw]pad={outer_w}:{outer_h}:{border}:{border}:color={border_hex}[pip]")
        else:
            parts.append("[pipraw]null[pip]")
        parts.append(f"[base][pip]overlay=x={ox}:y={oy}[merged]")

        overlay_filters = [f for f in (title_overlay, *cta_overlays) if f]
        if overlay_filters:
            parts.append(f"[merged]{','.join(overlay_filters)}[outv]")
        else:
            parts.append("[merged]null[outv]")

        # Per-clip mute toggle: mix both real tracks if neither is muted, fall
        # back to whichever single track survives, or silence if both are.
        if not base_item.mute and not pip_item.mute:
            parts.append("[0:a][1:a]amix=inputs=2:duration=shortest[outa]")
            audio_map = ["-map", "[outa]"]
        elif not base_item.mute:
            audio_map = ["-map", "0:a"]
        elif not pip_item.mute:
            audio_map = ["-map", "1:a"]
        else:
            parts.append("anullsrc=r=44100:cl=stereo[outa]")
            audio_map = ["-map", "[outa]"]

        filter_complex = ";".join(parts)
        final_path = os.path.join(out_dir, "commentary_final.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(base_item.start), "-to", str(base_item.end), "-i", src_base,
            "-ss", str(pip_item.start), "-to", str(pip_item.end), "-i", src_pip,
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


@router.post("/build", response_model=CommentaryBuildStatus)
def build_commentary(req: CommentaryBuildRequest, background_tasks: BackgroundTasks):
    if len(req.items) != 2:
        raise HTTPException(400, "Commentary needs exactly 2 clips: a base clip and a reaction clip")

    build_id = str(uuid.uuid4())
    status = CommentaryBuildStatus(build_id=build_id, status="queued")
    builds[build_id] = status
    background_tasks.add_task(_run_build, build_id, req)
    return status


@router.get("/build/{build_id}", response_model=CommentaryBuildStatus)
def get_build_status(build_id: str):
    status = builds.get(build_id)
    if not status:
        raise HTTPException(404, "Build not found")
    return status
