#!/usr/bin/env bash
#
# deploy.sh — Pull the latest code and deploy it with the existing docker
# compose stack, without recreating containers unnecessarily.
#
# The FE/BE source code is bind-mounted into the containers, so after pulling
# the new code a container restart is what makes the changes live. This script
# therefore runs `docker compose up -d --no-recreate` (rebuild images, create
# only what is missing, never recreate existing containers), followed by a
# `docker compose restart`, then reports the final status.
#
# Usage:
#   ./deploy.sh                  pull + rebuild + restart + status
#   ./deploy.sh --skip-pull      deploy the currently checked-out code
#   ./deploy.sh --no-build       skip the image rebuild during 'docker compose up'
#   ./deploy.sh --no-restart     don't restart the running containers
#   ./deploy.sh --help           show this help and exit

set -euo pipefail

# --- Configuration -------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

DO_PULL=true
DO_BUILD=true
DO_RESTART=true

# --- Helpers -------------------------------------------------------------------
info() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[OK]\033[0m   %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
deploy.sh — pull the latest code and deploy it with the existing docker compose stack.

Usage:
  ./deploy.sh                  pull + rebuild + restart + status
  ./deploy.sh --skip-pull      deploy the currently checked-out code
  ./deploy.sh --no-build       skip the image rebuild during 'docker compose up'
  ./deploy.sh --no-restart     don't restart the running containers
  ./deploy.sh --help           show this help and exit

The stack is brought up with '--no-recreate' so existing containers are never
recreated unnecessarily. Because source code is bind-mounted into the
containers, a restart is what applies the freshly pulled code to them.
EOF
  exit 0
}

# --- Parse CLI arguments ---------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)  DO_PULL=false ;;
    --no-build)   DO_BUILD=false ;;
    --no-restart) DO_RESTART=false ;;
    --help|-h)    usage ;;
    *) die "Unknown option '$1'. Run './deploy.sh --help'." ;;
  esac
  shift
done

# --- Pre-flight checks -------------------------------------------------------------
command -v git    >/dev/null 2>&1 || die "'git' is required but not found."
command -v docker >/dev/null 2>&1 || die "'docker' is required but not found."
docker compose version >/dev/null 2>&1 || die "'docker compose' (Compose v2) is required."

[[ -f "${COMPOSE_FILE}" ]] || die "docker-compose.yml not found at ${COMPOSE_FILE}"
[[ -f "${ENV_FILE}" ]] || warn "Missing ${ENV_FILE}; docker compose may fail if it uses those variables."

# --- 1) Pull the latest code ---------------------------------------------------------
if [[ "${DO_PULL}" == true ]]; then
  info "Pulling the latest code into ${REPO_ROOT} ..."
  cd "${REPO_ROOT}"
  [[ -d .git ]] || die "Not a git repository: ${REPO_ROOT}"

  if [[ -n "$(git status --porcelain)" ]]; then
    warn "There are local changes; 'git pull --ff-only' may fail if they conflict."
  fi

  git fetch --prune origin

  branch="$(git branch --show-current)"
  [[ -n "${branch}" ]] || die "Detached HEAD in ${REPO_ROOT} — cannot determine branch to pull."
  git pull --ff-only origin "${branch}"

  if [[ -f .gitmodules ]]; then
    info "Syncing git submodules ..."
    git submodule update --init --recursive
  fi

  ok "Latest code checked out (branch: ${branch}, HEAD: $(git rev-parse --short HEAD))"
else
  info "Skipping 'git pull' (--skip-pull)."
fi

# --- 2) Deploy with docker compose (no unnecessary recreation) -----------------------
cd "${SCRIPT_DIR}"

COMPOSE_UP_ARGS=(--no-recreate)
if [[ "${DO_BUILD}" == true ]]; then
  COMPOSE_UP_ARGS+=(--build)
fi

info "Starting the stack: docker compose -f docker-compose.yml up -d ${COMPOSE_UP_ARGS[*]} ..."
docker compose -f "${COMPOSE_FILE}" up -d "${COMPOSE_UP_ARGS[@]}"
ok "Stack is up; existing containers were not recreated."

if [[ "${DO_RESTART}" == true ]]; then
  info "Restarting containers so the pulled code takes effect ..."
  docker compose -f "${COMPOSE_FILE}" restart
  ok "Containers restarted."
fi

# --- 3) Report status -----------------------------------------------------------------
echo
info "Deployment status:"
docker compose -f "${COMPOSE_FILE}" ps

echo
ok "Deployment finished successfully."
