from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os, uuid, subprocess, shutil

from app.routers.download import CLIPS_DIR
from app.routers.ranking import ASPECT_CANVAS
from app.routers.edit import (
    _outputs, _find_font, _wrap_text, _escape_drawtext, _ffmpeg_color,
    _build_overlay_filter, _build_cta_filter, _cta_center_time,
)

router = APIRouter()

FPS = 30


class TextSlide(BaseModel):
    text: str
    duration: float = 3.0  # how long this slide is held on screen, in seconds


class TextStoryBuildRequest(BaseModel):
    slides: list[TextSlide]
    background_color: str = "#0c0e14"
    font_family: str = "sans-bold"
    font_size: int = 0          # 0 = auto-sized for the canvas
    font_color: str = "#ffffff"
    use_crossfade: bool = True
    transition_duration: float = 0.5  # crossfade length, if use_crossfade
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


class TextStoryBuildStatus(BaseModel):
    build_id: str
    status: str  # queued, building, done, error
    progress: int = 0
    step: str = ""
    output_id: str | None = None
    filename: str | None = None
    size: int | None = None
    error: str | None = None


builds: dict[str, TextStoryBuildStatus] = {}


def _safe_filename(name: str, fallback: str = "text_story_video") -> str:
    name = (name or "").strip()
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return f"{safe or fallback}.mp4"


def _slide_text_filter(text: str, font_family: str, font_size: int, font_color: str, canvas_width: int) -> str:
    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    size = font_size or 64
    esc = _escape_drawtext(_wrap_text(text, canvas_width, size, side_margin=100))
    color = _ffmpeg_color(font_color)
    return (
        f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
        f"line_spacing=14:x='(w-text_w)/2':y='(h-text_h)/2'"
    )


def _run_hard_cut(build_id: str, req: TextStoryBuildRequest, out_dir: str):
    """Each slide becomes its own short segment (fixed codec/res/fps), then
    the concat demuxer stream-copies them together — the same proven
    pattern ranking.py and image_story.py's Ken Burns mode both use."""
    status = builds[build_id]
    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])
    bg_color = _ffmpeg_color(req.background_color)

    title_overlay = _build_overlay_filter(
        req.title_template, req.title, req.title_font_family, req.title_font_size,
        req.title_font_color, req.title_bg_color, req.title_stroke_width, req.title_stroke_color,
        canvas_w,
    )

    durations = [s.duration for s in req.slides]
    total_duration = sum(durations)
    cumulative = []
    acc = 0.0
    for d in durations:
        cumulative.append(acc)
        acc += d

    moment_targets: dict[int, list[tuple[str, float]]] = {}
    if req.slides:
        if "start" in req.cta_moments:
            center = _cta_center_time("start", req.cta_duration, req.cta_transition, durations[0])
            moment_targets.setdefault(0, []).append(("start", center))
        if "end" in req.cta_moments:
            last = len(req.slides) - 1
            center = _cta_center_time("end", req.cta_duration, req.cta_transition, durations[last])
            moment_targets.setdefault(last, []).append(("end", center))
        if "middle" in req.cta_moments:
            global_mid = total_duration / 2
            idx = 0
            for j, offset in enumerate(cumulative):
                if offset <= global_mid:
                    idx = j
                else:
                    break
            local_center = max(0.0, min(durations[idx], global_mid - cumulative[idx]))
            moment_targets.setdefault(idx, []).append(("middle", local_center))

    total_steps = len(req.slides) + 1
    segment_paths = []
    for i, slide in enumerate(req.slides):
        status.step = f"Rendering slide {i + 1} of {len(req.slides)}"
        status.progress = int(i / total_steps * 100)

        if not slide.text.strip():
            raise RuntimeError(f"Slide {i + 1} has no text")
        if slide.duration <= 0:
            raise RuntimeError(f"Slide {i + 1} has an invalid duration")

        filters = [_slide_text_filter(slide.text, req.font_family, req.font_size, req.font_color, canvas_w)]
        if title_overlay:
            filters.append(title_overlay)
        for _moment, center_time in moment_targets.get(i, []):
            cta_overlay = _build_cta_filter(
                req.cta_text, req.cta_font_family, req.cta_font_size, req.cta_font_color, req.cta_bg_color,
                req.cta_stroke_width, req.cta_stroke_color, req.cta_position, req.cta_duration, durations[i],
                canvas_w, req.cta_animation, req.cta_transition, center_time,
            )
            if cta_overlay:
                filters.append(cta_overlay)
        vf = ",".join(filters)
        seg_path = os.path.join(out_dir, f"seg_{i:03d}.mp4")

        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={bg_color}:s={canvas_w}x{canvas_h}:d={slide.duration}",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-vf", vf, "-map", "0:v", "-map", "1:a", "-shortest",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "44100", "-ac", "2",
            seg_path,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(seg_path):
            raise RuntimeError(f"Failed to render slide {i + 1}: {(r.stderr or r.stdout)[-300:]}")
        segment_paths.append(seg_path)

    status.step = "Joining slides"
    status.progress = int(len(req.slides) / total_steps * 100)

    list_file = os.path.join(out_dir, "concat_list.txt")
    with open(list_file, "w") as f:
        for p in segment_paths:
            escaped = p.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    final_path = os.path.join(out_dir, "text_story_final.mp4")
    r = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", final_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(final_path):
        raise RuntimeError(f"Failed to join slides: {(r.stderr or r.stdout)[-300:]}")

    for p in segment_paths:
        try:
            os.remove(p)
        except OSError:
            pass
    try:
        os.remove(list_file)
    except OSError:
        pass

    return final_path


