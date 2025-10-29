# Klaviyo MCP Server Setup Guide

This guide will help you set up and integrate the Klaviyo MCP Server with your Omni instance.

## Prerequisites

1. **Klaviyo Account**: You need a Klaviyo account with an API key
2. **Klaviyo Private API Key**: Get it from Klaviyo Dashboard → Settings → API Keys
3. **Omni Instance**: Running Omni backend and frontend

## Quick Setup

### Step 1: Add Klaviyo API Key to Environment

Add your Klaviyo API key to your environment variables:

```bash
# In your .env file or Doppler
KLAVIYO_API_KEY=pk_your_private_api_key_here
```

### Step 2: Start Services

Start all services including the Klaviyo MCP server:

```bash
# From the Omni root directory
docker-compose up -d
```

This will start:
- Backend (port 8000)
- Frontend (port 3000)
- Redis
- Worker
- **Klaviyo MCP Server (port 3010)** ✨

### Step 3: Verify Klaviyo MCP is Running

Check the health endpoint:

```bash
curl http://localhost:3010/health
```

You should see:
```json
{"status":"healthy","service":"klaviyo-mcp-server"}
```

### Step 4: Register with Your Account

You have two options to register Klaviyo MCP with your Omni account:

#### Option A: Via Registration Script (Recommended)

```bash
cd /path/to/Omni

# Set your credentials
export KLAVIYO_API_KEY=pk_your_key
export ACCOUNT_ID=your_supabase_account_id

# Run registration script
python scripts/register_klaviyo_mcp.py
```

#### Option B: Via Omni UI

1. Log into your Omni frontend
2. Go to Settings → MCP Connections
3. Click "Add Custom MCP Connection"
4. Fill in:
   - **Name**: Klaviyo
   - **Type**: HTTP
   - **URL**: `http://klaviyo-mcp:3010/sse` (or `http://localhost:3010/sse` for local)
   - **API Key**: Your Klaviyo private key

5. Select which tools to enable (or enable all)
6. Click "Test Connection" to verify
7. Save

#### Option C: Via API

```bash
curl -X POST http://localhost:8000/api/mcp/discover-custom-tools \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "type": "http",
    "config": {
      "url": "http://klaviyo-mcp:3010/sse"
    }
  }'
```

### Step 5: Use in Agents

Once registered, you can use Klaviyo tools in your agents:

1. Create or edit an agent
2. Go to MCP Connections section
3. Enable "Klaviyo" connection
4. Select which tools you want the agent to have access to
5. Save

Now your agent can use Klaviyo tools like:
- `get_profiles` - Retrieve customer profiles
- `create_list` - Create marketing lists
- `create_event` - Track custom events
- `get_campaigns` - Retrieve campaign data
- And more!

## Available Tools

### Profile Management
- `get_profiles` - Get list of profiles with filtering
- `get_profile` - Get specific profile by ID
- `create_profile` - Create new profile
- `update_profile` - Update existing profile

### List Management
- `get_lists` - Get all lists
- `get_list` - Get specific list
- `create_list` - Create new list
- `add_profiles_to_list` - Add profiles to a list

### Events
- `create_event` - Create custom tracking event

### Campaigns & Analytics
- `get_campaigns` - Get campaign list
- `get_campaign` - Get specific campaign
- `get_flows` - Get automation flows
- `get_segments` - Get customer segments
- `get_metrics` - Get metrics data

## Example Usage in Cursor

Once integrated, you can ask your Omni agent in Cursor:

```
"Get all profiles from Klaviyo where email contains 'example.com'"

"Create a new list called 'VIP Customers' in Klaviyo"

"Track a 'Product Viewed' event for user@example.com with product_id=123"

"Show me all active campaigns in Klaviyo"
```

The agent will use the appropriate Klaviyo tools to fulfill your requests!

## Troubleshooting

### Klaviyo MCP Server won't start

**Check logs:**
```bash
docker-compose logs klaviyo-mcp
```

**Common issues:**
- Missing `KLAVIYO_API_KEY` environment variable
- Port 3010 already in use
- Node.js dependencies not installed

### Connection test fails

**Check:**
1. Klaviyo MCP server is running: `curl http://localhost:3010/health`
2. API key is valid in Klaviyo dashboard
3. URL is correct (`http://klaviyo-mcp:3010/sse` within Docker network)

### Tools not showing up

**Check:**
1. MCP connection is enabled for the agent
2. Specific tools are selected in the configuration
3. Agent has been restarted/refreshed after changes

## Development & Testing

### Test locally (without Docker)

```bash
cd mcp-servers/klaviyo
npm install
npm run build
KLAVIYO_API_KEY=your_key npm start
```

### Inspect tools with MCP Inspector

```bash
cd mcp-servers/klaviyo
npm run inspect
```

This opens a web interface to test tools interactively.

## Security Notes

- **API Key Storage**: Your Klaviyo API key is encrypted in the database using Fernet encryption
- **Access Control**: MCP credentials are scoped per user account
- **RLS Policies**: Row Level Security ensures users can only access their own credentials
- **HTTPS**: Use HTTPS in production for the MCP server

## Support

- **Klaviyo API Docs**: https://developers.klaviyo.com/
- **Omni Documentation**: See main Omni docs
- **Issues**: Report issues in the Omni repository

## Next Steps

1. ✅ Klaviyo MCP Server is running
2. ✅ Registered with your account
3. ✅ Tools available to agents

Now you can use Klaviyo's marketing automation directly from your AI agents! 🚀

