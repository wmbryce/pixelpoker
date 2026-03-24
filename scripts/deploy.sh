#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN="$HOME/.bun/bin/bun"

echo "→ Pulling latest changes..."
git -C "$REPO_DIR" checkout -- bun.lock
git -C "$REPO_DIR" pull origin master

echo "→ Installing dependencies..."
"$BUN" install --cwd "$REPO_DIR" --frozen-lockfile

echo "→ Building client..."
"$BUN" --cwd "$REPO_DIR" --filter client build

echo "→ Restarting server..."
pm2 restart "$REPO_DIR/ecosystem.config.cjs" --update-env 2>/dev/null \
  || pm2 start "$REPO_DIR/ecosystem.config.cjs"

pm2 save

echo "✓ Deploy complete"
