FROM ubuntu:24.04

ENV ENV_MODE production
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY --chown=appuser:appuser pyproject.toml uv.lock ./
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV UV_LINK_MODE=copy
ENV UV_PYTHON_PREFERENCE=system
# RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --compile-bytecode --no-editable
RUN uv venv --system-site-packages
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --quiet
ENV PATH="/app/.venv/bin:$PATH"

# Copy application code
COPY . .
RUN uv run python --version

# Calculate optimal worker count based on 16 vCPUs
# Using (2*CPU)+1 formula for CPU-bound applications
ENV WORKERS=1
ENV THREADS=1
ENV WORKER_CONNECTIONS=2000

EXPOSE 8000

# Gunicorn configuration
CMD ["sh", "-c", "uv run gunicorn api:app \
  --workers $WORKERS \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 1800 \
  --graceful-timeout 600 \
  --keep-alive 1800 \
  --max-requests 0 \
  --max-requests-jitter 0 \
  --forwarded-allow-ips '*' \
  --worker-connections $WORKER_CONNECTIONS \
  --worker-tmp-dir /dev/shm \
  --preload \
  --log-level info \
  --access-logfile - \
  --error-logfile - \
  --capture-output \
  --enable-stdio-inheritance \
  --threads $THREADS"]
