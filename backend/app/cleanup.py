import asyncio, os, shutil, time

from app.routers.download import CLIPS_DIR, jobs
from app.routers.ranking import builds

# How long a downloaded clip / ranking build is kept on disk before it's
# swept, and how often the sweep runs. Clips are meant to be a working area
# (download -> edit/build -> save the result elsewhere), not permanent
# storage, so a fairly short retention is fine and keeps /clips from growing
# unbounded across sessions.
RETENTION_HOURS = 24
SWEEP_INTERVAL_SECONDS = 6 * 3600


def _is_stale(path: str, max_age_seconds: float) -> bool:
    try:
        return (time.time() - os.path.getmtime(path)) > max_age_seconds
    except OSError:
        return False


def cleanup_old_clips(retention_hours: float = RETENTION_HOURS):
    """Delete downloaded-clip workspaces and ranking-build directories older
    than `retention_hours`, skipping anything still actively in progress."""
    if not os.path.isdir(CLIPS_DIR):
        return
    max_age = retention_hours * 3600

    for name in os.listdir(CLIPS_DIR):
        path = os.path.join(CLIPS_DIR, name)
        if not os.path.isdir(path):
            continue

        if name == "_ranking":
            for build_id in os.listdir(path):
                build_path = os.path.join(path, build_id)
                status = builds.get(build_id)
                if status and status.status in ("queued", "building"):
                    continue  # still being built — never sweep mid-build
                if _is_stale(build_path, max_age):
                    shutil.rmtree(build_path, ignore_errors=True)
            continue

        job_id = name
        job = jobs.get(job_id)
        if job and job.status in ("queued", "downloading"):
            continue  # still downloading — never sweep mid-download
        if _is_stale(path, max_age):
            shutil.rmtree(path, ignore_errors=True)


async def run_periodic_cleanup():
    """Sweep once at startup, then again every SWEEP_INTERVAL_SECONDS for as
    long as the app runs."""
    while True:
        cleanup_old_clips()
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
