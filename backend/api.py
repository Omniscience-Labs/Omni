from fastapi import FastAPI, Request, HTTPException, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import sentry
from contextlib import asynccontextmanager
from agentpress.thread_manager import ThreadManager
from services.supabase import DBConnection
from datetime import datetime, timezone
from dotenv import load_dotenv
from utils.config import config, EnvMode
import asyncio
from utils.logger import logger
import time
from collections import OrderedDict

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp import StdioServerParameters
from pydantic import BaseModel
# Import the agent API module
from agent import api as agent_api
from sandbox import api as sandbox_api
from services import billing as billing_api
from services import transcription as transcription_api
import concurrent.futures
from typing import Dict, Any
import sys
from concurrent.futures import ThreadPoolExecutor

import os
import subprocess
import json

load_dotenv()

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Thread pool for Windows subprocess handling
windows_executor = ThreadPoolExecutor(max_workers=4)

# Initialize managers
db = DBConnection()
instance_id = "single"

# Rate limiter state
ip_tracker = OrderedDict()
MAX_CONCURRENT_IPS = 25

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting up FastAPI application with instance ID: {instance_id} in {config.ENV_MODE.value} mode")
    try:
        await db.initialize()
        
        agent_api.initialize(
            db,
            instance_id
        )
        
        sandbox_api.initialize(db)
        
        # Initialize Redis connection
        from services import redis
        try:
            await redis.initialize_async()
            logger.info("Redis connection initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Redis connection: {e}")
            # Continue without Redis - the application will handle Redis failures gracefully
        
        # Start background tasks
        # asyncio.create_task(agent_api.restore_running_agent_runs())
        
        yield
        
        # Clean up agent resources
        logger.info("Cleaning up agent resources")
        await agent_api.cleanup()
        
        # Clean up Redis connection
        try:
            logger.info("Closing Redis connection")
            await redis.close()
            logger.info("Redis connection closed successfully")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")
        
        # Clean up database connection
        logger.info("Disconnecting from database")
        await db.disconnect()
    except Exception as e:
        logger.error(f"Error during application startup: {e}")
        raise

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    start_time = time.time()
    client_ip = request.client.host
    method = request.method
    url = str(request.url)
    path = request.url.path
    query_params = str(request.query_params)
    
    # Log the incoming request
    logger.info(f"Request started: {method} {path} from {client_ip} | Query: {query_params}")
    
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
allowed_origins = ["https://www.suna.so", "https://suna.so", "http://localhost:3000"]
allow_origin_regex = None

# Add staging-specific origins
if config.ENV_MODE == EnvMode.STAGING:
    allowed_origins.append("https://staging.suna.so")
    allow_origin_regex = r"https://suna-.*-prjcts\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include the agent router with a prefix
app.include_router(agent_api.router, prefix="/api")

# Include the sandbox router with a prefix
app.include_router(sandbox_api.router, prefix="/api")

# Include the billing router with a prefix
app.include_router(billing_api.router, prefix="/api")

# Import and include the MCP router
from mcp_local import api as mcp_api
app.include_router(mcp_api.router, prefix="/api")
# Include the transcription router with a prefix
app.include_router(transcription_api.router, prefix="/api")

