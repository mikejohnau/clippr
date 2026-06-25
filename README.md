# Clippr

A self-hostable viral clip discovery and editing tool. Find trending videos across YouTube, TikTok and Instagram, organise them into projects, trim and extract clips with a built-in editor, and download the results.

---

## Features

### Discovery
- **YouTube search** — search by topic, sorted by view count, with filters for date range, duration, and minimum views
- **YouTube Trending** — browse the mostPopular chart filtered by category (Gaming, Sports, Music, etc.)
- **Rising Channels** — momentum-scored channel discovery (recent views ÷ subscribers)
- **Google Trends** — daily trending topics by region, with related news articles and one-click YouTube search
- **TikTok & Instagram import** — paste a URL to pull in any clip from those platforms

### Organisation
- **Projects** — save clips into named projects backed by SQLite; rename and delete projects freely
- **Clip notes** — attach freeform notes to any saved clip
- **Download history** — clips you've previously downloaded show a green "↓ Downloaded" badge

### Editing
- **Built-in trim editor** — click Edit on any clip to download it to the server and open the editor
- **Mark In / Mark Out** — set start and end points from the current playback position
- **Multiple extractions** — queue several segments from the same source video and extract them all at once
- **Mute audio** — per-segment mute toggle
- **Title overlays** — burn in a caption using a fixed set of templates (Bold Caption, Lower Third, Top Banner), with a choice of 4 fonts, custom size, and color picker per segment
- **Aspect ratio crop** — centered crop to 9:16, 1:1, 4:5, or 16:9, with a live preview of what gets cut
- **Instant extraction** — uses `ffmpeg -c copy` (no re-encode) when no overlay or crop is set, so plain trims are near-instant; segments with a title overlay or crop re-encode via `libx264`
- **Clean up** — delete the source file from within the editor when you're done

### Project templates
Creating a project lets you pick a template, which swaps the plain notes list for a purpose-built, server-rendered video builder. Every template shares the same title-overlay and call-to-action system, persists all its settings per-project across refreshes, and shows live build progress with an inline preview when done.

- **Ranking video** — queue any number of saved clips into one ordered countdown, each with its own trim range and an optional "#N" rank badge overlay.
- **Video commentary** — the first saved clip plays full-frame; the second is overlaid as a reaction picture-in-picture in a chosen corner, with adjustable size and border.
- **Split-screen video** — the first two saved clips fill one half each (stacked or side-by-side); audio mixes both clips or falls back to whichever isn't muted.
- **Still image story** — upload your own images (no clip pipeline involved), set how long each is held, and combine them with a Ken Burns pan/zoom or a static crossfade.
- **Text story** — a sequence of text slides on a plain background, Reddit-story style, with the same hard-cut/crossfade choice as image story.

**Title overlay** — a persistent caption burned into the whole video (Bold Caption, Lower Third, or Top Banner), with font, size, color, background color, and an adjustable text stroke.

**Call to action** — an optional "Like & Subscribe"-style prompt that can appear at the start, middle, and/or end of the video. The hold duration and the fade/slide-in transition length are independent timers that stack — the transition is *additional* screen time, not carved out of the hold — so the full appear → hold → disappear sequence always finishes exactly when its envelope ends.

### UI
- Persistent search hub at the top — YouTube, TikTok, and Instagram always available
- Sidebar with Google Trends, project switcher, and category filters
- Light / dark theme toggle
- Search history chips
- Batch download (select multiple clips and queue them sequentially)
- Channel info modal — banner, avatar, stats, description, and recent videos

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, uvicorn |
| Video download | yt-dlp |
| Video editing | ffmpeg |
| Database | SQLite (built-in) |
| Frontend | React 18, TypeScript, Vite |
| APIs | YouTube Data API v3, Google Trends RSS |

---

## Setup

