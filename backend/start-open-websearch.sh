#!/bin/bash
# Start open-webSearch MCP server in background

echo "Starting open-webSearch MCP server..."
DEFAULT_SEARCH_ENGINE=duckduckgo PORT=3001 npx open-websearch@latest > logs/open-websearch.log 2>&1 &
echo $! > logs/open-websearch.pid
echo "open-webSearch started on port 3001 (PID: $(cat logs/open-websearch.pid))"
echo "Logs: logs/open-websearch.log"
