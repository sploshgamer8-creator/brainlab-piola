#!/bin/bash

# Start llama-server in the background
echo "Starting llama-server (Linux)..."
./bin/llama-server -m models/qwen2.5-0.5b.gguf --port 8080 --host 127.0.0.1 -c 2048 &
LLAMA_PID=$!

# Wait a couple of seconds for it to bind
sleep 2

# Start the Node.js Express server
echo "Starting Node.js server on port $PORT..."
npm run start:railway

# If the node server dies, kill llama-server as well
kill $LLAMA_PID
