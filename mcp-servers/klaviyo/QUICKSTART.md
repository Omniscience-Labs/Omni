# 🚀 Klaviyo MCP Server - Quick Start

## What You Just Built

You've created a **Model Context Protocol (MCP) server** that exposes Klaviyo's API as tools that AI agents can use. This means agents in Cursor (and your Omni platform) can now:

- 📧 Manage customer profiles
- 📋 Create and manage lists
- 📊 Track custom events
- 📈 Access campaign and flow data
- 🎯 Work with segments and metrics

## Local Testing (5 minutes)

### 1. Set Your API Key

Create `.env` file:
```bash
cd /Users/varnikachabria/work/omni/Omni/mcp-servers/klaviyo
cp .env.example .env
# Edit .env and add your Klaviyo API key
```

Or export it:
```bash
export KLAVIYO_API_KEY=pk_your_private_key_here
```

### 2. Start the MCP Server

```bash
cd /Users/varnikachabria/work/omni/Omni/mcp-servers/klaviyo
npm run start:http
```

You should see:
```
Klaviyo MCP Server listening on port 3010
Health check: http://localhost:3010/health
MCP endpoint: http://localhost:3010/sse
```

### 3. Test It!

**Option A: Quick Health Check**
```bash
curl http://localhost:3010/health
```

**Option B: Full Integration Test**
```bash
# In a new terminal
cd /Users/varnikachabria/work/omni/Omni
python test_klaviyo_local.py
```

This will:
- ✅ Connect to your MCP server
- ✅ List all 14 available tools
- ✅ Execute a test call (get_lists)
- ✅ Show you what agents will see

**Option C: Interactive Testing (MCP Inspector)**
```bash
cd mcp-servers/klaviyo
npm run inspect
```

Opens a web UI where you can test each tool interactively!

## How It Works

### The Architecture

```
┌─────────────────────────────────────────────────┐
│  Your Cursor / AI Agent                         │
│  "Get my Klaviyo lists"                         │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  Omni Backend (Python)                          │
│  - Discovers tools from MCP server              │
│  - Converts to OpenAPI format for LLM           │
│  - Routes tool calls                            │
└────────────────┬────────────────────────────────┘
                 │ HTTP/SSE
                 ▼
┌─────────────────────────────────────────────────┐
│  Klaviyo MCP Server (Node.js) [Port 3010]      │
│  - Exposes 14 Klaviyo tools                    │
│  - Handles tool execution                       │
└────────────────┬────────────────────────────────┘
                 │ REST API
                 ▼
┌─────────────────────────────────────────────────┐
│  Klaviyo API                                    │
│  - Profiles, Lists, Events, Campaigns, etc.     │
└─────────────────────────────────────────────────┘
```

### What Makes This Special

1. **MCP Protocol**: Standard way for AI agents to discover and use tools
2. **Type Safety**: Zod schemas ensure correct parameters
3. **Async Operations**: Efficient handling of API calls
4. **Extensible**: Easy to add more Klaviyo endpoints

## File Structure

```
mcp-servers/klaviyo/
├── src/
│   ├── index.ts          # Stdio version (for MCP Inspector)
│   └── http-server.ts    # HTTP/SSE version (for Omni)
├── dist/                 # Compiled JavaScript
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript config
├── Dockerfile           # For containerization
├── README.md            # Overview
├── SETUP.md             # Production setup
├── LOCAL_TESTING.md     # Detailed testing guide
└── QUICKSTART.md        # This file!
```

## Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `get_profiles` | List profiles | Get all customers with filter |
| `get_profile` | Get single profile | Get customer by ID |
| `create_profile` | Create new profile | Add new customer |
| `update_profile` | Update profile | Change customer email |
| `get_lists` | Get all lists | See marketing lists |
| `get_list` | Get single list | Get list details |
| `create_list` | Create new list | Make VIP customer list |
| `add_profiles_to_list` | Add to list | Add customers to segment |
| `create_event` | Track event | Log "Product Viewed" |
| `get_campaigns` | List campaigns | See email campaigns |
| `get_campaign` | Get campaign | Campaign details |
| `get_flows` | List flows | Automation flows |
| `get_segments` | List segments | Customer segments |
| `get_metrics` | List metrics | Available metrics |

## Next Steps

### For Learning
1. ✅ **You did it!** Server is running locally
2. 📖 Read `LOCAL_TESTING.md` for deep dive
3. 🔬 Experiment with the MCP Inspector
4. 🛠️ Try modifying a tool in `src/http-server.ts`

### For Production
1. 🐳 **Docker**: Use `docker-compose up -d` for permanent deployment
2. 💾 **Register**: Run `python scripts/register_klaviyo_mcp.py`
3. 🎨 **UI**: Add via Omni dashboard
4. 🤖 **Use**: Enable in your agents!

### For Cursor Integration

Once registered in Omni, you can use it in Cursor like this:

**Example 1: Get profiles**
```
"Show me all customer profiles from Klaviyo where email contains 'gmail.com'"
```

**Example 2: Create list**
```
"Create a new Klaviyo list called 'Holiday Shoppers 2025'"
```

**Example 3: Track event**
```
"Track a 'Product Viewed' event in Klaviyo for user@example.com with product_id=123"
```

## Understanding MCP

MCP (Model Context Protocol) is like a universal adapter for AI tools:

- **Before MCP**: Each tool needed custom integration
- **With MCP**: Standard protocol, agents discover tools automatically
- **Benefits**: 
  - ✅ Standardized tool discovery
  - ✅ Type-safe schemas
  - ✅ Works with any MCP-compatible agent
  - ✅ Easy to add new tools

## Debugging

**Server won't start?**
```bash
# Check logs
cd mcp-servers/klaviyo
npm run start:http

# Common issues:
# - Port 3010 in use: Change PORT in .env
# - Missing API key: Set KLAVIYO_API_KEY
# - Dependencies: Run npm install
```

**Can't connect from Omni?**
```bash
# Test connectivity
curl http://localhost:3010/health

# Test discovery
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -d '{"type":"http","config":{"url":"http://localhost:3010/sse"}}'
```

**Tool execution fails?**
- Check Klaviyo API key permissions
- Verify tool name is correct (case-sensitive)
- Look at MCP server logs for errors

## Resources

- 📚 **Klaviyo API Docs**: https://developers.klaviyo.com/
- 🛠️ **MCP Specification**: https://spec.modelcontextprotocol.io/
- 📖 **Local Testing Guide**: See `LOCAL_TESTING.md`
- 🚀 **Setup Guide**: See `SETUP.md`

## What's Next?

You now understand:
- ✅ How MCP servers work
- ✅ How to build custom tool integrations
- ✅ How Omni connects to MCP servers
- ✅ How agents discover and use tools

Try building your own MCP server for another API! The pattern is the same:
1. Define tools with schemas
2. Implement tool handlers
3. Expose via HTTP/SSE
4. Connect to Omni

Happy coding! 🎉

