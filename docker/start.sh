#!/bin/sh
# InsurAI Fullstack Container Startup Script
# Starts both nginx (frontend) and Node.js (backend)

set -e

echo "Starting InsurAI..."

# Start nginx in background
echo "Starting nginx..."
nginx

# Start Node.js backend
echo "Starting backend server on port ${API_PORT:-4001}..."
exec node dist-server/index.js
