#!/usr/bin/env python3
"""
Test script for custom MCP functionality
"""

import asyncio
import json
from agent.tools.mcp_tool_wrapper import MCPToolWrapper

async def test_custom_mcp():
    """Test custom MCP configuration and tool discovery"""
    
    # Example custom MCP configuration (Playwright)
    custom_mcp_config = {
        'name': 'Playwright Test',
        'qualifiedName': 'custom_json_playwright_test',
        'config': {
            'command': 'npx',
            'args': ['@modelcontextprotocol/server-playwright'],
            'env': {'DISPLAY': ':1'}
        },
        'enabledTools': ['screenshot', 'click', 'type'],
        'isCustom': True,
        'customType': 'json'
    }
    
    # Example SSE custom MCP configuration
    sse_custom_mcp_config = {
        'name': 'Mem0 Test',
        'qualifiedName': 'custom_sse_mem0_test',
        'config': {
            'url': 'https://mcp.composio.dev/partner/composio/mem0/sse?customerId=test',
            'headers': {}
        },
        'enabledTools': ['add_memory', 'search_memory'],
        'isCustom': True,
        'customType': 'sse'
    }
    
    print("🧪 Testing Custom MCP Tool Wrapper")
    print("=" * 50)
    
    # Test with just the JSON custom MCP
    try:
        print("\n1. Testing JSON Custom MCP (Playwright)...")
        wrapper = MCPToolWrapper(mcp_configs=[custom_mcp_config])
        
        # Initialize the wrapper
        await wrapper._ensure_initialized()
        
        # Get available tools
        tools = await wrapper.get_available_tools()
        print(f"   ✅ Found {len(tools)} tools")
        
        for tool in tools:
            print(f"   - {tool.get('name', 'Unknown')}: {tool.get('description', 'No description')}")
        
        # Get schemas
        schemas = wrapper.get_schemas()
        print(f"   ✅ Generated {len(schemas)} tool schemas")
        
        for method_name, schema_list in schemas.items():
            print(f"   - Method: {method_name}")
            for schema in schema_list:
                if hasattr(schema, 'schema') and 'function' in schema.schema:
                    func_name = schema.schema['function'].get('name', 'Unknown')
                    func_desc = schema.schema['function'].get('description', 'No description')
                    print(f"     Function: {func_name} - {func_desc}")
        
        await wrapper.cleanup()
        print("   ✅ JSON Custom MCP test completed")
        
    except Exception as e:
        print(f"   ❌ JSON Custom MCP test failed: {e}")
    
    # Test with SSE custom MCP (this might fail if the endpoint is not accessible)
    try:
        print("\n2. Testing SSE Custom MCP (Mem0)...")
        wrapper2 = MCPToolWrapper(mcp_configs=[sse_custom_mcp_config])
        
        # This might timeout or fail if the endpoint is not accessible
        await asyncio.wait_for(wrapper2._ensure_initialized(), timeout=10)
        
        tools = await wrapper2.get_available_tools()
        print(f"   ✅ Found {len(tools)} tools")
        
        schemas = wrapper2.get_schemas()
        print(f"   ✅ Generated {len(schemas)} tool schemas")
        
        await wrapper2.cleanup()
        print("   ✅ SSE Custom MCP test completed")
        
    except asyncio.TimeoutError:
        print("   ⚠️  SSE Custom MCP test timed out (expected if endpoint not accessible)")
    except Exception as e:
        print(f"   ⚠️  SSE Custom MCP test failed: {e} (expected if endpoint not accessible)")
    
    print("\n🎉 Custom MCP testing completed!")
    print("\nTo use custom MCPs in your agent:")
    print("1. Add custom MCPs through the frontend dialog")
    print("2. Save the agent configuration")
    print("3. Start a new agent run - custom MCP tools will be available")
    print("4. The LLM can call custom MCP tools directly by their function names")

if __name__ == "__main__":
    asyncio.run(test_custom_mcp()) 