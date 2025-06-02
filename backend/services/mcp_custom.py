import os
import sys
import json
import asyncio
import subprocess
from typing import Dict, Any
from concurrent.futures import ThreadPoolExecutor
from fastapi import HTTPException # type: ignore
from utils.logger import logger
from mcp import ClientSession
from mcp.client.sse import sse_client # type: ignore

windows_executor = ThreadPoolExecutor(max_workers=4)

def run_mcp_stdio_sync(command, args, env_vars, timeout=30):
    try:
        env = os.environ.copy()
        env.update(env_vars)
        
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
        
        process.stdin.write(json.dumps(init_request) + "\n")
        process.stdin.flush()

        init_response_line = process.stdout.readline().strip()
        if not init_response_line:
            raise Exception("No response from MCP server during initialization")
        
        init_response = json.loads(init_response_line)
        
        init_notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        process.stdin.write(json.dumps(init_notification) + "\n")
        process.stdin.flush()
        
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        
        process.stdin.write(json.dumps(tools_request) + "\n")
        process.stdin.flush()
        
        tools_response_line = process.stdout.readline().strip()
        if not tools_response_line:
            raise Exception("No response from MCP server for tools list")
        
        tools_response = json.loads(tools_response_line)
        
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


async def discover_custom_tools(request_type: str, config: Dict[str, Any]):
    logger.info(f"Received custom MCP discovery request: type={request_type}")
    logger.debug(f"Request config: {config}")
    
    tools = []
    server_name = None
    
    if request_type == 'json':
        try:
            all_tools = await list_mcp_tools_mixed_windows(config, timeout=30)
            if "mcpServers" in config and config["mcpServers"]:
                server_name = list(config["mcpServers"].keys())[0]

                if server_name in all_tools:
                    server_info = all_tools[server_name]
                    if server_info["status"] == "connected":
                        tools = server_info["tools"]
                        logger.info(f"Found {len(tools)} tools for server {server_name}")
                    else:
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
            
    elif request_type == 'sse':
        if 'url' not in config:
            raise HTTPException(status_code=400, detail="SSE configuration must include 'url' field")
        
        url = config['url']
        headers = config.get('headers', {})
        
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