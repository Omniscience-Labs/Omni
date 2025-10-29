# Omni MCP Configuration Format

**Complete guide to the MCP configuration format used internally by Omni.**

---

## Overview

Omni stores MCP server configurations in two places:
1. **Agent Configuration** - In the `config` JSONB field of `agent_versions` table
2. **Runtime** - Passed to `MCPToolWrapper` during agent execution

This guide explains both the storage format and runtime format.

---

## Table of Contents

1. [Storage Format (Database)](#storage-format-database)
2. [Standard MCP Configuration](#standard-mcp-configuration)
3. [Custom MCP Configuration](#custom-mcp-configuration)
4. [Runtime Configuration](#runtime-configuration)
5. [Complete Examples](#complete-examples)
6. [Field Reference](#field-reference)

---

## Storage Format (Database)

### Agent Config Structure

In the `agent_versions` table, the `config` JSONB field has this structure:

```json
{
  "name": "My Agent",
  "description": "Agent description",
  "system_prompt": "You are a helpful assistant...",
  "model": "openrouter/anthropic/sonnet-4",
  "tools": {
    "agentpress": {
      "search_tool": true,
      "code_interpreter": true
    },
    "mcp": [
      // Standard MCP configurations go here
    ],
    "custom_mcp": [
      // Custom MCP configurations go here
    ]
  },
  "metadata": {
    "avatar": "🤖",
    "avatar_color": "#8B5CF6"
  }
}
```

### Tools Structure

The `tools` object contains three keys:
- **`agentpress`**: Object with built-in tool names as keys and boolean values
- **`mcp`**: Array of standard MCP server configurations
- **`custom_mcp`**: Array of custom MCP server configurations

---

## Standard MCP Configuration

Standard MCP servers (like those from credential profiles) use this format:

### Basic Format

```json
{
  "name": "Gmail",
  "qualifiedName": "composio.gmail",
  "config": {
    "api_key": "encrypted_value_here"
  },
  "enabledTools": [
    "gmail_send_email",
    "gmail_read_email",
    "gmail_search"
  ],
  "selectedProfileId": "uuid-of-credential-profile"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name of the MCP server (e.g., "Gmail", "Slack") |
| `qualifiedName` | string | ✅ | Unique identifier for the server (e.g., "composio.gmail") |
| `config` | object | ✅ | Configuration object containing connection details |
| `enabledTools` | array | ✅ | List of tool names that are enabled for this agent |
| `selectedProfileId` | string | ❌ | UUID of the credential profile used (optional) |

### Example - Composio Gmail

```json
{
  "name": "Gmail",
  "qualifiedName": "composio.gmail",
  "config": {
    "api_key": "encrypted_key_value",
    "user_email": "user@example.com"
  },
  "enabledTools": [
    "gmail_send_email",
    "gmail_read_email",
    "gmail_search",
    "gmail_create_draft"
  ],
  "selectedProfileId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Example - Pipedream MCP

```json
{
  "name": "Slack Workspace",
  "qualifiedName": "pipedream.slack",
  "config": {
    "url": "https://remote.mcp.pipedream.net",
    "headers": {
      "x-pd-app-slug": "slack",
      "x-pd-external-user-id": "user_123",
      "x-pd-environment": "production"
    }
  },
  "enabledTools": [
    "slack_send_message",
    "slack_list_channels"
  ],
  "selectedProfileId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

---

## Custom MCP Configuration

Custom MCP servers (HTTP/SSE servers you connect manually) use this extended format:

### Basic Format

```json
{
  "name": "My Custom Server",
  "type": "http",
  "customType": "http",
  "config": {
    "url": "https://my-mcp-server.com",
    "headers": {
      "Authorization": "Bearer encrypted_token"
    }
  },
  "enabledTools": [
    "custom_tool_1",
    "custom_tool_2"
  ]
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name you gave the server |
| `type` | string | ✅ | Transport type: `"http"` or `"sse"` |
| `customType` | string | ✅ | Same as type, used for identification |
| `config` | object | ✅ | Configuration with `url` and optional `headers` |
| `enabledTools` | array | ✅ | List of enabled tool names |
| `instructions` | string | ❌ | Optional instructions for using these tools |

### Example - HTTP Custom Server with Auth

```json
{
  "name": "Klaviyo Marketing Tools",
  "type": "http",
  "customType": "http",
  "config": {
    "url": "https://klaviyo-mcp.onrender.com",
    "headers": {
      "Authorization": "Bearer sk_live_abc123def456"
    }
  },
  "enabledTools": [
    "create_campaign",
    "list_segments",
    "send_email"
  ],
  "instructions": "Use these tools to manage Klaviyo email marketing campaigns"
}
```

### Example - SSE Custom Server

```json
{
  "name": "Real-time Analytics",
  "type": "sse",
  "customType": "sse",
  "config": {
    "url": "https://analytics-mcp.service.com",
    "headers": {
      "X-API-Key": "encrypted_api_key"
    }
  },
  "enabledTools": [
    "get_live_metrics",
    "subscribe_to_events"
  ]
}
```

### Example - Local Development Server

```json
{
  "name": "Local Dev MCP",
  "type": "http",
  "customType": "http",
  "config": {
    "url": "http://localhost:3010"
  },
  "enabledTools": [
    "test_tool_1",
    "test_tool_2"
  ]
}
```

---

## Runtime Configuration

When Omni runs an agent, it transforms the stored configuration into a runtime format for `MCPToolWrapper`.

### Runtime Format

```json
{
  "name": "Server Name",
  "qualifiedName": "server.qualified.name",
  "config": {
    "url": "https://server.com",
    "headers": {
      "Authorization": "Bearer token"
    }
  },
  "enabledTools": ["tool1", "tool2"],
  "instructions": "Optional instructions",
  "isCustom": true,
  "customType": "http"
}
```

### Additional Runtime Fields

| Field | Type | Description |
|-------|------|-------------|
| `isCustom` | boolean | Set to `true` for custom MCP servers |
| `customType` | string | The transport type: `"http"`, `"sse"`, `"composio"`, `"pipedream"` |
| `instructions` | string | Optional tool usage instructions |

### Runtime Transformation Example

**Stored Configuration:**
```json
{
  "name": "My Server",
  "type": "http",
  "config": {
    "url": "https://example.com"
  },
  "enabledTools": ["tool1"]
}
```

**Runtime Configuration (after transformation):**
```json
{
  "name": "My Server",
  "qualifiedName": "custom_http_my_server",
  "config": {
    "url": "https://example.com"
  },
  "enabledTools": ["tool1"],
  "instructions": "",
  "isCustom": true,
  "customType": "http"
}
```

---

## Complete Examples

### Example 1: Agent with Multiple MCP Servers

```json
{
  "name": "Marketing Agent",
  "description": "Handles email marketing and social media",
  "system_prompt": "You are a marketing automation assistant...",
  "model": "openrouter/anthropic/sonnet-4",
  "tools": {
    "agentpress": {
      "search_tool": true,
      "memory_tool": true
    },
    "mcp": [
      {
        "name": "Gmail",
        "qualifiedName": "composio.gmail",
        "config": {
          "api_key": "encrypted_value"
        },
        "enabledTools": [
          "gmail_send_email",
          "gmail_read_email"
        ],
        "selectedProfileId": "profile-uuid-1"
      },
      {
        "name": "Slack",
        "qualifiedName": "pipedream.slack",
        "config": {
          "url": "https://remote.mcp.pipedream.net",
          "headers": {
            "x-pd-app-slug": "slack",
            "x-pd-external-user-id": "user_123"
          }
        },
        "enabledTools": [
          "slack_send_message"
        ],
        "selectedProfileId": "profile-uuid-2"
      }
    ],
    "custom_mcp": [
      {
        "name": "Klaviyo Marketing",
        "type": "http",
        "customType": "http",
        "config": {
          "url": "https://klaviyo-mcp.onrender.com",
          "headers": {
            "Authorization": "Bearer klaviyo_key"
          }
        },
        "enabledTools": [
          "create_campaign",
          "list_segments"
        ],
        "instructions": "Use for email marketing campaigns"
      }
    ]
  },
  "metadata": {
    "avatar": "📧",
    "avatar_color": "#10B981"
  }
}
```

### Example 2: Development Agent with Local MCP

```json
{
  "name": "Dev Agent",
  "system_prompt": "You are a development assistant...",
  "model": "openrouter/anthropic/sonnet-4",
  "tools": {
    "agentpress": {
      "code_interpreter": true
    },
    "mcp": [],
    "custom_mcp": [
      {
        "name": "Local File Tools",
        "type": "http",
        "customType": "http",
        "config": {
          "url": "http://localhost:3010"
        },
        "enabledTools": [
          "read_file",
          "write_file",
          "list_directory"
        ]
      }
    ]
  },
  "metadata": {
    "avatar": "🛠️",
    "avatar_color": "#3B82F6"
  }
}
```

### Example 3: Composio-only Integration

```json
{
  "name": "Sales Agent",
  "system_prompt": "You manage sales workflows...",
  "model": "openrouter/anthropic/sonnet-4",
  "tools": {
    "agentpress": {},
    "mcp": [
      {
        "name": "Salesforce",
        "qualifiedName": "composio.salesforce",
        "config": {
          "api_key": "encrypted_sf_key"
        },
        "enabledTools": [
          "salesforce_create_lead",
          "salesforce_update_opportunity",
          "salesforce_search_contacts"
        ],
        "selectedProfileId": "sf-profile-uuid"
      },
      {
        "name": "HubSpot",
        "qualifiedName": "composio.hubspot",
        "config": {
          "api_key": "encrypted_hs_key"
        },
        "enabledTools": [
          "hubspot_create_contact",
          "hubspot_create_deal"
        ],
        "selectedProfileId": "hs-profile-uuid"
      }
    ],
    "custom_mcp": []
  },
  "metadata": {
    "avatar": "💼",
    "avatar_color": "#EF4444"
  }
}
```

---

## Field Reference

### Top-Level Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Agent name |
| `description` | string | ❌ | Agent description |
| `system_prompt` | string | ✅ | System prompt for the agent |
| `model` | string | ✅ | LLM model identifier |
| `tools` | object | ✅ | Tools configuration |
| `metadata` | object | ❌ | UI metadata (avatar, colors, etc.) |

### Tools Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentpress` | object | ✅ | Built-in tools (key: tool_name, value: boolean) |
| `mcp` | array | ✅ | Standard MCP server configurations |
| `custom_mcp` | array | ✅ | Custom MCP server configurations |

### Standard MCP Server Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name |
| `qualifiedName` | string | ✅ | Unique identifier (e.g., "composio.gmail") |
| `config` | object | ✅ | Connection configuration |
| `enabledTools` | array | ✅ | List of enabled tool names |
| `selectedProfileId` | string | ❌ | Credential profile UUID |
| `instructions` | string | ❌ | Usage instructions |

### Custom MCP Server Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name |
| `type` | string | ✅ | Transport: "http" or "sse" |
| `customType` | string | ✅ | Same as type |
| `config` | object | ✅ | Must have `url`, optional `headers` |
| `enabledTools` | array | ✅ | List of enabled tool names |
| `instructions` | string | ❌ | Usage instructions |

### Config Object for Custom MCP

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✅ | Full server URL (http:// or https://) |
| `headers` | object | ❌ | HTTP headers (key-value pairs) |

---

## Common Patterns

### Pattern 1: Multiple Profiles of Same Service

```json
{
  "mcp": [
    {
      "name": "Personal Gmail",
      "qualifiedName": "composio.gmail",
      "config": { "api_key": "personal_key" },
      "enabledTools": ["gmail_send_email"],
      "selectedProfileId": "personal-profile-uuid"
    },
    {
      "name": "Work Gmail",
      "qualifiedName": "composio.gmail",
      "config": { "api_key": "work_key" },
      "enabledTools": ["gmail_send_email"],
      "selectedProfileId": "work-profile-uuid"
    }
  ]
}
```

### Pattern 2: Mix of Standard and Custom

```json
{
  "mcp": [
    {
      "name": "GitHub",
      "qualifiedName": "composio.github",
      "config": { "token": "gh_token" },
      "enabledTools": ["create_issue", "create_pr"]
    }
  ],
  "custom_mcp": [
    {
      "name": "Internal CI/CD",
      "type": "http",
      "customType": "http",
      "config": {
        "url": "https://ci.company.com",
        "headers": {
          "Authorization": "Bearer internal_token"
        }
      },
      "enabledTools": ["trigger_build", "check_status"]
    }
  ]
}
```

### Pattern 3: Podcastfy Service (from your memories)

```json
{
  "custom_mcp": [
    {
      "name": "Podcastfy Service",
      "type": "http",
      "customType": "http",
      "config": {
        "url": "https://varnica-dev-podcastfy.onrender.com",
        "headers": {
          "Authorization": "Bearer your_podcastfy_api_key"
        }
      },
      "enabledTools": [
        "generate_podcast",
        "list_podcasts"
      ],
      "instructions": "Use this to generate podcasts from content"
    }
  ]
}
```

---

## Validation Rules

### Required Validations

1. **`tools.mcp`** must be an array (can be empty)
2. **`tools.custom_mcp`** must be an array (can be empty)
3. Each MCP config must have:
   - `name` (non-empty string)
   - `config` (object)
   - `enabledTools` (array)
4. Standard MCP must have `qualifiedName`
5. Custom MCP must have `type` and `customType`
6. Custom MCP config must have `url` field

### Common Validation Errors

❌ **Missing qualifiedName:**
```json
{
  "name": "Gmail",
  "config": {},
  "enabledTools": []
  // Missing qualifiedName for standard MCP
}
```

❌ **Missing type for custom MCP:**
```json
{
  "name": "My Server",
  "config": { "url": "https://example.com" },
  "enabledTools": []
  // Missing type and customType
}
```

❌ **Missing URL in custom config:**
```json
{
  "name": "My Server",
  "type": "http",
  "config": {
    "headers": {}
    // Missing url field
  },
  "enabledTools": []
}
```

---

## Programmatic Usage

### Python - Creating Config

```python
# Standard MCP
standard_mcp_config = {
    "name": "Gmail",
    "qualifiedName": "composio.gmail",
    "config": {"api_key": "encrypted_key"},
    "enabledTools": ["gmail_send_email"],
    "selectedProfileId": "profile-uuid"
}

# Custom MCP
custom_mcp_config = {
    "name": "My Custom Server",
    "type": "http",
    "customType": "http",
    "config": {
        "url": "https://my-server.com",
        "headers": {
            "Authorization": "Bearer token"
        }
    },
    "enabledTools": ["tool1", "tool2"]
}

# Full agent config
agent_config = {
    "name": "My Agent",
    "system_prompt": "You are helpful...",
    "model": "openrouter/anthropic/sonnet-4",
    "tools": {
        "agentpress": {"search_tool": True},
        "mcp": [standard_mcp_config],
        "custom_mcp": [custom_mcp_config]
    },
    "metadata": {"avatar": "🤖"}
}
```

### TypeScript - Type Definitions

```typescript
interface MCPConfig {
  name: string;
  qualifiedName?: string;
  type?: 'http' | 'sse';
  customType?: 'http' | 'sse';
  config: {
    url?: string;
    headers?: Record<string, string>;
    [key: string]: any;
  };
  enabledTools: string[];
  selectedProfileId?: string;
  instructions?: string;
}

interface AgentTools {
  agentpress: Record<string, boolean>;
  mcp: MCPConfig[];
  custom_mcp: MCPConfig[];
}

interface AgentConfig {
  name: string;
  description?: string;
  system_prompt: string;
  model: string;
  tools: AgentTools;
  metadata?: {
    avatar?: string;
    avatar_color?: string;
    [key: string]: any;
  };
}
```

---

## Summary

### Key Takeaways

1. **Standard MCP** (from profiles): Use `qualifiedName`, goes in `tools.mcp` array
2. **Custom MCP** (your servers): Use `type` + `customType`, goes in `tools.custom_mcp` array
3. **Config object** contains connection details (URL, headers, API keys, etc.)
4. **enabledTools** is always required - list of tool names to enable
5. **Headers are encrypted** before storage (sensitive data is protected)

### Quick Reference

**Standard MCP:**
```json
{"name": "...", "qualifiedName": "...", "config": {...}, "enabledTools": [...]}
```

**Custom MCP:**
```json
{"name": "...", "type": "http", "customType": "http", "config": {"url": "..."}, "enabledTools": [...]}
```

---

## Related Documentation

- **[Connecting MCP Servers →](./CONNECTING_MCP_SERVERS.md)** - How to fill the connection form
- **[MCP Response Format →](./MCP_RESPONSE_QUICK_START.md)** - How servers should respond
- **[MCP Response Guide →](./MCP_RESPONSE_GUIDE.md)** - Deep dive into responses

---

**Need help?** This format is automatically handled by Omni's UI when you connect MCP servers through the interface. You only need to know this format if you're:
- Building integrations
- Programmatically creating agents
- Debugging MCP configurations
- Migrating configurations

For normal use, just use Omni's MCP connection UI! 🚀

