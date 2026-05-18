#!/bin/bash
# Deploy InsurAI to Railway
# Usage: ./scripts/deploy-railway.sh
set -e

cd "$(dirname "$0")/.."

TOKEN_FILE="/data/.railway/config.json"
TOKEN=$(python3 -c "import json; print(json.load(open('$TOKEN_FILE'))['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "Error: No Railway token found in $TOKEN_FILE"
  exit 1
fi

echo "=== Deploying InsurAI to Railway ==="
echo "Project: fearless-serenity (production)"
echo ""

RAILWAY_API_TOKEN="$TOKEN" railway up

echo ""
echo "=== Deploy complete ==="
echo "Health check: https://insurai-production.up.railway.app/api/health"
