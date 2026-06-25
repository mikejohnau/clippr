from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from pydantic import BaseModel
import os, uuid, subprocess, shutil, pathlib

from app.routers.download import CLIPS_DIR
from app.routers.ranking import ASPECT_CANVAS
from app.routers.edit import (
    _outputs, _build_overlay_filter, _build_cta_filter, _cta_center_time,
)

router = APIRouter()

IMAGES_DIR = os.path.join(CLIPS_DIR, "_images")
os.makedirs(IMAGES_DIR, exist_ok=True)

STYLES = {
    "ken_burns": {"name": "Ken Burns (slow pan/zoom)"},
    "static_crossfade": {"name": "Static with crossfade"},
}

# Maps an uploaded image_id -> its file path on disk.
_images: dict[str, str] = {}


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image uploads are supported")
    image_id = str(uuid.uuid4())
    ext = pathlib.Path(file.filename or "").suffix or ".jpg"
    path = os.path.join(IMAGES_DIR, f"{image_id}{ext}")
    with open(path, "wb") as f:
        f.write(await file.read())
    _images[image_id] = path
    # CLIPS_DIR is mounted at /clips, so this is a stable URL the frontend
    # can use directly for a thumbnail preview — no need for a local blob:
    # URL, which would break the moment the page is refreshed.
    return {"image_id": image_id, "url": f"/clips/_images/{image_id}{ext}"}


class StoryImage(BaseModel):
    image_id: str
    duration: float = 3.0  # how long this image is held on screen, in seconds


class ImageStoryBuildRequest(BaseModel):
    images: list[StoryImage]
    style: str = "ken_burns"        # one of STYLES keys
    transition_duration: float = 0.6  # crossfade length (static_crossfade only)
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


class ImageStoryBuildStatus(BaseModel):
    build_id: str
    status: str  # queued, building, done, error
    progress: int = 0
    step: str = ""
    output_id: str | None = None
    filename: str | None = None
    size: int | None = None
    error: str | None = None


builds: dict[str, ImageStoryBuildStatus] = {}

FPS = 30
ZOOM_RATE = 0.0015  # per-frame zoom increment for the Ken Burns effect


def _safe_filename(name: str, fallback: str = "image_story_video") -> str:
    name = (name or "").strip()
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return f"{safe or fallback}.mp4"


