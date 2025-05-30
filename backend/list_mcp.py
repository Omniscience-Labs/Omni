"""
Test script to explore Smithery Registry API and list all available MCP servers
"""

import asyncio
import httpx
import json
import os
from collections import defaultdict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_smithery_registry():
    """Test the Smithery Registry API to see all available MCP servers"""
    
    print("=== Testing Smithery Registry API ===\n")
    
    # Get API key from environment
    smithery_api_key = os.getenv("SMITHERY_API_KEY")
    if smithery_api_key:
        print("✓ Smithery API key found in environment")
    else:
        print("⚠ No Smithery API key found - some features may be limited")
    
    # Test 1: List all available servers
    print("\n1. Fetching all available MCP servers...")
    registry_url = "https://registry.smithery.ai/servers"
    
    async with httpx.AsyncClient() as client:
        headers = {
            "Accept": "application/json",
            "User-Agent": "Suna-MCP-Integration/1.0"
        }
        
        # Add API key if available
        if smithery_api_key:
            headers["Authorization"] = f"Bearer {smithery_api_key}"
        
        params = {
            "page": 1,
            "pageSize": 100  # Get more servers
        }
        
        try:
            response = await client.get(registry_url, headers=headers, params=params, timeout=30.0)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                servers = data.get("servers", [])
                
                print(f"Total servers found: {len(servers)}\n")
                
                # Group by categories
                categories = defaultdict(list)
                
                # Define category mappings
                category_mappings = {
                    "github": "Development & Version Control",
                    "gitlab": "Development & Version Control",
                    "bitbucket": "Development & Version Control",
                    "slack": "Communication & Collaboration",
                    "discord": "Communication & Collaboration",
                    "teams": "Communication & Collaboration",
                    "linear": "Project Management",
                    "jira": "Project Management",
                    "notion": "Project Management",
                    "asana": "Project Management",
                    "exa": "AI & Search",
                    "perplexity": "AI & Search",
                    "openai": "AI & Search",
                    "duckduckgo": "AI & Search",
                    "postgres": "Data & Analytics",
                    "mysql": "Data & Analytics",
                    "mongodb": "Data & Analytics",
                    "aws": "Cloud & Infrastructure",
                    "gcp": "Cloud & Infrastructure",
                    "azure": "Cloud & Infrastructure",
                    "playwright": "Automation & Productivity",
                    "puppeteer": "Automation & Productivity",
                    "desktop-commander": "Automation & Productivity",
                    "sequential-thinking": "Automation & Productivity",
                    "filesystem": "Utilities",
                    "memory": "Utilities",
                    "fetch": "Utilities",
                }
                
                for server in servers:
                    display_name = server.get("displayName", server.get("name", "Unknown"))
                    qualified_name = server.get("qualifiedName", "unknown")
                    description = server.get("description", "No description")
                    use_count = server.get("useCount", 0)
                    is_deployed = server.get("isDeployed", False)
                    
                    # Categorization
                    category = "Other"
                    qualified_lower = qualified_name.lower()
                    
                    for key, cat in category_mappings.items():
                        if key in qualified_lower:
                            category = cat
                            break
                    
                    categories[category].append({
                        "displayName": display_name,
                        "qualifiedName": qualified_name,
                        "description": description[:80] + "..." if len(description) > 80 else description,
                        "useCount": use_count,
                        "isDeployed": is_deployed
                    })
                
                # Display servers by category (sorted by use count)
                priority_order = [
                    "AI & Search",
                    "Development & Version Control",
                    "Communication & Collaboration",
                    "Project Management",
                    "Automation & Productivity",
                    "Data & Analytics",
                    "Cloud & Infrastructure",
                    "Utilities",
                    "Other"
                ]
                
                for category in priority_order:
                    if category in categories:
                        cat_servers = sorted(categories[category], key=lambda x: -x["useCount"])
                        print(f"\n=== {category} ({len(cat_servers)} servers) ===")
                        for server in cat_servers[:5]:  # Show top 5 per category
                            deployed = "✓" if server["isDeployed"] else "✗"
                            print(f"\n- {server['displayName']} [{deployed}] (used {server['useCount']} times)")
                            print(f"  {server['qualifiedName']}")
                            print(f"  {server['description']}")
                
                # Test 2: Get details for a specific server
                print("\n\n2. Testing server details endpoint...")
                test_servers = ["exa", "@tacticlaunch/mcp-linear", "@microsoft/playwright-mcp"]
                
                for test_server in test_servers:
                    print(f"\n--- Testing details for: {test_server} ---")
                    
                    # URL encode if needed
                    from urllib.parse import quote
                    if '@' in test_server or '/' in test_server:
                        encoded_name = quote(test_server, safe='')
                    else:
                        encoded_name = test_server
                    
                    details_url = f"https://registry.smithery.ai/servers/{encoded_name}"
                    
                    response = await client.get(details_url, headers=headers, timeout=30.0)
                    if response.status_code == 200:
                        server_details = response.json()
                        print(f"✓ Successfully fetched details")
                        print(f"  Display Name: {server_details.get('displayName')}")
                        print(f"  Description: {server_details.get('description', '')[:100]}...")
                        print(f"  Homepage: {server_details.get('homepage')}")
                        print(f"  Is Deployed: {server_details.get('isDeployed', False)}")
                        
                        tools = server_details.get("tools", [])
                        print(f"  Available tools ({len(tools)}):")
                        for tool in tools[:5]:  # Show first 5 tools
                            print(f"    - {tool.get('name')}: {tool.get('description', 'No description')[:60]}...")
                    else:
                        print(f"✗ Failed to fetch details: {response.status_code}")
                
                # Test 3: Test our API endpoints
                print("\n\n3. Testing our API endpoints...")
                
                # Test the available-servers endpoint
                api_url = "http://localhost:8000/api/mcp/available-servers"
                print(f"\nTesting: {api_url}")
                
                try:
                    response = await client.get(api_url, timeout=10.0)
                    if response.status_code == 200:
                        data = response.json()
                        print(f"✓ API endpoint working!")
                        print(f"  Total servers: {data.get('total', 0)}")
                        print(f"  Categories: {data.get('categoryCount', 0)}")
                        if data.get('categorized'):
                            for cat, servers in list(data['categorized'].items())[:3]:
                                print(f"  - {cat}: {len(servers)} servers")
                    else:
                        print(f"✗ API endpoint failed: {response.status_code}")
                except Exception as e:
                    print(f"✗ Could not reach API endpoint (is the server running?): {e}")
                
            else:
                print(f"Failed to fetch servers: {response.text}")
                
        except Exception as e:
            print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_smithery_registry()) 