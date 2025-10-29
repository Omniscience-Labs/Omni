# Local Testing Guide for Klaviyo MCP Server

This guide walks through testing the Klaviyo MCP server locally to understand how MCP integration works.

## Step 1: Install Dependencies

```bash
cd /Users/varnikachabria/work/omni/Omni/mcp-servers/klaviyo
npm install
```

## Step 2: Build TypeScript

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

## Step 3: Test with Stdio (MCP Inspector)

The easiest way to test MCP servers is with the MCP Inspector:

```bash
# Set your Klaviyo API key
export KLAVIYO_API_KEY=your_klaviyo_private_key_here

# Run inspector (opens web interface)
npm run inspect
```

This opens a web interface where you can:
- See all available tools
- Test tool calls interactively
- View request/response logs

Try calling some tools:
- `get_profiles` - List profiles
- `get_lists` - List your Klaviyo lists
- `get_campaigns` - See campaigns

## Step 4: Test HTTP Server Locally

For integration with Omni, we need the HTTP/SSE server:

```bash
# Terminal 1: Start the HTTP server
export KLAVIYO_API_KEY=your_key
export PORT=3010
node dist/http-server.js
```

You should see:
```
Klaviyo MCP Server listening on port 3010
Health check: http://localhost:3010/health
MCP endpoint: http://localhost:3010/sse
```

## Step 5: Test Health Endpoint

```bash
# Terminal 2: Test health
curl http://localhost:3010/health
```

Should return:
```json
{"status":"healthy","service":"klaviyo-mcp-server"}
```

## Step 6: Discover Tools via Omni Backend

Now let's test the integration with your Omni backend:

```bash
# Make sure your Omni backend is running
cd /Users/varnikachabria/work/omni/Omni/backend

# Test discovery endpoint
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "http",
    "config": {
      "url": "http://localhost:3010/sse"
    }
  }'
```

This should return a JSON response with:
- `success: true`
- List of all 14 Klaviyo tools
- Tool schemas with descriptions and parameters

## Step 7: Test Full Integration (Optional)

To test with actual agent execution, you can use Python:

```python
# test_klaviyo_mcp.py
import asyncio
from core.mcp_module import mcp_service

async def test_klaviyo():
    # Configure the MCP connection
    config = {
        "qualifiedName": "klaviyo",
        "name": "Klaviyo",
        "type": "http",
        "config": {
            "url": "http://localhost:3010/sse"
        },
        "enabledTools": [
            "get_profiles",
            "get_lists",
            "get_campaigns"
        ]
    }
    
    # Connect
    print("Connecting to Klaviyo MCP...")
    connection = await mcp_service.connect_server(config)
    print(f"Connected! Tools available: {len(connection.tools)}")
    
    # List tools
    tools = mcp_service.get_all_tools_openapi()
    for tool in tools:
        print(f"  - {tool['function']['name']}: {tool['function']['description']}")
    
    # Test a tool call
    print("\nTesting get_lists...")
    result = await mcp_service.execute_tool("get_lists", {})
    print(f"Result: {result.result[:200]}...")  # First 200 chars
    
    # Disconnect
    await mcp_service.disconnect_server("klaviyo")
    print("\nDisconnected!")

if __name__ == "__main__":
    asyncio.run(test_klaviyo())
```

Run it:
```bash
cd /Users/varnikachabria/work/omni/Omni/backend
python test_klaviyo_mcp.py
```

## Understanding the Architecture

### What Just Happened?

1. **MCP Server (Node.js)**
   - Runs on port 3010
   - Exposes tools via MCP protocol
   - Talks to Klaviyo API using your API key

2. **Omni Backend (Python)**
   - Discovers tools from MCP server
   - Converts MCP tool schemas to OpenAPI format
   - Executes tools when agents need them

3. **The Flow**
   ```
   Agent Request
       ↓
   Omni Backend (Python)
       ↓ (HTTP/SSE)
   MCP Server (Node.js)
       ↓ (REST API)
   Klaviyo API
   ```

### Key Files

- `src/index.ts` - Stdio version (for testing)
- `src/http-server.ts` - HTTP/SSE version (for production)
- Tool handlers in both files - Where API calls happen

### How MCP Works

1. **Discovery**: Backend asks "what tools do you have?"
2. **Schema**: MCP server returns tool definitions (name, description, parameters)
3. **Execution**: When agent calls a tool, backend forwards to MCP server
4. **Response**: MCP server calls Klaviyo API and returns result

## Debugging Tips

### Check MCP Server Logs

The HTTP server logs everything:
```
New SSE connection established
Tool execution: get_profiles
Result returned: {...}
```

### Test Individual Tools

Use curl to test the MCP discovery:
```bash
# This is what Omni does internally
curl -X POST http://localhost:3010/message \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list","params":{}}'
```

### Common Issues

**"Connection refused"**
- Make sure server is running: `curl http://localhost:3010/health`

**"Klaviyo API error"**
- Check your API key is valid
- Verify API key has proper permissions in Klaviyo dashboard

**"Tool not found"**
- Make sure tool is in `enabledTools` list
- Check tool name matches exactly (case-sensitive)

## Next Steps

Once you understand how it works locally:

1. **Docker**: Use docker-compose for permanent deployment
2. **Registration**: Use `scripts/register_klaviyo_mcp.py` to save to database
3. **UI**: Add via Omni UI for easy management
4. **Agents**: Enable in agent configurations

## Questions to Explore

Try these to deepen understanding:

1. **Add a new tool**: Edit `src/http-server.ts` and add `get_metrics` implementation
2. **Modify a tool**: Change `get_profiles` to return only email addresses
3. **Error handling**: What happens if you use invalid profile ID?
4. **Rate limits**: How does Klaviyo API handle high request volumes?

Have fun exploring! 🚀