@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify API is working."""
    logger.info("Health check endpoint called")
    return {
        "status": "ok", 
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": instance_id
    }

class CustomMCPDiscoverRequest(BaseModel):
    type: str  # 'json' or 'sse'
    config: Dict[str, Any]


def run_mcp_stdio_sync(command, args, env_vars, timeout=30):
    """Synchronous function to run MCP stdio connection on Windows"""
    
    try:
        # Prepare environment
        env = os.environ.copy()
        env.update(env_vars)
        
        # Create subprocess with proper Windows handling
        full_command = [command] + args
        
        process = subprocess.Popen(
            full_command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            bufsize=0,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        )
        
        # MCP Initialization
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "mcp-client", "version": "1.0.0"}
            }
        }
        
        # Send initialization
        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()
        
        # Read initialization response
        init_response_line = process.stdout.readline().strip()
        if not init_response_line:
            raise Exception("No response from MCP server during initialization")
        
        init_response = json.loads(init_response_line)
        
        # Send notification that initialization is complete
        init_notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        process.stdin.write(json.dumps(init_notification) + "\n")
        process.stdin.flush()
        
        # Request tools list
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        process.stdin.write(json.dumps(tools_request) + "\n")
        process.stdin.flush()
        
        # Read tools response
        tools_response_line = process.stdout.readline().strip()
        if not tools_response_line:
            raise Exception("No response from MCP server for tools list")
        
        tools_response = json.loads(tools_response_line)
        
        # Parse tools
        tools_info = []
        if "result" in tools_response and "tools" in tools_response["result"]:
            for tool in tools_response["result"]["tools"]:
                tool_info = {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "input_schema": tool.get("inputSchema", {})
                }
                tools_info.append(tool_info)
        
        return {
            "status": "connected",
            "transport": "stdio",
            "tools": tools_info
        }
        
    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "error": f"Process timeout after {timeout} seconds",
            "tools": []
        }
    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "error": f"Invalid JSON response: {str(e)}",
            "tools": []
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "tools": []
        }
    finally:
        try:
            if 'process' in locals():
                process.terminate()
                process.wait(timeout=5)
        except:
            pass

async def connect_stdio_server_windows(server_name, server_config, all_tools, timeout):
    """Windows-compatible stdio connection using subprocess"""
    
    logger.info(f"Connecting to {server_name} using Windows subprocess method")
    
    command = server_config["command"]
    args = server_config.get("args", [])
    env_vars = server_config.get("env", {})
    
    # Run in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        windows_executor,
        run_mcp_stdio_sync,
        command,
        args,
        env_vars,
        timeout
    )
    
    all_tools[server_name] = result
    
    if result["status"] == "connected":
        logger.info(f"  {server_name}: Connected via Windows subprocess ({len(result['tools'])} tools)")
    else:
        logger.error(f"  {server_name}: Error - {result['error']}")

async def list_mcp_tools_mixed_windows(config, timeout=15):
    """Windows-compatible version of list_mcp_tools_mixed"""
    all_tools = {}
    
    if "mcpServers" not in config:
        return all_tools
    
    mcp_servers = config["mcpServers"]
    
    for server_name, server_config in mcp_servers.items():
        logger.info(f"Connecting to MCP server: {server_name}")
        if server_config.get("disabled", False):
            all_tools[server_name] = {"status": "disabled", "tools": []}
            logger.info(f"  {server_name}: Disabled")
            continue
            
        try:
            await connect_stdio_server_windows(server_name, server_config, all_tools, timeout)
                    
        except asyncio.TimeoutError:
            all_tools[server_name] = {
                "status": "error",
                "error": f"Connection timeout after {timeout} seconds",
                "tools": []
            }
            logger.error(f"  {server_name}: Timeout after {timeout} seconds")
        except Exception as e:
            error_msg = str(e)
            all_tools[server_name] = {
                "status": "error",
                "error": error_msg,
                "tools": []
            }
            logger.error(f"  {server_name}: Error - {error_msg}")
            import traceback
            logger.debug(f"Full traceback for {server_name}: {traceback.format_exc()}")
    
    return all_tools

# Modified API endpoint
@app.post("/api/mcp/discover-custom-tools")
async def discover_custom_mcp_tools(request: CustomMCPDiscoverRequest):
    """Discover tools from a custom MCP server configuration - Windows compatible."""
    try:
        logger.info(f"Received custom MCP discovery request: type={request.type}")
        logger.debug(f"Request config: {request.config}")
        
        tools = []
        server_name = None
        
        if request.type == 'json':
            try:
                # Use Windows-compatible version
                all_tools = await list_mcp_tools_mixed_windows(request.config, timeout=30)
                
                # Extract the first server name from the config
                if "mcpServers" in request.config and request.config["mcpServers"]:
                    server_name = list(request.config["mcpServers"].keys())[0]
                    
                    # Check if the server exists in the results and has tools
                    if server_name in all_tools:
                        server_info = all_tools[server_name]
                        if server_info["status"] == "connected":
                            tools = server_info["tools"]
                            logger.info(f"Found {len(tools)} tools for server {server_name}")
                        else:
                            # Server had an error or was disabled
                            error_msg = server_info.get("error", "Unknown error")
                            logger.error(f"Server {server_name} failed: {error_msg}")
                            raise HTTPException(
                                status_code=400, 
                                detail=f"Failed to connect to MCP server '{server_name}': {error_msg}"
                            )
                    else:
                        logger.error(f"Server {server_name} not found in results")
                        raise HTTPException(status_code=400, detail=f"Server '{server_name}' not found in results")
                else:
                    logger.error("No MCP servers configured")
                    raise HTTPException(status_code=400, detail="No MCP servers configured")
                    
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error connecting to stdio MCP server: {e}")
                import traceback
                logger.error(f"Full traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=400, detail=f"Failed to connect to MCP server: {str(e)}")
                
        elif request.type == 'sse':
            # SSE handling remains the same as it doesn't use subprocess
            if 'url' not in request.config:
                raise HTTPException(status_code=400, detail="SSE configuration must include 'url' field")
            
            url = request.config['url']
            headers = request.config.get('headers', {})
            
            try:
                async with asyncio.timeout(15):
                    try:
                        async with sse_client(url, headers=headers) as (read, write):
                            async with ClientSession(read, write) as session:
                                await session.initialize()
                                tools_result = await session.list_tools()
                                tools_info = []
                                for tool in tools_result.tools:
                                    tool_info = {
                                        "name": tool.name,
                                        "description": tool.description,
                                        "input_schema": tool.inputSchema
                                    }
                                    tools_info.append(tool_info)
                                
                                for tool_info in tools_info:
                                    tools.append({
                                        "name": tool_info["name"],
                                        "description": tool_info["description"],
                                        "inputSchema": tool_info["input_schema"]
                                    })
                    except TypeError as e:
                        if "unexpected keyword argument" in str(e):
                            async with sse_client(url) as (read, write):
                                async with ClientSession(read, write) as session:
                                    await session.initialize()
                                    tools_result = await session.list_tools()
                                    tools_info = []
                                    for tool in tools_result.tools:
                                        tool_info = {
                                            "name": tool.name,
                                            "description": tool.description,
                                            "input_schema": tool.inputSchema
                                        }
                                        tools_info.append(tool_info)
                                    
                                    for tool_info in tools_info:
                                        tools.append({
                                            "name": tool_info["name"],
                                            "description": tool_info["description"],
                                            "inputSchema": tool_info["input_schema"]
                                        })
                        else:
                            raise
            except asyncio.TimeoutError:
                raise HTTPException(status_code=408, detail="Connection timeout - server took too long to respond")
            except Exception as e:
                logger.error(f"Error connecting to SSE MCP server: {e}")
                raise HTTPException(status_code=400, detail=f"Failed to connect to MCP server: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Invalid server type. Must be 'json' or 'sse'")
        
        response_data = {"tools": tools, "count": len(tools)}
        
        if server_name:
            response_data["serverName"] = server_name
        
        logger.info(f"Returning {len(tools)} tools for server {server_name}")
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error discovering custom MCP tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Make sure to set the Windows event loop policy at app startup
if __name__ == "__main__":
    import uvicorn
    
    # Set Windows event loop policy
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    workers = 1  # Keep single worker for Windows compatibility
    
    logger.info(f"Starting server on 0.0.0.0:8000 with {workers} workers")
    uvicorn.run(
        "api:app", 
        host="0.0.0.0", 
        port=8000,
        workers=workers,
        loop="asyncio"  # Explicitly use asyncio event loop
    )