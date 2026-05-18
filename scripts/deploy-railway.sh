#!/bin/bash
# Deploy InsurAI to Railway
# Usage: ./scripts/deploy-railway.sh
set -e

cd "$(dirname "$0")/.."

# The Railway token must be provided via RAILWAY_API_TOKEN env var
# or stored in /data/.railway/api_token
TOKEN_FILE="/data/.railway/api_token"
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(cat "$TOKEN_FILE")
elif [ -n "$RAILWAY_API_TOKEN" ]; then
  TOKEN="$RAILWAY_API_TOKEN"
else
  echo "Error: No Railway token found. Set RAILWAY_API_TOKEN env var or create /data/.railway/api_token"
  exit 1
fi

echo "=== Deploying InsurAI to Railway ==="
echo "Project: fearless-serenity (production)"
echo ""

RAILWAY_API_TOKEN="$TOKEN" railway up

echo ""
echo "=== Deploy complete ==="
echo "Health check: https://insurai-production.up.railway.app/api/health"
