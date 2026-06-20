#!/usr/bin/env bash
# ============================================================
#  Clippr — Install script for Debian 12 (Proxmox LXC)
#  Usage:  curl -fsSL https://raw.githubusercontent.com/mikejohnau/clippr/main/install.sh | bash
# ============================================================
set -euo pipefail

# ── colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
section() { echo -e "\n${BLUE}${BOLD}▶ $*${NC}"; }
die()     { echo -e "${RED}✘  $*${NC}" >&2; exit 1; }

# ── config ────────────────────────────────────────────────────
INSTALL_DIR="/opt/clippr"
SERVICE_USER="clippr"
REPO="https://github.com/mikejohnau/clippr.git"
NODE_MAJOR=20
BACKEND_PORT=8000

# ── root check ───────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run this script as root (sudo bash install.sh)"

echo -e "
${BLUE}${BOLD}╔══════════════════════════════════════════╗
║          Clippr  —  Installer            ║
║   Viral clip discovery & editing tool    ║
╚══════════════════════════════════════════╝${NC}
"

# ── 1. System packages ────────────────────────────────────────
section "1/8  System packages"
apt-get update -qq
apt-get install -y -qq \
    curl wget git ffmpeg \
    python3 python3-pip python3-venv \
    build-essential ca-certificates gnupg \
    nginx
info "System packages installed"

# ── 2. Node.js ────────────────────────────────────────────────
section "2/8  Node.js ${NODE_MAJOR}"
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt $NODE_MAJOR ]]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
fi
info "Node $(node -v) / npm $(npm -v)"

# ── 3. Clone / update repo ────────────────────────────────────
section "3/8  Clippr source"
if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "Found existing install at $INSTALL_DIR — pulling latest"
    git -C "$INSTALL_DIR" pull --ff-only
else
    git clone "$REPO" "$INSTALL_DIR"
fi
info "Source at $INSTALL_DIR"

# ── 4. Python venv + deps ─────────────────────────────────────
section "4/8  Python environment"
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt"
info "Python venv ready"

# ── 5. yt-dlp (keep up-to-date binary) ───────────────────────
section "5/8  yt-dlp"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade yt-dlp
info "yt-dlp $("$INSTALL_DIR/venv/bin/yt-dlp" --version)"

# ── 6. Frontend build ─────────────────────────────────────────
section "6/8  Frontend (React + Vite build)"
cd "$INSTALL_DIR/frontend"
npm install --silent --no-fund --no-audit
npm run build
info "Frontend built → $INSTALL_DIR/frontend/dist"

# ── 7. Directories & env ──────────────────────────────────────
section "7/8  Configuration"
mkdir -p "$INSTALL_DIR/clips" "$INSTALL_DIR/workspace"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    echo ""
    echo -e "  ${BOLD}A YouTube Data API v3 key is required for search and trending features.${NC}"
    echo -e "  Get one free at: ${BLUE}https://console.cloud.google.com/${NC}"
    echo ""
    read -rp "  Enter your YouTube API key (or press Enter to skip and set later): " YT_KEY
    echo "YOUTUBE_API_KEY=${YT_KEY}" > "$INSTALL_DIR/.env"
    info ".env created at $INSTALL_DIR/.env"
else
    warn ".env already exists — skipping (edit $INSTALL_DIR/.env to change the API key)"
fi

# ── 8a. Service user ─────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /usr/sbin/nologin -d "$INSTALL_DIR" "$SERVICE_USER"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# ── 8b. systemd — backend ─────────────────────────────────────
section "8/8  Services"
cat > /etc/systemd/system/clippr.service << EOF
[Unit]
Description=Clippr Backend (FastAPI + uvicorn)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 1
Restart=always
RestartSec=5
# Allow yt-dlp and ffmpeg enough time
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
info "systemd unit created"

# ── 8c. nginx ─────────────────────────────────────────────────
cat > /etc/nginx/sites-available/clippr << 'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Increase for large video uploads / downloads
    client_max_body_size 2G;
    proxy_read_timeout   300s;
    proxy_send_timeout   300s;

    # ── Frontend (built React app) ──────────────────────────
    root /opt/clippr/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── API → uvicorn ───────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   Connection        "";

        # Disable buffering for streaming (video serve, SSE)
        proxy_buffering    off;
        proxy_cache        off;

        # Large file downloads
        proxy_max_temp_file_size 0;
    }
}
NGINX

# Enable site, disable default
ln -sf /etc/nginx/sites-available/clippr /etc/nginx/sites-enabled/clippr
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx
info "nginx configured"

# ── Start backend ─────────────────────────────────────────────
systemctl daemon-reload
systemctl enable clippr
systemctl restart clippr

# Wait a moment and check it's running
sleep 3
if systemctl is-active --quiet clippr; then
    info "Clippr backend running"
else
    warn "Backend may not have started — check: journalctl -u clippr -n 30"
fi

# ── Done ──────────────────────────────────────────────────────
LAN_IP=$(hostname -I | awk '{print $1}')
echo -e "
${GREEN}${BOLD}╔══════════════════════════════════════════╗
║          Installation complete!          ║
╚══════════════════════════════════════════╝${NC}

  ${BOLD}Open Clippr in your browser:${NC}
  ${BLUE}http://${LAN_IP}${NC}

  ${BOLD}Useful commands:${NC}
  ${YELLOW}systemctl status clippr${NC}        — check backend status
  ${YELLOW}journalctl -u clippr -f${NC}        — live backend logs
  ${YELLOW}systemctl restart clippr${NC}       — restart backend
  ${YELLOW}nano ${INSTALL_DIR}/.env${NC}       — edit API key

  ${BOLD}To update Clippr later:${NC}
  ${YELLOW}bash ${INSTALL_DIR}/update.sh${NC}
"
