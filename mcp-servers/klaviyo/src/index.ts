#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { z } from "zod";

// Environment configuration
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_API_VERSION = "2024-07-15";
const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";

if (!KLAVIYO_API_KEY) {
  console.error("Error: KLAVIYO_API_KEY environment variable is required");
  process.exit(1);
}

// Create Axios instance with default configuration
const klaviyoClient: AxiosInstance = axios.create({
  baseURL: KLAVIYO_BASE_URL,
  headers: {
    Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    revision: KLAVIYO_API_VERSION,
    "Content-Type": "application/json",
  },
});

// Define tools
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

// Tool handler
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

// Create and start server
const server = new Server(
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

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Klaviyo MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

