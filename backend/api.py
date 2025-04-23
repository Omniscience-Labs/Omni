from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from agentpress.thread_manager import ThreadManager
from services.supabase import DBConnection
from datetime import datetime, timezone
from dotenv import load_dotenv
import asyncio
from utils.logger import logger
import uuid
import time
from collections import OrderedDict

# Import the agent API module
from agent import api as agent_api
from sandbox import api as sandbox_api

# Load environment variables
load_dotenv()

# Initialize managers
db = DBConnection()
thread_manager = None
instance_id = str(uuid.uuid4())[:8]  # Generate instance ID at module load time

# Rate limiter state
ip_tracker = OrderedDict()
MAX_CONCURRENT_IPS = 25

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global thread_manager
    logger.info(f"Starting up FastAPI application with instance ID: {instance_id}")
    await db.initialize()
    thread_manager = ThreadManager()
    
    # Initialize the agent API with shared resources
    agent_api.initialize(
        thread_manager,
        db,
        instance_id  # Pass the instance_id to agent_api
    )
    
    # Initialize the sandbox API with shared resources
    sandbox_api.initialize(db)
    
    # Initialize Redis before restoring agent runs
    from services import redis
    await redis.initialize_async()
    
    asyncio.create_task(agent_api.restore_running_agent_runs())
    
    yield
    
    # Clean up agent resources (including Redis)
    logger.info("Cleaning up agent resources")
    await agent_api.cleanup()
    
    # Clean up database connection
    logger.info("Disconnecting from database")
    await db.disconnect()

app = FastAPI(lifespan=lifespan)

# @app.middleware("http")
# async def log_requests_middleware(request: Request, call_next):
#     client_ip = request.client.host
#     logger.info(f"Request from IP {client_ip} to {request.method} {request.url.path}")
#     response = await call_next(request)
#     return response

# @app.middleware("http")
# async def throw_error_middleware(request: Request, call_next):
#     client_ip = request.client.host
#     if client_ip != "109.49.168.102":
#         logger.warning(f"Request blocked from IP {client_ip} to {request.method} {request.url.path}")
#         return JSONResponse(
#             status_code=403,
#             content={"error": "Request blocked", "message": "Test DDoS protection"}
#         )
#     return await call_next(request)

# @app.middleware("http")
# async def rate_limit_middleware(request: Request, call_next):
#     global ip_tracker
#     client_ip = request.client.host
    
#     # Clean up old entries (older than 5 minutes)
#     current_time = time.time()
#     ip_tracker = OrderedDict((ip, ts) for ip, ts in ip_tracker.items() 
#                            if current_time - ts < 300)
    
#     # Check if IP is already tracked
#     if client_ip in ip_tracker:
#         ip_tracker[client_ip] = current_time
#         return await call_next(request)
    
#     # Check if we've hit the limit
#     if len(ip_tracker) >= MAX_CONCURRENT_IPS:
#         logger.warning(f"Rate limit exceeded. Current IPs: {len(ip_tracker)}")
#         return JSONResponse(
#             status_code=429,
#             content={"error": "Too many concurrent connections", 
#                     "message": "Maximum number of concurrent connections reached"}
#         )
    
#     # Add new IP
#     ip_tracker[client_ip] = current_time
#     logger.info(f"New connection from IP {client_ip}. Total connections: {len(ip_tracker)}")
#     return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://www.suna.so", "https://suna.so", "https://staging.suna.so"], #http://localhost:3000
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include the agent router with a prefix
app.include_router(agent_api.router, prefix="/api")

# Include the sandbox router with a prefix
app.include_router(sandbox_api.router, prefix="/api")

@app.get("/api/health-check")
async def health_check():
    """Health check endpoint to verify API is working."""
    logger.info("Health check endpoint called")
    return {
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": instance_id
    }

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting server on 0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000) 