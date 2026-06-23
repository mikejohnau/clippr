import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "clippr.db")
DB_PATH = os.path.abspath(DB_PATH)

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id       TEXT PRIMARY KEY,
                name     TEXT NOT NULL,
                template TEXT NOT NULL DEFAULT 'general',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS project_clips (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                clip_id    TEXT NOT NULL,
                platform   TEXT NOT NULL,
                clip_json  TEXT NOT NULL,
                notes      TEXT NOT NULL DEFAULT '',
                saved_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS downloads (
                clip_id      TEXT NOT NULL,
                platform     TEXT NOT NULL,
                title        TEXT,
                downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (clip_id, platform)
            );
            -- seed a Default project if none exist
            INSERT OR IGNORE INTO projects (id, name) VALUES ('default', 'Default');
        """)
        # migrate existing DBs created before the template column existed
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        if "template" not in cols:
            conn.execute("ALTER TABLE projects ADD COLUMN template TEXT NOT NULL DEFAULT 'general'")
