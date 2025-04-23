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

# Default environment variables
# These should be overridden at runtime with actual values
ENV DAYTONA_API_KEY=""
ENV DAYTONA_SERVER_URL=""
ENV DAYTONA_TARGET=""
ENV ANTHROPIC_API_KEY=""
ENV OPENAI_API_KEY=""
ENV MODEL_TO_USE=""

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
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "32", "--log-level", "info", "--timeout-keep-alive", "500", "--proxy-headers", "--forwarded-allow-ips", "*"]