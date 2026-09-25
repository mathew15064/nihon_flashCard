#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%dT%H-%M-%S)
DEST="data/backups/full-${STAMP}"
mkdir -p "$DEST"
[ -f data/users.json ]  && cp data/users.json "$DEST/"
[ -d data/content ]     && cp -r data/content "$DEST/"
[ -d data/learning ]    && cp -r data/learning "$DEST/"
echo "Backup: $DEST"
du -sh "$DEST"
