#!/usr/bin/env bash
# ============================================================
#  Clippr — Update script
#  Usage:  bash /opt/clippr/update.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
section() { echo -e "\n${BLUE}${BOLD}▶ $*${NC}"; }
info()    { echo -e "${GREEN}✔${NC}  $*"; }

INSTALL_DIR="/opt/clippr"

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }

section "Pulling latest code"
git -C "$INSTALL_DIR" pull --ff-only
info "Code updated"

section "Updating Python dependencies"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade yt-dlp
"$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/backend/requirements.txt"
info "Python deps updated"

section "Rebuilding frontend"
cd "$INSTALL_DIR/frontend"
npm install --silent --no-fund --no-audit
npm run build
info "Frontend rebuilt"

section "Restarting services"
systemctl daemon-reload
systemctl restart clippr
sleep 2
systemctl is-active --quiet clippr && info "Clippr restarted" || echo "Check: journalctl -u clippr -n 20"

echo -e "\n${GREEN}${BOLD}Update complete!${NC}"
