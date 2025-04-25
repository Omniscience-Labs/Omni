#!/bin/bash

# Print colored output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${RED}Cleaning up all services...${NC}"

# Determine the script and project directories
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
if [[ "$SCRIPT_DIR" == */scripts ]]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
fi

# Stop all running background processes from previous runs
echo -e "${BLUE}Stopping background processes...${NC}"
pkill -f "uvicorn api:app"
pkill -f "npm run dev"

# Stop Redis container if running
echo -e "${BLUE}Stopping Redis container...${NC}"
docker stop agentpress-redis 2>/dev/null || true
docker rm agentpress-redis 2>/dev/null || true

# Stop Supabase
echo -e "${BLUE}Stopping Supabase...${NC}"
cd "$PROJECT_ROOT/backend/supabase"
supabase stop 2>/dev/null || true
cd "$SCRIPT_DIR"

echo -e "${GREEN}Cleanup complete. You can now start the services again.${NC}" 