from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, HTTPException, Response, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from core.services import redis
import sentry
from contextlib import asynccontextmanager
from core.agentpress.thread_manager import ThreadManager
from core.services.supabase import DBConnection
from datetime import datetime, timezone
from core.utils.config import config, EnvMode
import asyncio
from core.utils.logger import logger, structlog
import time
from collections import OrderedDict

from pydantic import BaseModel
import uuid

from core import api as core_api

from core.sandbox import api as sandbox_api
from core.billing.api import router as billing_router
from core.billing.admin import router as billing_admin_router
from core.services import enterprise_billing_api

from core.admin import users_admin
from core.services import transcription as transcription_api
import sys
from core.services import email_api
from core.services import memory_api
from core.triggers import api as triggers_api
from core.services import api_keys_api
from core.services import enterprise_billing_api
from core.linear import api as linear_api
from core.pipedream import api as pipedream_api
from core.credentials import api as credentials_api
from core.templates import api as template_api
from core.composio_integration import api as composio_api


if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

db = DBConnection()
instance_id = "single"

# Rate limiter state
ip_tracker = OrderedDict()
MAX_CONCURRENT_IPS = 25

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.debug(f"Starting up FastAPI application with instance ID: {instance_id} in {config.ENV_MODE.value} mode")
    try:
        await db.initialize()
        
        core_api.initialize(
            db,
            instance_id
        )
        
        
        sandbox_api.initialize(db)
        
        # Initialize Redis connection
        from core.services import redis
        try:
            await redis.initialize_async()
            logger.debug("Redis connection initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Redis connection: {e}")
            # Continue without Redis - the application will handle Redis failures gracefully
        
        # Start background tasks
        # asyncio.create_task(core_api.restore_running_agent_runs())
        
        triggers_api.initialize(db)
        pipedream_api.initialize(db)
        credentials_api.initialize(db)
        template_api.initialize(db)
        composio_api.initialize(db)
        linear_api.initialize(db)
        
        yield
        
        logger.debug("Cleaning up agent resources")
        await core_api.cleanup()
        
        try:
            logger.debug("Closing Redis connection")
            await redis.close()
            logger.debug("Redis connection closed successfully")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")

        logger.debug("Disconnecting from database")
        await db.disconnect()
    except Exception as e:
        logger.error(f"Error during application startup: {e}")
        raise

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    structlog.contextvars.clear_contextvars()

    request_id = str(uuid.uuid4())
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"
    method = request.method
    path = request.url.path
    query_params = str(request.query_params)

    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        client_ip=client_ip,
        method=method,
        path=path,
        query_params=query_params
    )

    # Log the incoming request
    logger.debug(f"Request started: {method} {path} from {client_ip} | Query: {query_params}")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.debug(f"Request completed: {method} {path} | Status: {response.status_code} | Time: {process_time:.2f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"Request failed: {method} {path} | Error: {str(e)} | Time: {process_time:.2f}s")
        raise

# Define allowed origins based on environment
allowed_origins = ["https://www.suna.so", "https://suna.so", "https://operator.becomeomni.net", "https://coldchain.becomeomni.ai", "https://sundar-dev.operator.becomeomni.net","https://varnica.operator.becomeomni.net","https://mssc.becomeomni.net", "https://mssc.becomeomni.ai","https://coppermoon.becomeomni.ai","https://huston.becomeomni.ai","https://huston.staging.becomeomni.net","https://huston.staging.becomeomni.net/auth", "https://becomeomni.com", "https://bih.becomeomni.net"]
allow_origin_regex = None

# Add staging-specific origins
if config.ENV_MODE == EnvMode.LOCAL:
    allowed_origins.append("http://localhost:3000")

# Add staging-specific origins
if config.ENV_MODE == EnvMode.STAGING:
    allowed_origins.append("https://staging.suna.so")
    allowed_origins.append("https://huston.staging.becomeomni.net")
    allowed_origins.append("https://huston.staging.becomeomni.net/auth")
    allow_origin_regex = r"https://suna-.*-prjcts\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Project-Id", "X-MCP-URL", "X-MCP-Type", "X-MCP-Headers", "X-Refresh-Token", "X-API-Key"],
)

# Create a main API router
api_router = APIRouter()

# Include all API routers without individual prefixes
api_router.include_router(core_api.router)
api_router.include_router(sandbox_api.router)

# Use enterprise billing API when ENTERPRISE_MODE is enabled, otherwise use Stripe billing
if config.ENTERPRISE_MODE:
    api_router.include_router(enterprise_billing_api.router)
    logger.info("Enterprise billing API enabled")
else:
    api_router.include_router(billing_router)
    logger.info("Stripe billing API enabled")
    
api_router.include_router(api_keys_api.router)
api_router.include_router(billing_admin_router)
api_router.include_router(users_admin.router)

from core.mcp_module import api as mcp_api

api_router.include_router(mcp_api.router)
api_router.include_router(credentials_api.router, prefix="/secure-mcp")
api_router.include_router(template_api.router, prefix="/templates")

api_router.include_router(transcription_api.router)
api_router.include_router(email_api.router)
api_router.include_router(memory_api.router)

from core.knowledge_base import api as knowledge_base_api
api_router.include_router(knowledge_base_api.router)

# Include the main knowledge base API (contains upload endpoints)
from knowledge_base import api as main_knowledge_base_api
api_router.include_router(main_knowledge_base_api.router)

api_router.include_router(triggers_api.router)

