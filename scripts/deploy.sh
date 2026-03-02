#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "→ Pulling latest changes..."
git -C "$REPO_DIR" pull origin master

echo "→ Installing dependencies..."
bun install --cwd "$REPO_DIR" --frozen-lockfile

echo "→ Building client..."
bun --filter client build

echo "→ Restarting server..."
pm2 restart "$REPO_DIR/ecosystem.config.cjs" --update-env 2>/dev/null \
  || pm2 start "$REPO_DIR/ecosystem.config.cjs"

pm2 save

echo "✓ Deploy complete"
