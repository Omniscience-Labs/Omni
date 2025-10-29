#!/usr/bin/env node

/**
 * HTTP wrapper for Klaviyo MCP Server
 * This allows the MCP server to be accessed via HTTP instead of stdio
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import express, { Request, Response } from "express";
import { Readable } from "stream";

// Environment configuration
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const PORT = process.env.PORT || 3010;
const KLAVIYO_API_VERSION = "2024-07-15";
const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";

if (!KLAVIYO_API_KEY) {
  console.error("Error: KLAVIYO_API_KEY environment variable is required");
  process.exit(1);
}

// Create Axios instance
const klaviyoClient: AxiosInstance = axios.create({
  baseURL: KLAVIYO_BASE_URL,
  headers: {
    Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    revision: KLAVIYO_API_VERSION,
    "Content-Type": "application/json",
  },
});

// Define tools (same as stdio version)
const tools: Tool[] = [
  {
    name: "get_profiles",
    description: "Get a list of profiles with optional filtering and pagination",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page (max 100)",
          default: 20,
        },
        filter: {
          type: "string",
          description: "Filter expression (e.g., 'equals(email,\"test@example.com\")')",
        },
      },
    },
  },
  {
    name: "get_profile",
    description: "Get a specific profile by ID",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "The Klaviyo profile ID",
        },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "create_profile",
    description: "Create a new profile in Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Profile email address",
        },
        phone_number: {
          type: "string",
          description: "Profile phone number",
        },
        first_name: {
          type: "string",
          description: "First name",
        },
        last_name: {
          type: "string",
          description: "Last name",
        },
        properties: {
          type: "object",
          description: "Additional custom properties",
        },
      },
    },
  },
  {
    name: "update_profile",
    description: "Update an existing profile",
    inputSchema: {
      type: "object",
      properties: {
        profile_id: {
          type: "string",
          description: "The Klaviyo profile ID",
        },
        email: {
          type: "string",
          description: "Profile email address",
        },
        phone_number: {
          type: "string",
          description: "Profile phone number",
        },
        first_name: {
          type: "string",
          description: "First name",
        },
        last_name: {
          type: "string",
          description: "Last name",
        },
        properties: {
          type: "object",
          description: "Additional custom properties",
        },
      },
      required: ["profile_id"],
    },
  },
  {
    name: "get_lists",
    description: "Get all lists in Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page",
          default: 20,
        },
      },
    },
  },
  {
    name: "get_list",
    description: "Get a specific list by ID",
    inputSchema: {
      type: "object",
      properties: {
        list_id: {
          type: "string",
          description: "The Klaviyo list ID",
        },
      },
      required: ["list_id"],
    },
  },
  {
    name: "create_list",
    description: "Create a new list in Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "List name",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "add_profiles_to_list",
    description: "Add profiles to a list",
    inputSchema: {
      type: "object",
      properties: {
        list_id: {
          type: "string",
          description: "The Klaviyo list ID",
        },
        profile_ids: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Array of profile IDs to add",
        },
      },
      required: ["list_id", "profile_ids"],
    },
  },
  {
    name: "create_event",
    description: "Create a new event in Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        event_name: {
          type: "string",
          description: "Name of the event (e.g., 'Placed Order')",
        },
        profile_email: {
          type: "string",
          description: "Email of the profile",
        },
        profile_id: {
          type: "string",
          description: "ID of the profile (alternative to email)",
        },
        properties: {
          type: "object",
          description: "Event properties",
        },
        time: {
          type: "string",
          description: "ISO 8601 timestamp (defaults to now)",
        },
      },
      required: ["event_name"],
    },
  },
  {
    name: "get_campaigns",
    description: "Get a list of campaigns",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page",
          default: 20,
        },
        filter: {
          type: "string",
          description: "Filter expression",
        },
      },
    },
  },
  {
    name: "get_campaign",
    description: "Get a specific campaign by ID",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "The Klaviyo campaign ID",
        },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "get_flows",
    description: "Get a list of flows",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page",
          default: 20,
        },
      },
    },
  },
  {
    name: "get_segments",
    description: "Get a list of segments",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page",
          default: 20,
        },
      },
    },
  },
  {
    name: "get_metrics",
    description: "Get a list of metrics",
    inputSchema: {
      type: "object",
      properties: {
        page_cursor: {
          type: "string",
          description: "Cursor for pagination",
        },
        page_size: {
          type: "number",
          description: "Number of results per page",
          default: 20,
        },
      },
    },
  },
];

// Tool handler (same as stdio version)
async function handleToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case "get_profiles": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;
        if (args.filter) params.filter = args.filter;

        const response = await klaviyoClient.get("/profiles", { params });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_profile": {
        const response = await klaviyoClient.get(`/profiles/${args.profile_id}`);
        return JSON.stringify(response.data, null, 2);
      }

      case "create_profile": {
        const profileData: any = {
          type: "profile",
          attributes: {},
        };

        if (args.email) profileData.attributes.email = args.email;
        if (args.phone_number) profileData.attributes.phone_number = args.phone_number;
        if (args.first_name) profileData.attributes.first_name = args.first_name;
        if (args.last_name) profileData.attributes.last_name = args.last_name;
        if (args.properties) profileData.attributes.properties = args.properties;

        const response = await klaviyoClient.post("/profiles", { data: profileData });
        return JSON.stringify(response.data, null, 2);
      }

      case "update_profile": {
        const profileData: any = {
          type: "profile",
          id: args.profile_id,
          attributes: {},
        };

        if (args.email) profileData.attributes.email = args.email;
        if (args.phone_number) profileData.attributes.phone_number = args.phone_number;
        if (args.first_name) profileData.attributes.first_name = args.first_name;
        if (args.last_name) profileData.attributes.last_name = args.last_name;
        if (args.properties) profileData.attributes.properties = args.properties;

        const response = await klaviyoClient.patch(`/profiles/${args.profile_id}`, { data: profileData });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_lists": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;

        const response = await klaviyoClient.get("/lists", { params });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_list": {
        const response = await klaviyoClient.get(`/lists/${args.list_id}`);
        return JSON.stringify(response.data, null, 2);
      }

      case "create_list": {
        const listData = {
          type: "list",
          attributes: {
            name: args.name,
          },
        };

        const response = await klaviyoClient.post("/lists", { data: listData });
        return JSON.stringify(response.data, null, 2);
      }

      case "add_profiles_to_list": {
        const relationships = args.profile_ids.map((id: string) => ({
          type: "profile",
          id: id,
        }));

        const response = await klaviyoClient.post(
          `/lists/${args.list_id}/relationships/profiles`,
          { data: relationships }
        );
        return JSON.stringify({ success: true, message: "Profiles added to list" }, null, 2);
      }

      case "create_event": {
        const eventData: any = {
          type: "event",
          attributes: {
            metric: {
              data: {
                type: "metric",
                attributes: {
                  name: args.event_name,
                },
              },
            },
            properties: args.properties || {},
            time: args.time || new Date().toISOString(),
          },
        };

        if (args.profile_email) {
          eventData.attributes.profile = {
            data: {
              type: "profile",
              attributes: {
                email: args.profile_email,
              },
            },
          };
        } else if (args.profile_id) {
          eventData.attributes.profile = {
            data: {
              type: "profile",
              id: args.profile_id,
            },
          };
        }

        const response = await klaviyoClient.post("/events", { data: eventData });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_campaigns": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;
        if (args.filter) params.filter = args.filter;

        const response = await klaviyoClient.get("/campaigns", { params });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_campaign": {
        const response = await klaviyoClient.get(`/campaigns/${args.campaign_id}`);
        return JSON.stringify(response.data, null, 2);
      }

      case "get_flows": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;

        const response = await klaviyoClient.get("/flows", { params });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_segments": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;

        const response = await klaviyoClient.get("/segments", { params });
        return JSON.stringify(response.data, null, 2);
      }

      case "get_metrics": {
        const params: any = {};
        if (args.page_cursor) params["page[cursor]"] = args.page_cursor;
        if (args.page_size) params["page[size]"] = args.page_size;

        const response = await klaviyoClient.get("/metrics", { params });
        return JSON.stringify(response.data, null, 2);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.errors?.[0]?.detail || error.message;
      throw new Error(`Klaviyo API error: ${errorMessage}`);
    }
    throw error;
  }
}

// Create MCP server
const mcpServer = new Server(
  {
    name: "klaviyo-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleToolCall(name, args || {});
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  };
});

// Create Express app
const app = express();
app.use(express.json());

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "healthy", service: "klaviyo-mcp-server" });
});

// Store active transports
const activeTransports = new Map<string, SSEServerTransport>();

// SSE endpoint for MCP
app.get("/sse", async (req: Request, res: Response) => {
  console.log("New SSE connection established");
  
  try {
    // Create transport with the response object
    // Let SSEServerTransport set its own headers
    const transport = new SSEServerTransport("/message", res);
    
    // Store transport with a unique ID
    const transportId = Date.now().toString() + Math.random().toString(36);
    activeTransports.set(transportId, transport);
    
    // Connect the MCP server to this transport
    // This will trigger transport.start() which sets headers
    await mcpServer.connect(transport);
    
    console.log("MCP server connected to SSE transport");
    
    // Handle client disconnect
    req.on("close", () => {
      console.log("SSE connection closed");
      activeTransports.delete(transportId);
    });

    req.on("error", (error) => {
      console.error("SSE connection error:", error);
      activeTransports.delete(transportId);
    });

  } catch (error) {
    console.error("Error setting up SSE transport:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish SSE connection" });
    }
  }
});

// Message endpoint for MCP (handled by SSE transport)
app.post("/message", async (req: Request, res: Response) => {
  try {
    // The SSE transport handles the actual message processing
    // We just need to acknowledge receipt
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error handling message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Klaviyo MCP Server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/sse`);
});