def _run_ken_burns(build_id: str, req: ImageStoryBuildRequest, out_dir: str):
    """Each image becomes its own short zoompan segment (fixed codec/res/fps),
    burned-in title/CTA included, then the concat demuxer stream-copies them
    together — the same proven pattern ranking.py uses for its clips."""
    status = builds[build_id]
    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])

    title_overlay = _build_overlay_filter(
        req.title_template, req.title, req.title_font_family, req.title_font_size,
        req.title_font_color, req.title_bg_color, req.title_stroke_width, req.title_stroke_color,
        canvas_w,
    )

    durations = [img.duration for img in req.images]
    total_duration = sum(durations)
    cumulative = []
    acc = 0.0
    for d in durations:
        cumulative.append(acc)
        acc += d

    moment_targets: dict[int, list[tuple[str, float]]] = {}
    if req.images:
        if "start" in req.cta_moments:
            center = _cta_center_time("start", req.cta_duration, req.cta_transition, durations[0])
            moment_targets.setdefault(0, []).append(("start", center))
        if "end" in req.cta_moments:
            last = len(req.images) - 1
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

    total_steps = len(req.images) + 1
    segment_paths = []
    for i, img in enumerate(req.images):
        status.step = f"Rendering image {i + 1} of {len(req.images)}"
        status.progress = int(i / total_steps * 100)

        src = _images.get(img.image_id)
        if not src or not os.path.exists(src):
            raise RuntimeError(f"Image not found for item {i + 1} (image_id={img.image_id})")
        if img.duration <= 0:
            raise RuntimeError(f"Item {i + 1} has an invalid duration")

        filters = [
            f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase",
            f"crop={canvas_w}:{canvas_h}",
            f"zoompan=z='zoom+{ZOOM_RATE}':d={int(round(img.duration * FPS))}:s={canvas_w}x{canvas_h}:fps={FPS}",
        ]
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

        # `-t` goes on the *output* here, not the image input: zoompan's `d`
        # already expands each fed-in frame into the right number of zoomed
        # output frames, so limiting the input first would feed it far too
        # many source frames and multiply that out to a wildly long render
        # (an earlier version of this code did exactly that — a ~3s clip
        # took 6 minutes and came out 270s long before this fix).
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-framerate", str(FPS), "-i", src,
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-vf", vf, "-map", "0:v", "-map", "1:a", "-t", str(img.duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-r", str(FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "44100", "-ac", "2",
            seg_path,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(seg_path):
            raise RuntimeError(f"Failed to render image {i + 1}: {(r.stderr or r.stdout)[-300:]}")
        segment_paths.append(seg_path)

    status.step = "Joining images"
    status.progress = int(len(req.images) / total_steps * 100)

    list_file = os.path.join(out_dir, "concat_list.txt")
    with open(list_file, "w") as f:
        for p in segment_paths:
            escaped = p.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    final_path = os.path.join(out_dir, "image_story_final.mp4")
    r = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", final_path],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not os.path.exists(final_path):
        raise RuntimeError(f"Failed to join images: {(r.stderr or r.stdout)[-300:]}")

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


def _run_static_crossfade(build_id: str, req: ImageStoryBuildRequest, out_dir: str):
    """All images chained in one ffmpeg call via xfade — each crossfade is
    *additional* screen time on top of every image's held duration, the same
    "stack, don't eat into the hold" philosophy as the CTA timers. Title/CTA
    overlays apply to the single continuous output stream directly, since
    (unlike Ken Burns) there's no per-segment concat to map moments onto."""
    status = builds[build_id]
    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])
    tx = max(req.transition_duration, 0.05)
    n = len(req.images)

    status.step = "Rendering image story"
    status.progress = 30

    durations = [img.duration for img in req.images]
    for i, d in enumerate(durations):
        if d <= 0:
            raise RuntimeError(f"Item {i + 1} has an invalid duration")
    total_duration = sum(durations) + (n - 1) * tx if n > 1 else durations[0]

    parts = []
    fed_durations = []
    for i, img in enumerate(req.images):
        src = _images.get(img.image_id)
        if not src or not os.path.exists(src):
            raise RuntimeError(f"Image not found for item {i + 1} (image_id={img.image_id})")
        if n == 1:
            fed = durations[i]
        elif i == 0:
            fed = durations[i] + tx
        elif i == n - 1:
            fed = tx + durations[i]
        else:
            fed = durations[i] + 2 * tx
        fed_durations.append(fed)
        parts.append(f"[{i}:v]scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase,crop={canvas_w}:{canvas_h}[v{i}]")

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

    filter_complex = ";".join(parts)
    final_path = os.path.join(out_dir, "image_story_final.mp4")

    # Every image is its own silent -loop input, so there's no real audio to
    # mix — a single generated silent track (input index n) stands in for it.
    cmd = ["ffmpeg", "-y"]
    for i, img in enumerate(req.images):
        src = _images[img.image_id]
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t", str(fed_durations[i]), "-i", src]
    cmd += ["-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo:d={total_duration:.3f}"]
    cmd += [
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", f"{n}:a",
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


def _run_build(build_id: str, req: ImageStoryBuildRequest):
    status = builds[build_id]
    out_dir = os.path.join(CLIPS_DIR, "_imagestory", build_id)
    os.makedirs(out_dir, exist_ok=True)

    try:
        if not req.images:
            raise RuntimeError("No images provided")
        status.status = "building"

        if req.style == "static_crossfade":
            final_path = _run_static_crossfade(build_id, req, out_dir)
        else:
            final_path = _run_ken_burns(build_id, req, out_dir)

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


@router.post("/build", response_model=ImageStoryBuildStatus)
def build_image_story(req: ImageStoryBuildRequest, background_tasks: BackgroundTasks):
    if not req.images:
        raise HTTPException(400, "No images provided")

    build_id = str(uuid.uuid4())
    status = ImageStoryBuildStatus(build_id=build_id, status="queued")
    builds[build_id] = status
    background_tasks.add_task(_run_build, build_id, req)
    return status


@router.get("/build/{build_id}", response_model=ImageStoryBuildStatus)
def get_build_status(build_id: str):
    status = builds.get(build_id)
    if not status:
        raise HTTPException(404, "Build not found")
    return status
