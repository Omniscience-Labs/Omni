#!/usr/bin/env node

/**
 * Proper MCP HTTP Server using SDK's built-in transports
 * This matches what Omni's backend expects!
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamablehttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import express from "express";

// Environment configuration
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const PORT = process.env.PORT || 3010;
const KLAVIYO_API_VERSION = "2024-07-15";
const KLAVIYO_BASE_URL = "https://a.klaviyo.com/api";

if (!KLAVIYO_API_KEY) {
  console.error("Error: KLAVIYO_API_KEY environment variable is required");
  process.exit(1);
}

// Create Klaviyo client
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
    name: "get_lists",
    description: "Get all lists from Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        page_size: { type: "number", description: "Number of results (max 100)" }
      }
    }
  },
  {
    name: "get_profiles",
    description: "Get customer profiles from Klaviyo",
    inputSchema: {
      type: "object",
      properties: {
        page_size: { type: "number", description: "Number of results (max 100)" },
        filter: { type: "string", description: "Filter expression" }
      }
    }
  },
  {
    name: "get_campaigns",
    description: "Get email campaigns from Klaviyo",
    inputSchema: { type: "object", properties: {} }
  }
];

// Tool handler
async function handleToolCall(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "get_lists": {
        const params: any = {};
        if (args.page_size) params["page[size]"] = args.page_size;
        const response = await klaviyoClient.get("/lists", { params });
        return JSON.stringify(response.data, null, 2);
      }
      case "get_profiles": {
        const params: any = {};
        if (args.page_size) params["page[size]"] = args.page_size;
        if (args.filter) params.filter = args.filter;
        const response = await klaviyoClient.get("/profiles", { params });
        return JSON.stringify(response.data, null, 2);
      }
      case "get_campaigns": {
        const response = await klaviyoClient.get("/campaigns");
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
  { name: "klaviyo-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleToolCall(name, args || {});
  return { content: [{ type: "text", text: result }] };
});

// Create Express app
const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "klaviyo-mcp-server", tools: tools.length });
});

// MCP endpoints - match what Omni expects
app.get("/mcp", async (req: Request, res: Response) => {
  console.log("MCP GET request");

  // Return MCP server info for discovery
  res.json({
    protocolVersion: "1.0",
    serverInfo: {
      name: "klaviyo-mcp-server",
      version: "1.0.0"
    },
    capabilities: {
      tools: {}
    }
  });
});

app.post("/mcp", async (req: Request, res: Response) => {
  console.log(`MCP POST request: ${req.body.method}`);

  try {
    const message = req.body;

    if (message.method === 'initialize') {
      // Return server capabilities
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "1.0",
          serverInfo: {
            name: "klaviyo-mcp-server",
            version: "1.0.0"
          },
          capabilities: {
            tools: {}
          }
        }
      });

    } else if (message.method === 'tools/list') {
      // Return available tools
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: tools
        }
      });

    } else if (message.method === 'tools/call') {
      // Execute tool
      const { name, arguments: args } = message.params;

      if (!tools.find(t => t.name === name)) {
        res.status(400).json({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        });
        return;
      }

      // Call Klaviyo API
      const result = await handleToolCall(name, args || {});

      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        }
      });

    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Unknown method: ${message.method}`
        }
      });
    }

  } catch (error: any) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: message?.id,
        error: {
          code: -32603,
          message: `Server error: ${error.message}`
        }
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Klaviyo MCP Server (HTTP) listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   MCP: http://localhost:${PORT}/`);
  console.log(`\n📋 ${tools.length} tools available`);
});

