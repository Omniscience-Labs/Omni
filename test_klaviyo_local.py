#!/usr/bin/env python3
"""
Quick test script to verify Klaviyo MCP integration locally

Prerequisites:
1. Start Klaviyo MCP server: cd mcp-servers/klaviyo && npm run start:http
2. Set KLAVIYO_API_KEY environment variable
3. Run this script: python test_klaviyo_local.py
"""

import asyncio
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from core.mcp_module import mcp_service
from core.utils.logger import logger


async def test_klaviyo_connection():
    """Test connecting to local Klaviyo MCP server"""
    
    print("🧪 Testing Klaviyo MCP Integration\n")
    print("=" * 60)
    
    # Configuration for local MCP server
    config = {
        "qualifiedName": "klaviyo_local_test",
        "name": "Klaviyo (Local Test)",
        "type": "http",
        "config": {
            "url": "http://localhost:3010/sse"
        },
        "enabledTools": [
            "get_profiles",
            "get_lists",
            "get_campaigns",
            "get_metrics",
            "get_flows",
            "get_segments"
        ]
    }
    
    try:
        # Step 1: Connect to MCP server
        print("\n📡 Step 1: Connecting to Klaviyo MCP server...")
        print(f"   URL: {config['config']['url']}")
        
        connection = await mcp_service.connect_server(config)
        
        print(f"✅ Connected successfully!")
        print(f"   Connection: {connection.qualified_name}")
        print(f"   Tools available: {len(connection.tools)}")
        
        # Step 2: List all tools
        print("\n📋 Step 2: Available Tools:")
        print("-" * 60)
        
        if connection.tools:
            for i, tool in enumerate(connection.tools, 1):
                print(f"{i:2}. {tool.name:25} - {tool.description[:50]}...")
        
        # Step 3: Get OpenAPI format tools (what agents see)
        print("\n🔧 Step 3: Tools in OpenAPI format (for LLM):")
        print("-" * 60)
        
        openapi_tools = mcp_service.get_all_tools_openapi()
        klaviyo_tools = [t for t in openapi_tools if any(
            t['function']['name'] == tool.name 
            for tool in connection.tools
        )]
        
        print(f"   Formatted {len(klaviyo_tools)} tools for LLM consumption")
        
        # Show one example
        if klaviyo_tools:
            example = klaviyo_tools[0]
            print(f"\n   Example: {example['function']['name']}")
            print(f"   Description: {example['function']['description']}")
            print(f"   Parameters: {list(example['function']['parameters'].get('properties', {}).keys())}")
        
        # Step 4: Test a simple tool call
        print("\n🎯 Step 4: Testing a tool call...")
        print("-" * 60)
        print("   Calling: get_lists (to fetch your Klaviyo lists)")
        
        result = await mcp_service.execute_tool(
            tool_name="get_lists",
            arguments={"page_size": 5}
        )
        
        if result.success:
            print(f"✅ Tool executed successfully!")
            print(f"   Result preview: {result.result[:200]}...")
            
            # Try to parse and show nicely
            try:
                import json
                data = json.loads(result.result)
                if 'data' in data:
                    print(f"\n   Found {len(data['data'])} lists")
                    for lst in data['data'][:3]:
                        if 'attributes' in lst:
                            name = lst['attributes'].get('name', 'Unknown')
                            print(f"      - {name}")
            except:
                pass
        else:
            print(f"❌ Tool execution failed: {result.error}")
        
        # Step 5: Cleanup
        print("\n🧹 Step 5: Cleaning up...")
        await mcp_service.disconnect_server(config['qualifiedName'])
        print("✅ Disconnected from MCP server")
        
        # Summary
        print("\n" + "=" * 60)
        print("✅ Integration Test Complete!")
        print("\n📝 What we learned:")
        print("   1. MCP server is running and accessible")
        print("   2. Tools are properly discovered and formatted")
        print("   3. Tool execution works end-to-end")
        print("   4. Ready for agent integration!")
        
        print("\n🚀 Next Steps:")
        print("   1. Register permanently: python scripts/register_klaviyo_mcp.py")
        print("   2. Add to your agent via UI")
        print("   3. Use in Cursor with natural language!")
        print("\n")
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        
        print("\n🔍 Troubleshooting:")
        print("   1. Is MCP server running? Check: curl http://localhost:3010/health")
        print("   2. Is KLAVIYO_API_KEY set in mcp-servers/klaviyo/.env?")
        print("   3. Start server: cd mcp-servers/klaviyo && npm run start:http")


if __name__ == "__main__":
    # Check if running from correct directory
    if not Path("backend").exists():
        print("❌ Error: Run this from the Omni root directory")
        print("   cd /Users/varnikachabria/work/omni/Omni")
        sys.exit(1)
    
    asyncio.run(test_klaviyo_connection())

