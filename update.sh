#!/usr/bin/env bash
# ============================================================
#  Clippr — Update script
#  Usage:  bash /opt/clippr/update.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
CYAN='\033[0;36m'; RED='\033[0;31m'; YELLOW='\033[1;33m'

section() { echo -e "\n${BLUE}${BOLD}▶ $*${NC}"; }
info()    { echo -e "${GREEN}✔${NC}  $*"; }

# ── spinner ──────────────────────────────────────────────────
_SPINNER_PID=""
_SPINNER_FRAMES='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

spin_start() {
    local msg="$1"
    (
        local i=0
        while true; do
            i=$(( (i + 1) % 10 ))
            printf "\r   ${CYAN}${_SPINNER_FRAMES:$i:1}${NC}  ${msg}..."
            sleep 0.08
        done
    ) &
    _SPINNER_PID=$!
    disown "$_SPINNER_PID" 2>/dev/null || true
}

spin_stop() {
    local label="${1:-}"
    if [[ -n "$_SPINNER_PID" ]]; then
        kill "$_SPINNER_PID" 2>/dev/null || true
        wait "$_SPINNER_PID" 2>/dev/null || true
        _SPINNER_PID=""
    fi
    printf "\r\033[K"
    [[ -n "$label" ]] && info "$label"
}

run_spin() {
    local msg="$1"; shift
    spin_start "$msg"
    local log; log=$(mktemp)
    if "$@" >"$log" 2>&1; then
        spin_stop "$msg"
    else
        spin_stop
        echo -e "${RED}✘  $msg failed${NC}"
        echo -e "${YELLOW}--- output ---${NC}"
        cat "$log"
        rm -f "$log"
        exit 1
    fi
    rm -f "$log"
}

INSTALL_DIR="/opt/clippr"

[[ $EUID -eq 0 ]] || { echo "Run as root"; exit 1; }

section "Pulling latest code"
run_spin "Fetching updates" git -C "$INSTALL_DIR" pull --ff-only
info "Code updated"

section "Updating Python dependencies"
run_spin "Upgrading pip" "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
echo -e "  ${CYAN}Upgrading yt-dlp...${NC}"
"$INSTALL_DIR/venv/bin/pip" install --progress-bar on --upgrade yt-dlp
echo -e "  ${CYAN}Updating Python dependencies...${NC}"
"$INSTALL_DIR/venv/bin/pip" install --progress-bar on -r "$INSTALL_DIR/backend/requirements.txt"
info "Python deps updated"

section "Rebuilding frontend"
cd "$INSTALL_DIR/frontend"
echo -e "  ${CYAN}Installing npm packages...${NC}"
npm install --no-fund --no-audit
echo -e "  ${CYAN}Building frontend...${NC}"
npm run build
info "Frontend rebuilt"

section "Restarting services"
run_spin "Reloading systemd" systemctl daemon-reload
run_spin "Restarting Clippr" systemctl restart clippr
sleep 2
systemctl is-active --quiet clippr && info "Clippr restarted" || echo "Check: journalctl -u clippr -n 20"

echo -e "\n${GREEN}${BOLD}Update complete!${NC}"
