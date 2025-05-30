"""
Test script to list ONLY MCP tool OpenAI schema method names
"""

import asyncio
import os
from dotenv import load_dotenv
from agentpress.thread_manager import ThreadManager
from agent.tools.mcp_tool_wrapper import MCPToolWrapper
from agentpress.tool import SchemaType
from utils.logger import logger

load_dotenv()

async def test_mcp_tools_only():
    """Test listing only MCP tools and their OpenAI schema method names"""
    
    # Create thread manager
    thread_manager = ThreadManager()
    
    print("\n=== MCP Tools Test ===")
    
    # MCP configuration with ALL tools enabled (empty enabledTools)
    mcp_configs = [
        {
            "name": "Exa Search",
            "qualifiedName": "exa",
            "config": {"exaApiKey": os.getenv("EXA_API_KEY", "test-key")},
            "enabledTools": []  # Empty to get ALL tools
        }
    ]
    
    # Register MCP tool wrapper
    logger.info("Registering MCP tool wrapper...")
    thread_manager.add_tool(MCPToolWrapper, mcp_configs=mcp_configs)
    
    # Get the tool instance
    mcp_wrapper_instance = None
    for tool_name, tool_info in thread_manager.tool_registry.tools.items():
        if isinstance(tool_info['instance'], MCPToolWrapper):
            mcp_wrapper_instance = tool_info['instance']
            break
    
    if not mcp_wrapper_instance:
        logger.error("Failed to find MCP wrapper instance")
        return
    
    try:
        # Initialize MCP tools
        logger.info("Initializing MCP tools...")
        await mcp_wrapper_instance.initialize_and_register_tools()
        
        # Get all available MCP tools from the server
        available_mcp_tools = await mcp_wrapper_instance.get_available_tools()
        print(f"\nTotal MCP tools available from server: {len(available_mcp_tools)}")
        
        # Get the dynamically created schemas
        updated_schemas = mcp_wrapper_instance.get_schemas()
        mcp_method_schemas = {k: v for k, v in updated_schemas.items() if k != 'call_mcp_tool'}
        
        print(f"\nDynamically created MCP methods: {len(mcp_method_schemas)}")
        
        # List all MCP tool method names with descriptions
        print("\n=== MCP Tool Method Names (Clean Names) ===")
        for method_name, schema_list in sorted(mcp_method_schemas.items()):
            for schema in schema_list:
                if schema.schema_type == SchemaType.OPENAPI:
                    func_info = schema.schema.get('function', {})
                    func_desc = func_info.get('description', 'No description')
                    # Extract just the description part before "(MCP Server:"
                    desc_parts = func_desc.split(' (MCP Server:')
                    clean_desc = desc_parts[0] if desc_parts else func_desc
                    print(f"\n{method_name}")
                    print(f"  Description: {clean_desc}")
                    
                    # Show parameters
                    params = func_info.get('parameters', {})
                    props = params.get('properties', {})
                    required = params.get('required', [])
                    if props:
                        print(f"  Parameters:")
                        for param_name, param_info in props.items():
                            param_type = param_info.get('type', 'any')
                            param_desc = param_info.get('description', 'No description')
                            is_required = param_name in required
                            req_marker = " (required)" if is_required else " (optional)"
                            print(f"    - {param_name}: {param_type}{req_marker} - {param_desc}")
        
        # Show the name mapping
        print("\n\n=== MCP Tool Name Mapping (Original -> Clean) ===")
        for original_name, tool_data in sorted(mcp_wrapper_instance._dynamic_tools.items()):
            print(f"{original_name} -> {tool_data['method_name']}")
        
        # Summary of callable method names
        print("\n\n=== Summary: Callable MCP Method Names ===")
        method_names = sorted(mcp_method_schemas.keys())
        for name in method_names:
            print(f"- {name}")
        
        print(f"\nTotal callable MCP methods: {len(method_names)}")
        
    except Exception as e:
        logger.error(f"Error during MCP initialization: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_mcp_tools_only()) 