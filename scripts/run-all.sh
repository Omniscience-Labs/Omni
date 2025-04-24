#!/bin/bash

# Print colored output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting AgentPress Development Environment${NC}"

# Load environment variables from .env file
# Check if script is being run from the project root or from the scripts directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
if [[ "$SCRIPT_DIR" == */scripts ]]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
fi

if [ -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${BLUE}Loading environment variables from .env file...${NC}"
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo -e "${RED}Error: .env file not found in project root: $PROJECT_ROOT${NC}"
    exit 1
fi

# Run cleanup script to ensure all previous services are stopped
if [ -f "$SCRIPT_DIR/cleanup.sh" ]; then
    echo -e "${BLUE}Running cleanup script...${NC}"
    bash "$SCRIPT_DIR/cleanup.sh"
fi

# Check if init-dev.sh exists and run it if it does
if [ -f "$SCRIPT_DIR/init-dev.sh" ]; then
    echo -e "${BLUE}Running initialization script...${NC}"
    bash "$SCRIPT_DIR/init-dev.sh"
fi

# Create a trap to handle ctrl+c and clean up processes
trap 'echo -e "${RED}Shutting down services...${NC}"; kill $(jobs -p) 2>/dev/null; cd "$PROJECT_ROOT/backend/supabase" && supabase stop; docker stop agentpress-redis 2>/dev/null; docker rm agentpress-redis 2>/dev/null; exit' INT TERM

# Start Supabase and ensure it starts properly
echo -e "${GREEN}Starting Supabase and extracting credentials...${NC}"
cd "$PROJECT_ROOT/backend/supabase"
# Start Supabase and store the output
supabase start > supabase_output.txt
cd "$SCRIPT_DIR"

# Wait to ensure Supabase is fully started
echo -e "${YELLOW}Waiting for Supabase to start...${NC}"
sleep 5

# Read output file
SUPABASE_OUTPUT=$(cat "$PROJECT_ROOT/backend/supabase/supabase_output.txt")
echo -e "${YELLOW}Supabase Output:${NC}"
echo "$SUPABASE_OUTPUT"

# Extract Supabase URL and keys from the output
SUPABASE_URL=$(echo "$SUPABASE_OUTPUT" | grep "API URL" | awk '{print $3}')
SUPABASE_ANON_KEY=$(echo "$SUPABASE_OUTPUT" | grep "anon key" | awk '{print $3}')
SUPABASE_SERVICE_ROLE_KEY=$(echo "$SUPABASE_OUTPUT" | grep "service_role key" | awk '{print $3}')

# Remove temp file
rm -f "$PROJECT_ROOT/backend/supabase/supabase_output.txt"

# Check if extraction was successful
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Failed to extract Supabase credentials from output.${NC}"
    echo -e "${YELLOW}Manual check - trying to get current Supabase status...${NC}"
    
    # Try to get the status
    cd "$PROJECT_ROOT/backend/supabase"
    SUPABASE_STATUS=$(supabase status)
    cd "$SCRIPT_DIR"
    
    echo "$SUPABASE_STATUS"
    
    # Try to extract again from status output
    SUPABASE_URL=$(echo "$SUPABASE_STATUS" | grep "API URL" | awk '{print $3}')
    SUPABASE_ANON_KEY=$(echo "$SUPABASE_STATUS" | grep "anon key" | awk '{print $3}')
    SUPABASE_SERVICE_ROLE_KEY=$(echo "$SUPABASE_STATUS" | grep "service_role key" | awk '{print $3}')
    
    # Still failed?
    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        echo -e "${RED}ERROR: Unable to extract Supabase credentials and cannot proceed without them.${NC}"
        echo -e "${RED}Please start Supabase manually with 'cd $PROJECT_ROOT/backend/supabase && supabase start'${NC}"
        echo -e "${RED}Then extract the credentials from the output and update environment files manually.${NC}"
        exit 1
    else
        echo -e "${GREEN}Successfully extracted Supabase credentials from status:${NC}"
    fi
else
    echo -e "${GREEN}Successfully extracted Supabase credentials:${NC}"
fi

echo -e "URL: ${SUPABASE_URL}"
echo -e "Anon Key: ${SUPABASE_ANON_KEY}"

# Special case: If URL is "database", replace with the actual local URL
if [ "$SUPABASE_URL" == "database" ]; then
    echo -e "${YELLOW}URL 'database' is not valid. Using http://127.0.0.1:54321 instead${NC}"
    SUPABASE_URL="http://127.0.0.1:54321"
# Otherwise ensure URL has a proper format
elif [[ ! "$SUPABASE_URL" == http://* && ! "$SUPABASE_URL" == https://* ]]; then
    echo -e "${YELLOW}Adding http:// prefix to URL${NC}"
    SUPABASE_URL="http://$SUPABASE_URL"
fi

# Update the environment files with the extracted credentials
echo -e "${YELLOW}Updating environment variables with extracted Supabase credentials...${NC}"

# Update the root .env file
echo -e "${YELLOW}Updating root .env file...${NC}"
sed -i '' "s|^SUPABASE_URL=.*|SUPABASE_URL=\"${SUPABASE_URL}\"|g" "$PROJECT_ROOT/.env"
sed -i '' "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=\"${SUPABASE_ANON_KEY}\"|g" "$PROJECT_ROOT/.env"
sed -i '' "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=\"${SUPABASE_SERVICE_ROLE_KEY}\"|g" "$PROJECT_ROOT/.env"
sed -i '' "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=\"${SUPABASE_URL}\"|g" "$PROJECT_ROOT/.env"
sed -i '' "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=\"${SUPABASE_ANON_KEY}\"|g" "$PROJECT_ROOT/.env"

# Update the frontend .env.local file
echo -e "${YELLOW}Updating frontend/.env.local file...${NC}"
sed -i '' "s|^SUPABASE_URL=.*|SUPABASE_URL=\"${SUPABASE_URL}\"|g" "$PROJECT_ROOT/frontend/.env.local"
sed -i '' "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=\"${SUPABASE_ANON_KEY}\"|g" "$PROJECT_ROOT/frontend/.env.local"
sed -i '' "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=\"${SUPABASE_SERVICE_ROLE_KEY}\"|g" "$PROJECT_ROOT/frontend/.env.local"
sed -i '' "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=\"${SUPABASE_URL}\"|g" "$PROJECT_ROOT/frontend/.env.local"
sed -i '' "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=\"${SUPABASE_ANON_KEY}\"|g" "$PROJECT_ROOT/frontend/.env.local"

# Update the backend .env file with correct Redis and Supabase settings
echo -e "${YELLOW}Updating backend/.env file with local Redis and Supabase settings...${NC}"

# Create or update backend/.env with correct local dev settings
cat > "$PROJECT_ROOT/backend/.env" << EOL
# API Keys (loaded from root .env)
GROQ_API_KEY="${GROQ_API_KEY}"
OPENROUTER_API_KEY="${OPENROUTER_API_KEY}"
OPENAI_API_KEY="${OPENAI_API_KEY}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
EXA_API_KEY="${EXA_API_KEY}"
TAVILY_API_KEY="${TAVILY_API_KEY}"
RAPID_API_KEY="${RAPID_API_KEY}"

# URLs
NEXT_PUBLIC_URL="${NEXT_PUBLIC_URL}"

# Local Supabase settings
SUPABASE_URL="${SUPABASE_URL}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Local Redis settings
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_SSL="${REDIS_SSL:-False}"

# AWS settings
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
AWS_REGION_NAME="${AWS_REGION_NAME}"

# Daytona settings
DAYTONA_API_KEY="${DAYTONA_API_KEY}"
DAYTONA_SERVER_URL="${DAYTONA_SERVER_URL}"
DAYTONA_TARGET="${DAYTONA_TARGET}"

# Model selection
MODEL_TO_USE="${MODEL_TO_USE}"

# Public variables
NEXT_PUBLIC_SUPABASE_URL="${SUPABASE_URL}"
NEXT_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"
NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-http://localhost:8000/api}"
NEXT_PUBLIC_URL="${NEXT_PUBLIC_URL}"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="${NEXT_PUBLIC_GOOGLE_CLIENT_ID}"
EOL

# Wait for Supabase to fully start
echo -e "${YELLOW}Waiting for Supabase to be fully available...${NC}"
# Use a loop to check if Supabase is responding
MAX_RETRIES=15
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl --silent --fail "${SUPABASE_URL}/auth/v1/health" > /dev/null; then
        echo -e "${GREEN}Supabase is up and running!${NC}"
        break
    else
        echo -e "${YELLOW}Waiting for Supabase to start (${RETRY_COUNT}/${MAX_RETRIES})...${NC}"
        sleep 3
        RETRY_COUNT=$((RETRY_COUNT+1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}ERROR: Supabase health check timed out after ${MAX_RETRIES} attempts.${NC}"
    echo -e "${RED}Please verify Supabase is running correctly at ${SUPABASE_URL}${NC}"
    exit 1
fi

# Apply Supabase migrations
echo -e "${YELLOW}Applying Supabase migrations...${NC}"
cd "$PROJECT_ROOT/backend/supabase"
MIGRATION_OUTPUT=$(supabase db reset --debug)
echo "$MIGRATION_OUTPUT"
cd "$SCRIPT_DIR"

# Uncomment test authentication code in auth/page.tsx
echo -e "${YELLOW}Enabling test authentication code...${NC}"
sed -i '' -e 's|\/\*|\/\* Test login enabled: |g' -e 's|\*\/| \*\/|g' "$PROJECT_ROOT/frontend/src/app/auth/page.tsx"

# Create default user in Supabase
echo -e "${YELLOW}Creating default user...${NC}"
curl -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "data": {"name": "Default User"}
  }'
echo -e "\n${YELLOW}Default user created: user@example.com / password123${NC}"

# List all users to verify
echo -e "${YELLOW}Listing users in Supabase...${NC}"
curl -X GET "${SUPABASE_URL}/auth/v1/admin/users" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" | grep -o '"email":"[^"]*"'

# Start Backend
echo -e "${GREEN}Starting Backend...${NC}"
cd "$PROJECT_ROOT/backend"
# Check for Python or Python3 command
if command -v python3 &>/dev/null; then
    python3 -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload &
elif command -v python &>/dev/null; then
    python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload &
else
    echo -e "${RED}Python not found. Cannot start backend.${NC}"
fi
cd "$SCRIPT_DIR"
sleep 2 # Give backend time to start

# Start Frontend
echo -e "${GREEN}Starting Frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
npm run dev &
cd "$SCRIPT_DIR"

# Start Redis
echo -e "${GREEN}Starting Redis...${NC}"
docker run --name agentpress-redis -p 6379:6379 -d redis:latest &
sleep 2 # Give Redis time to start

echo -e "${GREEN}All services are starting!${NC}"
echo -e "${BLUE}Frontend will be available at:${NC} http://localhost:3000"
echo -e "${BLUE}Backend API will be available at:${NC} http://localhost:8000/api"
echo -e "${BLUE}Supabase Studio will be available at:${NC} http://localhost:54323"
echo -e "${BLUE}Supabase credentials:${NC}"
echo -e "  URL: ${SUPABASE_URL}"
echo -e "  Anon Key: ${SUPABASE_ANON_KEY}"
echo -e "${YELLOW}Default login:${NC} user@example.com / password123"
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"

# Check services health and show progress
echo -e "${YELLOW}Monitoring services startup...${NC}"

# Track service status
backend_ready=false
frontend_ready=false
redis_ready=false

# Function to print progress bar
print_progress() {
    local service=$1
    local status=$2
    local emoji=""
    
    if [ "$status" == "true" ]; then
        emoji="✅"
    else
        emoji="⏳"
    fi
    
    printf "%-15s: %s\n" "$service" "$emoji"
}

# Monitor startup
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    clear
    echo -e "${GREEN}AgentPress Services Status:${NC}"
    echo ""
    print_progress "Backend" "$backend_ready"
    print_progress "Frontend" "$frontend_ready"
    print_progress "Redis" "$redis_ready"
    echo ""
    
    # Check backend health
    if ! $backend_ready; then
        if curl --silent --fail "http://localhost:8000/api/health" > /dev/null 2>&1; then
            backend_ready=true
            echo -e "${GREEN}✅ Backend is now available!${NC}"
        elif [ $attempt -gt 10 ]; then
            # After 10 attempts, try to diagnose the issue
            echo -e "${YELLOW}Checking backend startup logs...${NC}"
            if ps aux | grep -q "[p]ython.*uvicorn.*api:app"; then
                echo -e "${YELLOW}Backend process is running but not responding to health checks.${NC}"
                echo -e "${YELLOW}Possible issues:${NC}"
                echo -e "  - API endpoints may not match expected routes"
                echo -e "  - Backend might be having startup errors"
                echo -e "  - Try checking backend logs for details"
            else
                echo -e "${RED}Backend process is not running!${NC}"
                echo -e "${YELLOW}Attempting to restart backend...${NC}"
                cd "$PROJECT_ROOT/backend"
                if command -v python3 &>/dev/null; then
                    python3 -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload &
                elif command -v python &>/dev/null; then
                    python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload &
                fi
                cd "$SCRIPT_DIR"
            fi
        fi
    fi
    
    # Check frontend health
    if ! $frontend_ready; then
        if curl --silent --fail "http://localhost:3000" > /dev/null 2>&1; then
            frontend_ready=true
            echo -e "${GREEN}✅ Frontend is now available!${NC}"
        fi
    fi
    
    # Check Redis connection
    if ! $redis_ready; then
        if docker ps | grep -q "agentpress-redis"; then
            redis_ready=true
            echo -e "${GREEN}✅ Redis is now available!${NC}"
        fi
    fi
    
    # Check if all services are ready
    if $backend_ready && $frontend_ready && $redis_ready; then
        echo ""
        echo -e "${GREEN}🚀 All services are up and running!${NC}"
        echo -e "${BLUE}Frontend:${NC} http://localhost:3000"
        echo -e "${BLUE}Backend API:${NC} http://localhost:8000/api"
        echo -e "${BLUE}Supabase Studio:${NC} http://localhost:54323"
        echo -e "${YELLOW}Default login:${NC} user@example.com / password123"
        break
    fi
    
    # Wait before next check
    sleep 2
    attempt=$((attempt+1))
    
    if [ $attempt -eq $max_attempts ]; then
        echo ""
        echo -e "${YELLOW}⚠️  Timeout waiting for all services to start.${NC}"
        echo -e "${YELLOW}Some services are still initializing and may be available shortly.${NC}"
    fi
done

echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"

# Wait for all background processes
wait 