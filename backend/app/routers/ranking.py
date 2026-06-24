from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
import os, uuid, subprocess, pathlib, shutil

from app.routers.download import CLIPS_DIR
from app.routers.edit import (
    _source_path, _find_font, _escape_drawtext, _ffmpeg_color, _outputs,
    _build_overlay_filter, _build_cta_filter, _cta_center_time, TEMPLATES,
)

router = APIRouter()

# Standard output canvases per aspect ratio — every segment gets scaled/cropped
# to one of these so the final concat join has matching, compatible streams.
ASPECT_CANVAS = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "16:9": (1920, 1080),
}


POSITIONS = {
    "top-left": {"name": "Top left", "x": "40", "y": "40"},
    "top-right": {"name": "Top right", "x": "w-text_w-40", "y": "40"},
    "top-center": {"name": "Top center", "x": "(w-text_w)/2", "y": "40"},
    "bottom-left": {"name": "Bottom left", "x": "40", "y": "h-text_h-40"},
    "bottom-right": {"name": "Bottom right", "x": "w-text_w-40", "y": "h-text_h-40"},
    "bottom-center": {"name": "Bottom center", "x": "(w-text_w)/2", "y": "h-text_h-40"},
}


class RankingItem(BaseModel):
    job_id: str
    start: float
    end: float
    mute: bool = False
    rank: int
    label: str = ""               # overlay text; falls back to "#{rank}" if empty
    font_family: str = "sans-bold"
    font_size: int = 0            # 0 = template default
    font_color: str = "#ffffff"
    position: str = "top-left"    # one of POSITIONS keys


class RankingBuildRequest(BaseModel):
    items: list[RankingItem]
    aspect_ratio: str = "9:16"
    output_name: str = ""
    # Title overlay — shown throughout the whole combined video (same text,
    # burned into every segment identically), separate from the per-clip
    # rank-number badge above.
    title: str = ""
    title_template: str = "none"          # one of TEMPLATES keys (edit.py)
    title_font_family: str = "sans-bold"
    title_font_size: int = 0
    title_font_color: str = "#ffffff"
    title_bg_color: str = ""
    title_stroke_width: int = -1   # -1 = template default, 0 = no stroke
    title_stroke_color: str = ""   # hex color, "" = template default
    # Call-to-action overlay ("Like & Subscribe", etc.) — held on screen for
    # `cta_duration` seconds at each selected moment in `cta_moments`, timed
    # against the whole combined video (not each individual clip).
    cta_text: str = ""
    cta_duration: float = 3.0
    cta_moments: list[str] = ["end"]  # any of CTA_MOMENTS keys (edit.py): start, middle, end
    cta_position: str = "bottom-center"  # one of CTA_POSITIONS keys (edit.py)
    cta_font_family: str = "sans-bold"
    cta_font_size: int = 0
    cta_font_color: str = "#ffffff"
    cta_bg_color: str = ""
    cta_stroke_width: int = -1
    cta_stroke_color: str = ""
    cta_animation: str = "none"  # one of CTA_ANIMATIONS keys (edit.py)
    cta_transition: float = 0.5  # seconds the fade/slide itself takes


class RankingBuildStatus(BaseModel):
    build_id: str
    status: str  # queued, building, done, error
    progress: int = 0     # 0-100
    step: str = ""        # human-readable current step
    output_id: str | None = None
    filename: str | None = None
    size: int | None = None
    error: str | None = None


builds: dict[str, RankingBuildStatus] = {}


def _rank_overlay_filter(label: str, font_family: str, font_size: int, font_color: str, position: str) -> str:
    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    esc = _escape_drawtext(label)
    size = font_size or 90
    color = _ffmpeg_color(font_color)
    pos = POSITIONS.get(position, POSITIONS["top-left"])
    return (
        f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
        f"borderw=5:bordercolor=black:x={pos['x']}:y={pos['y']}"
    )


def _safe_filename(name: str, fallback: str = "ranking_video") -> str:
    name = (name or "").strip()
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip()
    return f"{safe or fallback}.mp4"


