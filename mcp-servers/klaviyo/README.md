# Klaviyo MCP Server for Omni

A Model Context Protocol (MCP) server that provides Klaviyo API integration for Omni agents.

## Features

- **Profiles Management**: Create, update, and retrieve Klaviyo profiles
- **Lists Management**: Manage lists and add/remove profiles
- **Events**: Create and track custom events
- **Campaigns**: Retrieve campaign information
- **Flows**: Access flow data
- **Segments**: Query segments
- **Metrics**: Access Klaviyo metrics

## Available Tools

### Profiles
- `get_profiles` - Get a list of profiles with filtering
- `get_profile` - Get a specific profile by ID
- `create_profile` - Create a new profile
- `update_profile` - Update an existing profile

### Lists
- `get_lists` - Get all lists
- `get_list` - Get a specific list
- `create_list` - Create a new list
- `add_profiles_to_list` - Add profiles to a list

### Events
- `create_event` - Create a custom event

### Campaigns
- `get_campaigns` - Get all campaigns
- `get_campaign` - Get a specific campaign

### Flows & Segments
- `get_flows` - Get all flows
- `get_segments` - Get all segments

### Metrics
- `get_metrics` - Get all metrics

## Environment Variables

- `KLAVIYO_API_KEY` - Your Klaviyo Private API Key (required)
- `PORT` - HTTP server port (default: 3010)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Run

```bash
# For stdio mode (local testing)
npm start

# For HTTP server mode (production)
KLAVIYO_API_KEY=your_key PORT=3010 npm run start:http
```

## Docker Deployment

The server is automatically deployed via Docker Compose in the Omni stack.

## Integration with Omni

Once running, the server can be registered in Omni:

1. The server will be available at `http://klaviyo-mcp:3010/sse`
2. Register it via the Omni UI under MCP Connections
3. Or use the registration script: `python scripts/register_klaviyo_mcp.py`

## API Reference

See [Klaviyo API Documentation](https://developers.klaviyo.com/en/reference/api_overview) for detailed information about available endpoints and data formats.

