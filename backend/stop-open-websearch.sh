#!/bin/bash
# Stop open-webSearch MCP server

if [ -f logs/open-websearch.pid ]; then
  PID=$(cat logs/open-websearch.pid)
  echo "Stopping open-webSearch (PID: $PID)..."
  kill $PID 2>/dev/null && echo "Stopped" || echo "Process not found"
  rm logs/open-websearch.pid
else
  echo "PID file not found"
fi
