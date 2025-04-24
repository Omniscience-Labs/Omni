#!/bin/bash

# Create necessary directories
mkdir -p docker

# Fix any spacing issues in the JWT tokens using macOS compatible sed
if [ -f ".env" ]; then
    sed -i '' 's/ey AgC/eyAgC/g' .env
fi

if [ -f "docker-compose.yml" ]; then
    sed -i '' 's/ey AgC/eyAgC/g' docker-compose.yml
fi

# Create a symbolic link for .env.local in frontend
if [ -f ".env" ]; then
    cp .env frontend/.env.local
fi

# Create a symbolic link for Kong configuration if it doesn't exist
if [ ! -f "./backend/supabase/kong.yml" ]; then
  echo "Creating Kong configuration file"
  mkdir -p ./backend/supabase
  cat > ./backend/supabase/kong.yml << EOL
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
if [ -f "./backend/supabase/kong.yml" ]; then
  sed -i '' 's/ey AgC/eyAgC/g' ./backend/supabase/kong.yml
fi

echo "Initialization complete. Run 'docker compose up -d' to start the application." 