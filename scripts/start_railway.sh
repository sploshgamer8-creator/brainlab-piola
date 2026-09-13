#!/bin/sh
set -e

echo "[BrainLab] Starting Railway service..."

if [ -n "$DATABASE_URL" ] || [ -n "$POSTGRES_URL" ]; then
  echo "[BrainLab] Running PostgreSQL migrations..."
  node scripts/migrate.js || true
fi

if [ -f "./bin/llama-server" ]; then
  echo "[BrainLab] Starting local llama-server in background..."
  ./bin/llama-server --port 8080 -m ./models/qwen2.5-0.5b.gguf &
fi

echo "[BrainLab] Starting Express backend..."
npm run start:railway