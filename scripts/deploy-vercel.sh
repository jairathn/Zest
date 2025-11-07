#!/usr/bin/env bash
set -euo pipefail

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

echo "Building Next.js project..."
npm run build

echo "Deploying to Vercel..."
vercel --prod
