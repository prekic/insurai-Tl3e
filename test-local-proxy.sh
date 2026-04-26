#!/bin/bash
npx tsx server/index.ts > server-test.log 2>&1 &
PID=$!
echo "Server started with PID $PID. Waiting 5s..."
sleep 5
echo "Running test..."
node scripts/test-providers-direct.cjs > test.log 2>&1
echo "Killing server..."
kill $PID