def _run_crossfade(build_id: str, req: TextStoryBuildRequest, out_dir: str):
    """All slides chained in one ffmpeg call via xfade — each crossfade is
    *additional* screen time on top of every slide's held duration, same
    "stack, don't eat into the hold" philosophy as the CTA timers and
    image_story's static_crossfade mode. Each slide is its own `color`
    lavfi source with its own intrinsic `d=` duration, which sidesteps the
    "-t before vs after -i" footgun entirely."""
    status = builds[build_id]
    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])
    bg_color = _ffmpeg_color(req.background_color)
    tx = max(req.transition_duration, 0.05)
    n = len(req.slides)

    status.step = "Rendering text story"
    status.progress = 30

    durations = [s.duration for s in req.slides]
    for i, slide in enumerate(req.slides):
        if not slide.text.strip():
            raise RuntimeError(f"Slide {i + 1} has no text")
        if slide.duration <= 0:
            raise RuntimeError(f"Slide {i + 1} has an invalid duration")
    total_duration = sum(durations) + (n - 1) * tx if n > 1 else durations[0]

    parts = []
    for i, slide in enumerate(req.slides):
        if n == 1:
            fed = durations[i]
        elif i == 0:
            fed = durations[i] + tx
        elif i == n - 1:
            fed = tx + durations[i]
        else:
            fed = durations[i] + 2 * tx
        text_filter = _slide_text_filter(slide.text, req.font_family, req.font_size, req.font_color, canvas_w)
        parts.append(f"color=c={bg_color}:s={canvas_w}x{canvas_h}:d={fed:.3f}[bg{i}]")
        parts.append(f"[bg{i}]{text_filter}[v{i}]")

    if n == 1:
        video_label = "v0"
    else:
        offset = durations[0]
        parts.append(f"[v0][v1]xfade=transition=fade:duration={tx}:offset={offset}[x1]")
        for i in range(2, n):
            offset = offset + tx + durations[i - 1]
            parts.append(f"[x{i - 1}][v{i}]xfade=transition=fade:duration={tx}:offset={offset}[x{i}]")
        video_label = f"x{n - 1}"

    title_overlay = _build_overlay_filter(
        req.title_template, req.title, req.title_font_family, req.title_font_size,
        req.title_font_color, req.title_bg_color, req.title_stroke_width, req.title_stroke_color,
        canvas_w,
    )
    cta_overlays = []
    for moment in req.cta_moments:
        center = _cta_center_time(moment, req.cta_duration, req.cta_transition, total_duration)
        cta_overlay = _build_cta_filter(
            req.cta_text, req.cta_font_family, req.cta_font_size, req.cta_font_color, req.cta_bg_color,
            req.cta_stroke_width, req.cta_stroke_color, req.cta_position, req.cta_duration, total_duration,
            canvas_w, req.cta_animation, req.cta_transition, center,
        )
        if cta_overlay:
            cta_overlays.append(cta_overlay)

    overlay_filters = [f for f in (title_overlay, *cta_overlays) if f]
    if overlay_filters:
        parts.append(f"[{video_label}]{','.join(overlay_filters)}[outv]")
    else:
        parts.append(f"[{video_label}]null[outv]")

    parts.append(f"anullsrc=r=44100:cl=stereo:d={total_duration:.3f}[outa]")
    filter_complex = ";".join(parts)
    final_path = os.path.join(out_dir, "text_story_final.mp4")
    cmd = [
        "ffmpeg", "-y",
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-r", str(FPS), "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        final_path,
    ]
    status.progress = 60
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(final_path):
        raise RuntimeError(f"Failed to render: {(r.stderr or r.stdout)[-300:]}")

    return final_path


def _run_build(build_id: str, req: TextStoryBuildRequest):
    status = builds[build_id]
    out_dir = os.path.join(CLIPS_DIR, "_textstory", build_id)
    os.makedirs(out_dir, exist_ok=True)

    try:
        if not req.slides:
            raise RuntimeError("No slides provided")
        status.status = "building"

        if req.use_crossfade:
            final_path = _run_crossfade(build_id, req, out_dir)
        else:
            final_path = _run_hard_cut(build_id, req, out_dir)

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


@router.post("/build", response_model=TextStoryBuildStatus)
def build_text_story(req: TextStoryBuildRequest, background_tasks: BackgroundTasks):
    if not req.slides:
        raise HTTPException(400, "No slides provided")

    build_id = str(uuid.uuid4())
    status = TextStoryBuildStatus(build_id=build_id, status="queued")
    builds[build_id] = status
    background_tasks.add_task(_run_build, build_id, req)
    return status


@router.get("/build/{build_id}", response_model=TextStoryBuildStatus)
def get_build_status(build_id: str):
    status = builds.get(build_id)
    if not status:
        raise HTTPException(404, "Build not found")
    return status
