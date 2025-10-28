
**1. Launching the backend**

```
cd /backend
```

1.1 Launching REDIS for data caching


```bash
docker compose up redis
```


1.2 Running Dramatiq worker for thread execution


```bash
uv run dramatiq --processes 4 --threads 4 run_agent_background
```

1.3 Running the main server


The setup wizard automatically creates a `.env` file with all necessary configuration. If you need to configure manually or understand the setup:

#### Required Environment Variables

```sh
# Environment Mode
ENV_MODE=local

# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Infrastructure
REDIS_HOST=redis  # Use 'localhost' when running API locally
REDIS_PORT=6379
# LLM Providers (at least one required)
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
OPENROUTER_API_KEY=your-openrouter-key
GEMINI_API_KEY=your-gemini-api-key

# Search and Web Scraping
TAVILY_API_KEY=your-tavily-key
FIRECRAWL_API_KEY=your-firecrawl-key
FIRECRAWL_URL=https://api.firecrawl.dev

# Agent Execution
DAYTONA_API_KEY=your-daytona-key
DAYTONA_SERVER_URL=https://app.daytona.io/api
DAYTONA_TARGET=us

WEBHOOK_BASE_URL=https://yourdomain.com

# MCP Configuration
MCP_CREDENTIAL_ENCRYPTION_KEY=your-generated-encryption-key

# Optional APIs
RAPID_API_KEY=your-rapidapi-key
APOLLO_API_KEY=your-apollo-api-key  # For Apollo.io lead generation (direct API)

NEXT_PUBLIC_URL=http://localhost:3000

```bash
uv run api.py

```

**2. Launching the frontend**

```bash

cd frontend && npm install

npm run dev
```


Access the main app via `http://localhost:3000`