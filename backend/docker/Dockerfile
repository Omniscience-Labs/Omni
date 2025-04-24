FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn uvicorn

# Copy the backend code
COPY . .

# Set environment variable
ENV PYTHONPATH=/app

# Environment mode (local, staging, production)
ENV ENV_MODE="production"

# Default environment variables
ENV DAYTONA_API_KEY=""
ENV DAYTONA_SERVER_URL=""
ENV DAYTONA_TARGET=""
ENV ANTHROPIC_API_KEY=""
ENV OPENAI_API_KEY=""
ENV MODEL_TO_USE=""
ENV TAVILY_API_KEY=""
ENV RAPID_API_KEY=""
ENV CLOUDFLARE_API_TOKEN=""


ENV SUPABASE_URL=""
ENV SUPABASE_ANON_KEY=""
ENV SUPABASE_SERVICE_ROLE_KEY=""

ENV REDIS_HOST=""
ENV REDIS_PORT=""
ENV REDIS_PASSWORD=""
ENV REDIS_SSL=""

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application with Uvicorn directly
CMD ["gunicorn", "api:app", "--workers", "24", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "600", "--graceful-timeout", "300", "--keep-alive", "250", "--max-requests", "1000", "--max-requests-jitter", "50", "--log-level", "info", "--forwarded-allow-ips", "*", "--worker-connections", "1000", "--worker-tmp-dir", "/dev/shm", "--preload"]