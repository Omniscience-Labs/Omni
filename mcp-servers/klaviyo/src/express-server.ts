#!/usr/bin/env node

/**
 * Simple Express API for Klaviyo (like your friend's working version!)
 * No MCP SDK complexity - just HTTP endpoints
 */

import express, { Request, Response } from "express";
import axios, { AxiosInstance } from "axios";

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

// Tool definitions for discovery
const tools = [
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
    name: "create_profile",
    description: "Create a new customer profile",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Email address" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone_number: { type: "string" }
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
async function invokeTool(tool: string, params: any): Promise<any> {
  try {
    switch (tool) {
      case "get_lists": {
        const queryParams: any = {};
        if (params.page_size) queryParams["page[size]"] = params.page_size;
        const response = await klaviyoClient.get("/lists", { params: queryParams });
        return {
          status: "ok",
          count: response.data.data?.length || 0,
          lists: response.data.data
        };
      }

      case "get_profiles": {
        const queryParams: any = {};
        if (params.page_size) queryParams["page[size]"] = params.page_size;
        if (params.filter) queryParams.filter = params.filter;
        const response = await klaviyoClient.get("/profiles", { params: queryParams });
        return {
          status: "ok",
          count: response.data.data?.length || 0,
          profiles: response.data.data
        };
      }

      case "create_profile": {
        const profileData = {
          type: "profile",
          attributes: {
            email: params.email,
            first_name: params.first_name,
            last_name: params.last_name,
            phone_number: params.phone_number
          }
        };
        const response = await klaviyoClient.post("/profiles", { data: profileData });
        return {
          status: "ok",
          profile: response.data.data
        };
      }

      case "get_campaigns": {
        const response = await klaviyoClient.get("/campaigns");
        return {
          status: "ok",
          count: response.data.data?.length || 0,
          campaigns: response.data.data
        };
      }

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.errors?.[0]?.detail || error.message;
      return {
        status: "error",
        error: `Klaviyo API error: ${errorMessage}`
      };
    }
    return {
      status: "error",
      error: error.message
    };
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
  res.json({ 
    status: "healthy", 
    service: "klaviyo-api",
    tools: tools.length
  });
});

// List available tools
app.get("/tools", (req: Request, res: Response) => {
  res.json({ tools });
});

// Invoke a tool (like your friend's /invokeTool endpoint!)
app.post("/invokeTool", async (req: Request, res: Response) => {
  const { tool, params } = req.body;

  console.log(`🔧 Tool invoked: ${tool}`);

  if (!tool) {
    return res.status(400).json({
      status: "error",
      error: "Tool name is required"
    });
  }

  try {
    const result = await invokeTool(tool, params || {});
    res.json({
      tool,
      result
    });
  } catch (error: any) {
    res.status(500).json({
      tool,
      result: {
        status: "error",
        error: error.message
      }
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Klaviyo API Server listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Tools: http://localhost:${PORT}/tools`);
  console.log(`   Invoke: POST http://localhost:${PORT}/invokeTool`);
  console.log(`\n📋 ${tools.length} tools available`);
});

