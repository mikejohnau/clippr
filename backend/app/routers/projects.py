import json, uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db import get_db

router = APIRouter()

class ProjectIn(BaseModel):
    name: str

class ClipIn(BaseModel):
    clip: dict
    notes: str = ""

class NotesIn(BaseModel):
    notes: str

@router.get("/")
def list_projects():
    with get_db() as conn:
        rows = conn.execute("SELECT id, name, created_at FROM projects ORDER BY created_at").fetchall()
        return [dict(r) for r in rows]

@router.post("/")
def create_project(body: ProjectIn):
    pid = str(uuid.uuid4())[:8]
    with get_db() as conn:
        conn.execute("INSERT INTO projects (id, name) VALUES (?, ?)", (pid, body.name.strip()))
    return {"id": pid, "name": body.name.strip()}

@router.patch("/{project_id}")
def rename_project(project_id: str, body: ProjectIn):
    with get_db() as conn:
        conn.execute("UPDATE projects SET name=? WHERE id=?", (body.name.strip(), project_id))
    return {"ok": True}

@router.delete("/{project_id}")
def delete_project(project_id: str):
    if project_id == "default":
        raise HTTPException(400, "Cannot delete the Default project")
    with get_db() as conn:
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
    return {"ok": True}

@router.get("/{project_id}/clips")
def list_clips(project_id: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, clip_json, notes, saved_at FROM project_clips WHERE project_id=? ORDER BY saved_at DESC",
            (project_id,)
        ).fetchall()
        return [{"row_id": r["id"], "clip": json.loads(r["clip_json"]), "notes": r["notes"], "saved_at": r["saved_at"]} for r in rows]

@router.post("/{project_id}/clips")
def add_clip(project_id: str, body: ClipIn):
    clip = body.clip
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM project_clips WHERE project_id=? AND clip_id=? AND platform=?",
            (project_id, clip["id"], clip["platform"])
        ).fetchone()
        if existing:
            return {"row_id": existing["id"], "already_exists": True}
        cur = conn.execute(
            "INSERT INTO project_clips (project_id, clip_id, platform, clip_json, notes) VALUES (?,?,?,?,?)",
            (project_id, clip["id"], clip["platform"], json.dumps(clip), body.notes)
        )
    return {"row_id": cur.lastrowid}

@router.patch("/{project_id}/clips/{row_id}")
def update_notes(project_id: str, row_id: int, body: NotesIn):
    with get_db() as conn:
        conn.execute("UPDATE project_clips SET notes=? WHERE id=? AND project_id=?", (body.notes, row_id, project_id))
    return {"ok": True}

@router.delete("/{project_id}/clips/{row_id}")
def remove_clip(project_id: str, row_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM project_clips WHERE id=? AND project_id=?", (row_id, project_id))
    return {"ok": True}
