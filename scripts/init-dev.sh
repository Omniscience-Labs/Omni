#!/bin/bash

# Determine the script and project directories
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"
if [[ "$SCRIPT_DIR" == */scripts ]]; then
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
fi

# Create necessary directories
mkdir -p "$PROJECT_ROOT/docker"

# Fix any spacing issues in the JWT tokens using macOS compatible sed
if [ -f "$PROJECT_ROOT/.env" ]; then
    sed -i '' 's/ey AgC/eyAgC/g' "$PROJECT_ROOT/.env"
fi

if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    sed -i '' 's/ey AgC/eyAgC/g' "$PROJECT_ROOT/docker-compose.yml"
fi

# Create a symbolic link for .env.local in frontend
if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/frontend/.env.local"
fi

# Create a symbolic link for Kong configuration if it doesn't exist
if [ ! -f "$PROJECT_ROOT/backend/supabase/kong.yml" ]; then
  echo "Creating Kong configuration file"
  mkdir -p "$PROJECT_ROOT/backend/supabase"
  cat > "$PROJECT_ROOT/backend/supabase/kong.yml" << EOL
_format_version: "2.1"

_transform: true

services:
  - name: postgrest
    url: http://supabase-db:5432
    routes:
      - name: postgrest-route
        paths:
          - /rest/v1
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true
  
  - name: auth
    url: http://supabase-db:5432
    routes:
      - name: auth-route
        paths:
          - /auth/v1
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true

  - name: storage
    url: http://supabase-db:5432
    routes:
      - name: storage-route
        paths:
          - /storage/v1
    plugins:
      - name: cors
      - name: key-auth
        config:
          hide_credentials: true

EOL
fi

# Fix any spacing issues in the Kong configuration
if [ -f "$PROJECT_ROOT/backend/supabase/kong.yml" ]; then
  sed -i '' 's/ey AgC/eyAgC/g' "$PROJECT_ROOT/backend/supabase/kong.yml"
fi

echo "Initialization complete. Run 'docker compose up -d' to start the application." 