import asyncio
import warnings
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp import StdioServerParameters
import aiohttp
import json

warnings.filterwarnings("ignore", category=ResourceWarning)


async def list_mcp_tools_mixed(config, timeout=15):
    all_tools = {}
    
    if "mcpServers" not in config:
        return all_tools
    
    mcp_servers = config["mcpServers"]
    
    for server_name, server_config in mcp_servers.items():
        print(f"Connecting to {server_name}...")
        if server_config.get("disabled", False):
            all_tools[server_name] = {"status": "disabled", "tools": []}
            print(f"  {server_name}: Disabled")
            continue
            
        try:
            if "url" in server_config:
                url = server_config["url"]
                if "/sse" in url or server_config.get("transport") == "sse":
                    await connect_sse_server(server_name, server_config, all_tools, timeout)
            else:
                await connect_stdio_server(server_name, server_config, all_tools, timeout)
                    
        except asyncio.TimeoutError:
            all_tools[server_name] = {
                "status": "error",
                "error": f"Connection timeout after {timeout} seconds",
                "tools": []
            }
            print(f"  {server_name}: Timeout")
        except Exception as e:
            all_tools[server_name] = {
                "status": "error",
                "error": str(e),
                "tools": []
            }
            print(f"  {server_name}: Error - {str(e)[:50]}...")
    
    return all_tools


def extract_tools_from_response(data):
    if isinstance(data, list):
        return data
    elif isinstance(data, dict):
        for key in ["tools", "data", "result", "items", "response"]:
            if key in data:
                value = data[key]
                if isinstance(value, list):
                    return value
                elif isinstance(value, dict) and "tools" in value:
                    return value["tools"]
        
        if "result" in data and isinstance(data["result"], dict):
            if "tools" in data["result"]:
                return data["result"]["tools"]
    
    return []


async def connect_sse_server(server_name, server_config, all_tools, timeout):
    url = server_config["url"]
    headers = server_config.get("headers", {})
    
    async with asyncio.timeout(timeout):
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
                    
                    all_tools[server_name] = {
                        "status": "connected",
                        "transport": "sse",
                        "url": url,
                        "tools": tools_info
                    }
                    
                    print(f"  {server_name}: Connected via SSE ({len(tools_info)} tools)")
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
                        
                        all_tools[server_name] = {
                            "status": "connected",
                            "transport": "sse",
                            "url": url,
                            "tools": tools_info
                        }
                        print(f"  {server_name}: Connected via SSE ({len(tools_info)} tools)")
            else:
                raise


async def connect_stdio_server(server_name, server_config, all_tools, timeout):
    server_params = StdioServerParameters(
        command=server_config["command"],
        args=server_config.get("args", []),
        env=server_config.get("env", {})
    )
    
    async with asyncio.timeout(timeout):
        async with stdio_client(server_params) as (read, write):
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
                
                all_tools[server_name] = {
                    "status": "connected",
                    "transport": "stdio",
                    "tools": tools_info
                }
                
                print(f"  {server_name}: Connected via stdio ({len(tools_info)} tools)")


def print_mcp_tools(all_tools):
    if not all_tools:
        print("No MCP servers configured.")
        return
    
    total_tools = sum(len(server_info["tools"]) for server_info in all_tools.values())
    print(f"Found {len(all_tools)} MCP server(s) with {total_tools} total tools:")
    print("=" * 60)
    
    for server_name, server_info in all_tools.items():
        status = server_info["status"]
        tools = server_info["tools"]
        transport = server_info.get("transport", "unknown")
        
        print(f"\nServer: {server_name}")
        print(f"Status: {status.upper()}")
        print(f"Transport: {transport.upper()}")
        
        if server_info.get("url"):
            print(f"URL: {server_info['url']}")
        
        if status == "error":
            print(f"Error: {server_info['error']}")
        elif status == "disabled":
            print("Server is disabled in configuration")
        elif status == "connected":
            if tools:
                print(f"Available tools ({len(tools)}):")
                for tool in tools:
                    print(f"  • {tool['name']}")
                    if tool['description']:
                        print(f"    Description: {tool['description']}")
                    if tool.get('input_schema'):
                        schema = tool['input_schema']
                        if 'properties' in schema:
                            params = list(schema['properties'].keys())
                            print(f"    Parameters: {', '.join(params)}")
                    print()
            else:
                print("No tools available")
        
        print("-" * 40)


async def main():
    config = {
        "mcpServers": {
            # "mem0": {
            #     "url": "https://mcp.composio.dev/partner/composio/mem0/sse?customerId=f22eba6f-07d9-4913-8be6-4d80c02b3dec",
            #     "transport": "sse"
            # },
            "airbnb": {
                "command": "npx",
                "args": ["-y", "@openbnb/mcp-server-airbnb", "--ignore-robots-txt"]
            },
            # "playwright": {
            #     "command": "npx",
            #     "args": ["@playwright/mcp@latest"],
            #     "env": {"DISPLAY": ":1"}
            # },
        }
    }
    
    try:
        print("Discovering MCP tools from mixed transports (stdio, SSE, HTTP)...")
        all_tools = await list_mcp_tools_mixed(config, timeout=20)
        print("\n" + "="*60)
        print_mcp_tools(all_tools)
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Done.")


def list_tools_sync(config):
    return asyncio.run(list_mcp_tools_mixed(config))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        import sys
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())