def _run_build(build_id: str, req: RankingBuildRequest):
    status = builds[build_id]
    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])
    out_dir = os.path.join(CLIPS_DIR, "_ranking", build_id)
    os.makedirs(out_dir, exist_ok=True)

    title_overlay = _build_overlay_filter(
        req.title_template, req.title, req.title_font_family, req.title_font_size,
        req.title_font_color, req.title_bg_color, req.title_stroke_width, req.title_stroke_color,
        canvas_w,
    )

    # Figure out which item each selected CTA moment ("start"/"middle"/"end"
    # of the *whole combined video*) actually falls on, and at what local
    # timestamp within that item's own clip — since the video is built by
    # rendering each item separately and concatenating, a CTA can only be
    # burned into the one item whose time range contains that moment.
    durations = [item.end - item.start for item in req.items]
    total_duration = sum(durations)
    cumulative = []
    acc = 0.0
    for d in durations:
        cumulative.append(acc)
        acc += d

    moment_targets: dict[int, list[tuple[str, float]]] = {}
    if req.items:
        if "start" in req.cta_moments:
            center = _cta_center_time("start", req.cta_duration, req.cta_transition, durations[0])
            moment_targets.setdefault(0, []).append(("start", center))
        if "end" in req.cta_moments:
            last = len(req.items) - 1
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

    total_steps = len(req.items) + 1  # + 1 for the final concat/join step
    segment_paths = []
    try:
        status.status = "building"
        for i, item in enumerate(req.items):
            status.step = f"Rendering clip {i + 1} of {len(req.items)}"
            status.progress = int(i / total_steps * 100)

            src = _source_path(item.job_id)
            if not src or not os.path.exists(src):
                raise RuntimeError(f"Source not found for item {i + 1} (job_id={item.job_id})")
            if item.end <= item.start:
                raise RuntimeError(f"Item {i + 1} has an invalid trim range")

            label = (item.label or "").strip() or f"#{item.rank}"
            rank_overlay = _rank_overlay_filter(label, item.font_family, item.font_size, item.font_color, item.position)
            filters = [f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase", f"crop={canvas_w}:{canvas_h}", rank_overlay]
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

            if item.mute:
                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(item.start), "-to", str(item.end), "-i", src,
                    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-vf", vf, "-map", "0:v", "-map", "1:a", "-shortest",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-r", "30", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-ar", "44100", "-ac", "2",
                    seg_path,
                ]
            else:
                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(item.start), "-to", str(item.end), "-i", src,
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                    "-r", "30", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-ar", "44100", "-ac", "2",
                    seg_path,
                ]

            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode != 0 or not os.path.exists(seg_path):
                raise RuntimeError(f"Failed to render item {i + 1}: {(r.stderr or r.stdout)[-300:]}")
            segment_paths.append(seg_path)

        status.step = "Joining clips"
        status.progress = int(len(req.items) / total_steps * 100)

        # All segments now share identical codec/resolution/framerate, so the
        # final join is a fast stream copy via the concat demuxer — no re-encode.
        list_file = os.path.join(out_dir, "concat_list.txt")
        with open(list_file, "w") as f:
            for p in segment_paths:
                escaped = p.replace("'", "'\\''")
                f.write(f"file '{escaped}'\n")

        final_path = os.path.join(out_dir, "ranking_final.mp4")
        r = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", final_path],
            capture_output=True, text=True,
        )
        if r.returncode != 0 or not os.path.exists(final_path):
            raise RuntimeError(f"Failed to join segments: {(r.stderr or r.stdout)[-300:]}")

        output_id = str(uuid.uuid4())
        _outputs[output_id] = final_path

        # The per-segment renders and concat list were only ever needed to
        # produce ranking_final.mp4 — drop them now so a build's footprint
        # on disk is just the one final video, not every intermediate too.
        for p in segment_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        try:
            os.remove(list_file)
        except OSError:
            pass

        status.output_id = output_id
        status.filename = _safe_filename(req.output_name)
        status.size = os.path.getsize(final_path)
        status.progress = 100
        status.step = "Done"
        status.status = "done"
    except Exception as e:
        status.status = "error"
        status.error = str(e)
        # Nothing in a failed build is reachable from `_outputs`, so there's
        # no reason to keep its partial files on disk.
        shutil.rmtree(out_dir, ignore_errors=True)


@router.post("/build", response_model=RankingBuildStatus)
def build_ranking(req: RankingBuildRequest, background_tasks: BackgroundTasks):
    if not req.items:
        raise HTTPException(400, "No clips provided")

    build_id = str(uuid.uuid4())
    status = RankingBuildStatus(build_id=build_id, status="queued")
    builds[build_id] = status
    background_tasks.add_task(_run_build, build_id, req)
    return status


@router.get("/build/{build_id}", response_model=RankingBuildStatus)
def get_build_status(build_id: str):
    status = builds.get(build_id)
    if not status:
        raise HTTPException(404, "Build not found")
    return status