### Prerequisites
- Python 3.12+
- Node 18+
- ffmpeg (`brew install ffmpeg` on macOS)
- A [YouTube Data API v3 key](https://console.cloud.google.com/)

### Backend

```bash
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` (or export directly):

```
YOUTUBE_API_KEY=your_key_here
```

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The frontend proxies `/api/*` to `localhost:8000` via the Vite dev config.

### Production build

```bash
cd frontend && npm run build
```

Serve `frontend/dist` as static files and run the FastAPI backend with `uvicorn app.main:app --port 8000`.

---

## Project structure

```
clippr/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, routers, imgproxy
│       ├── db.py                # SQLite init (projects, clips, downloads)
│       ├── cleanup.py           # Periodic sweep of /clips (clips, uploaded images, build temp dirs)
│       ├── models/              # Pydantic models (Clip, etc.)
│       ├── services/
│       │   └── youtube.py       # YouTube API + trending helpers
│       └── routers/
│           ├── search.py        # YouTube search
│           ├── trending.py      # YouTube trending + Google Trends RSS
│           ├── channels.py      # Rising channels + channel info
│           ├── download.py      # yt-dlp download jobs
│           ├── edit.py          # ffmpeg trim/extract workspace; shared title/CTA overlay filters
│           ├── projects.py      # Project + clip CRUD, template list
│           ├── ranking.py       # Ranking-video template build pipeline
│           ├── commentary.py    # Commentary (base + reaction PiP) build pipeline
│           ├── splitscreen.py   # Split-screen build pipeline
│           ├── image_story.py   # Image upload + still-image-story build pipeline
│           ├── text_story.py    # Text-story build pipeline
│           └── downloads_history.py
├── frontend/
│   └── src/
│       ├── App.tsx              # Main layout, sidebar, search hub, project template picker
│       ├── components/
│       │   ├── ClipCard.tsx     # Video card with edit/save/preview
│       │   ├── EditModal.tsx    # Trim editor with segment queue
│       │   ├── ChannelCard.tsx  # Rising channel card
│       │   ├── ChannelInfoModal.tsx
│       │   ├── SaveToProjectModal.tsx
│       │   ├── ClipTrimModal.tsx       # Shared big-player trim/mute modal (ranking/split-screen/commentary)
│       │   ├── OverlayEditors.tsx      # Shared title-overlay + CTA form sections
│       │   ├── RankingBuilder.tsx
│       │   ├── SplitScreenBuilder.tsx
│       │   ├── CommentaryBuilder.tsx
│       │   ├── ImageStoryBuilder.tsx
│       │   └── TextStoryBuilder.tsx
│       └── types.ts
├── clips/                       # Downloaded source files, uploaded images, build temp dirs (git-ignored, auto-swept)
└── clippr.db                    # SQLite database (git-ignored)
```

---

## Notes

- **ffmpeg cut accuracy**: extraction uses `-c copy` (no re-encode) which is fast but snaps to the nearest keyframe — typically within ~1 second of the marked point. Frame-accurate cuts would require re-encoding.
- **TikTok downloads**: use `yt-dlp --impersonate chrome` via subprocess. Success depends on TikTok's current bot detection.
- **Instagram downloads**: Instagram frequently blocks anonymous yt-dlp requests with a login wall. Upload a cookies.txt file (exported from a logged-in browser session, e.g. with the "Get cookies.txt LOCALLY" extension) via the ⚙ Settings panel to fix this — Clippr never sees your password, only the exported session cookies.
- **Google Trends**: the RSS feed only provides daily data; the hours/category parameters on the RSS endpoint have no effect.
- **Automatic cleanup**: `/clips` is a working area, not permanent storage — downloaded source clips, uploaded story images, and template build temp directories are swept automatically on startup and every 6 hours, with a 24-hour retention. Anything still actively downloading or building is never touched. Download the final result you want to keep before it ages out.
- **Self-hosted**: no accounts, no cloud dependencies beyond the YouTube API key. Everything runs locally.
