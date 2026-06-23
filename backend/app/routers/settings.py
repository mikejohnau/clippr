from fastapi import APIRouter, HTTPException, UploadFile, File
import os, pathlib, time

router = APIRouter()

COOKIES_DIR = str(pathlib.Path(__file__).parent.parent.parent.parent / "cookies")
INSTAGRAM_COOKIES_PATH = os.path.join(COOKIES_DIR, "instagram.txt")


@router.get("/cookies/instagram")
def instagram_cookies_status():
    if not os.path.exists(INSTAGRAM_COOKIES_PATH):
        return {"exists": False}
    stat = os.stat(INSTAGRAM_COOKIES_PATH)
    return {
        "exists": True,
        "size": stat.st_size,
        "uploaded_at": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime)),
    }


@router.post("/cookies/instagram")
async def upload_instagram_cookies(file: UploadFile = File(...)):
    os.makedirs(COOKIES_DIR, exist_ok=True)
    contents = await file.read()
    if not contents.strip():
        raise HTTPException(400, "Uploaded file is empty")
    # Netscape cookie files start with this header or a comment; basic sanity check only
    with open(INSTAGRAM_COOKIES_PATH, "wb") as f:
        f.write(contents)
    return {"ok": True}


@router.delete("/cookies/instagram")
def delete_instagram_cookies():
    if os.path.exists(INSTAGRAM_COOKIES_PATH):
        os.remove(INSTAGRAM_COOKIES_PATH)
    return {"ok": True}
