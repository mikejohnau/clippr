from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os, uuid, subprocess, pathlib

from app.routers.download import CLIPS_DIR
from app.routers.edit import (
    _source_path, _find_font, _escape_drawtext, _ffmpeg_color, _outputs,
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


class RankingBuildRequest(BaseModel):
    items: list[RankingItem]
    aspect_ratio: str = "9:16"


def _rank_overlay_filter(label: str, font_family: str, font_size: int, font_color: str) -> str:
    font = _find_font(font_family)
    font_arg = f"fontfile='{font}':" if font else ""
    esc = _escape_drawtext(label)
    size = font_size or 90
    color = _ffmpeg_color(font_color)
    return (
        f"drawtext={font_arg}text='{esc}':fontsize={size}:fontcolor={color}:"
        f"borderw=5:bordercolor=black:x=40:y=40"
    )


@router.post("/build")
def build_ranking(req: RankingBuildRequest):
    if not req.items:
        raise HTTPException(400, "No clips provided")

    canvas_w, canvas_h = ASPECT_CANVAS.get(req.aspect_ratio, ASPECT_CANVAS["9:16"])

    build_id = str(uuid.uuid4())
    out_dir = os.path.join(CLIPS_DIR, "_ranking", build_id)
    os.makedirs(out_dir, exist_ok=True)

    segment_paths = []
    try:
        for i, item in enumerate(req.items):
            src = _source_path(item.job_id)
            if not src or not os.path.exists(src):
                raise HTTPException(404, f"Source not found for item {i + 1} (job_id={item.job_id})")
            if item.end <= item.start:
                raise HTTPException(400, f"Item {i + 1} has an invalid trim range")

            label = (item.label or "").strip() or f"#{item.rank}"
            overlay = _rank_overlay_filter(label, item.font_family, item.font_size, item.font_color)
            vf = (
                f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase,"
                f"crop={canvas_w}:{canvas_h},{overlay}"
            )
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
                raise HTTPException(500, f"Failed to render item {i + 1}: {(r.stderr or r.stdout)[-300:]}")
            segment_paths.append(seg_path)

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
            raise HTTPException(500, f"Failed to join segments: {(r.stderr or r.stdout)[-300:]}")

        output_id = str(uuid.uuid4())
        _outputs[output_id] = final_path
        return {
            "output_id": output_id,
            "filename": "ranking_video.mp4",
            "size": os.path.getsize(final_path),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