api_router.include_router(pipedream_api.router)

from core.admin import api as admin_api
api_router.include_router(admin_api.router)

# Enterprise admin API - always load but endpoints check ENTERPRISE_MODE internally
from core.services import enterprise_admin_api
api_router.include_router(enterprise_admin_api.router)

api_router.include_router(composio_api.router)

from core.google.google_slides_api import router as google_slides_router
api_router.include_router(google_slides_router)

api_router.include_router(linear_api.router)

@api_router.post("/tools/apollo/webhook/{webhook_secret}")
async def apollo_webhook_handler(webhook_secret: str, request: Request):
    """
    Webhook endpoint for receiving Apollo.io phone number reveals.
    This is called by Apollo when phone numbers are ready.
    """
    try:
        # Get request body
        body = await request.json()
        logger.info(f"Apollo webhook received for secret: {webhook_secret[:8]}...")
        
        # Verify webhook secret exists in database
        client = await db.client
        webhook_result = await client.table("apollo_webhook_requests").select("*").eq(
            "webhook_secret", webhook_secret
        ).eq("status", "pending").execute()
        
        if not webhook_result.data:
            logger.warning(f"Apollo webhook received for unknown or already processed secret: {webhook_secret[:8]}...")
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Webhook request not found or already processed"}
            )
        
        webhook_record = webhook_result.data[0]
        thread_id = webhook_record["thread_id"]
        
        # Extract phone numbers from Apollo response
        person_data = body.get("person", {})
        phone_numbers = []
        
        # Get phone numbers from contact if available
        contact = person_data.get("contact", {})
        if contact and contact.get("phone_numbers"):
            phone_numbers = contact["phone_numbers"]
        
        # Update database record
        update_data = {
            "status": "completed",
            "phone_numbers": phone_numbers,
            "person_data": person_data
        }
        
        await client.table("apollo_webhook_requests").update(update_data).eq(
            "webhook_secret", webhook_secret
        ).execute()
        
        logger.info(f"Apollo webhook processed successfully for thread: {thread_id}")
        
        # Create a message in the thread with the phone numbers
        if phone_numbers and thread_id:
            try:
                # Format phone numbers message
                person_name = f"{person_data.get('first_name', '')} {person_data.get('last_name', '')}".strip()
                company = person_data.get('organization', {}).get('name', 'Unknown Company')
                
                phone_list = "\n".join([
                    f"- {phone.get('raw_number', phone.get('sanitized_number', 'N/A'))} ({phone.get('type', 'Unknown type')})"
                    for phone in phone_numbers
                ])
                
                message_content = f"""📞 **Phone Numbers Revealed for {person_name}** ({company})

{phone_list}

Status: {phone_numbers[0].get('status', 'N/A') if phone_numbers else 'N/A'}
"""
                
                # Create assistant message in thread
                message_data = {
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": message_content,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await client.table("messages").insert(message_data).execute()
                logger.info(f"Phone number message created in thread: {thread_id}")
                
            except Exception as msg_error:
                logger.error(f"Error creating message for phone reveal: {msg_error}")
                # Don't fail the webhook if message creation fails
        
        return JSONResponse(content={
            "success": True,
            "message": "Phone numbers processed successfully",
            "phone_count": len(phone_numbers)
        })
        
    except Exception as e:
        logger.error(f"Error processing Apollo webhook: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "Internal server error"}
        )

@api_router.get("/health")
async def health_check():
    logger.debug("Health check endpoint called")
    return {
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": instance_id
    }

@api_router.get("/debug/routes")
async def debug_routes():
    """Debug endpoint to show all registered routes and configuration."""
    routes_info = []
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            routes_info.append({
                "path": route.path,
                "methods": list(route.methods) if route.methods else [],
                "name": route.name if hasattr(route, 'name') else None
            })
    
    return {
        "status": "ok",
        "enterprise_mode": config.ENTERPRISE_MODE,
        "env_mode": config.ENV_MODE.value,
        "total_routes": len(routes_info),
        "billing_routes": [r for r in routes_info if '/billing' in r['path']],
        "admin_routes": [r for r in routes_info if '/admin' in r['path']],
        "enterprise_routes": [r for r in routes_info if '/enterprise' in r['path']],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/health-docker")
async def health_check():
    logger.debug("Health docker check endpoint called")
    try:
        client = await redis.get_client()
        await client.ping()
        db = DBConnection()
        await db.initialize()
        db_client = await db.client
        await db_client.table("threads").select("thread_id").limit(1).execute()
        logger.debug("Health docker check complete")
        return {
            "status": "ok", 
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "instance_id": instance_id
        }
    except Exception as e:
        logger.error(f"Failed health docker check: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")


app.include_router(api_router, prefix="/api")

# IMPORTANT: Don't include billing_router here if ENTERPRISE_MODE is enabled
# The enterprise billing API is already included in api_router above
if not config.ENTERPRISE_MODE:
    logger.info("Including Stripe billing router at root level")
    app.include_router(billing_router)
else:
    logger.info("Skipping root-level billing router (ENTERPRISE_MODE enabled)")

app.include_router(transcription_api.router)


if __name__ == "__main__":
    import uvicorn
    
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    workers = 4
    
    logger.debug(f"Starting server on 0.0.0.0:8000 with {workers} workers")
    uvicorn.run(
        "api:app", 
        host="0.0.0.0", 
        port=8000,
        workers=workers,
        loop="asyncio"
    )
