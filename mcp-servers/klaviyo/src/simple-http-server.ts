#!/usr/bin/env node

/**
 * Simple HTTP MCP Server for Klaviyo
 * Direct JSON-RPC implementation (like your friend's working version!)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import express, { Request, Response } from "express";
import { Readable, Writable } from "stream";

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

// Define tools
const tools: Tool[] = [
  {
    name: "get_lists",
    description: "Get all lists in Klaviyo",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_profiles",
    description: "Get profiles from Klaviyo",
    inputSchema: { type: "object", properties: { page_size: { type: "number" } } },
  },
  {
    name: "get_campaigns",
    description: "Get campaigns from Klaviyo",
    inputSchema: { type: "object", properties: {} },
  },
];

// Tool handler
async function handleToolCall(name: string, args: any): Promise<string> {
  try {
    switch (name) {
      case "get_lists": {
        const response = await klaviyoClient.get("/lists");
        return JSON.stringify(response.data, null, 2);
      }
      case "get_profiles": {
        const params: any = {};
        if (args.page_size) params["page[size]"] = args.page_size;
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
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "healthy", service: "klaviyo-mcp-server" });
});

// MCP tools/list endpoint
app.post("/mcp/tools/list", async (req: Request, res: Response) => {
  console.log("Tools list requested");
  res.json({ tools });
});

// MCP tools/call endpoint
app.post("/mcp/tools/call", async (req: Request, res: Response) => {
  const { name, arguments: args } = req.body;
  console.log(`Tool call: ${name}`);
  
  try {
    const result = await handleToolCall(name, args || {});
    res.json({
      content: [{ type: "text", text: result }]
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Klaviyo MCP Server listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Tools: http://localhost:${PORT}/mcp/tools/list`);
});

