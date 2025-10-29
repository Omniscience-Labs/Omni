#!/usr/bin/env node

/**
 * MCP Client for Klaviyo Integration
 * Acts as a bridge between Claude Desktop and the Klaviyo MCP server
 * Based on your friend's working implementation
 */

import https from 'https';
import http from 'http';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3010';
const MCP_API_KEY = process.env.MCP_API_KEY;

// Parse URL
const serverUrl = new URL(MCP_SERVER_URL);
const isHttps = serverUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

// Tool definitions
const tools = {
  get_lists: {
    name: "get_lists",
    description: "Get all Klaviyo lists with their details and profile counts",
    inputSchema: {
      type: "object",
      properties: {
        page_size: {
          type: "number",
          description: "Number of lists to return (max 100, default 20)"
        }
      }
    }
  },
  get_profiles: {
    name: "get_profiles",
    description: "Get Klaviyo profiles with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        page_size: {
          type: "number",
          description: "Number of profiles to return (max 100, default 20)"
        },
        filter: {
          type: "string",
          description: "Filter expression (e.g., 'equals(email,\"user@example.com\")')"
        }
      }
    }
  },
  create_profile: {
    name: "create_profile",
    description: "Create a new Klaviyo profile",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Email address for the profile"
        },
        first_name: {
          type: "string",
          description: "First name"
        },
        last_name: {
          type: "string",
          description: "Last name"
        },
        phone_number: {
          type: "string",
          description: "Phone number"
        }
      }
    }
  },
  create_list: {
    name: "create_list",
    description: "Create a new Klaviyo list",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the list"
        }
      },
      required: ["name"]
    }
  },
  get_campaigns: {
    name: "get_campaigns",
    description: "Get Klaviyo email campaigns",
    inputSchema: {
      type: "object",
      properties: {
        page_size: {
          type: "number",
          description: "Number of campaigns to return (max 100, default 20)"
        }
      }
    }
  }
} as const;

// Handle MCP protocol messages
process.stdin.on('data', async (data) => {
  try {
    const message = JSON.parse(data.toString());

    if (message.method === 'initialize') {
      // Return server capabilities
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "1.0",
          serverInfo: {
            name: "klaviyo-mcp-client",
            version: "1.0.0"
          },
          capabilities: {
            tools: {}
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');

    } else if (message.method === 'tools/list') {
      // Return available tools
      const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: Object.values(tools)
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');

    } else if (message.method === 'tools/call') {
      // Execute tool
      const { name, arguments: args } = message.params;

      if (!(name in tools)) {
        const error = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`
          }
        };
        process.stdout.write(JSON.stringify(error) + '\n');
        return;
      }

      // Call our MCP server
      const postData = JSON.stringify({
        tool: name,
        params: args || {}
      });

      const headers: any = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      };

      if (MCP_API_KEY) {
        headers['x-api-key'] = MCP_API_KEY;
      }

      const options = {
        hostname: serverUrl.hostname,
        port: serverUrl.port || (isHttps ? 443 : 80),
        path: '/invokeTool',
        method: 'POST',
        headers
      };

      const req = httpModule.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);

            const response = {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (e: any) {
            const error = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32603,
                message: `Failed to parse server response: ${e.message || e}`
              }
            };
            process.stdout.write(JSON.stringify(error) + '\n');
          }
        });
      });

      req.on('error', (e) => {
        const error = {
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: `Server request failed: ${e.message}`
          }
        };
        process.stdout.write(JSON.stringify(error) + '\n');
      });

      req.write(postData);
      req.end();
    }

  } catch (e) {
    console.error('Error processing message:', e);
  }
});

// Keep process alive
process.stdin.resume();
