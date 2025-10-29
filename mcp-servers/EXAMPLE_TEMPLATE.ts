/**
 * Example MCP Server Template for Omni (TypeScript)
 * ==================================================
 * 
 * This is a reference implementation showing how to return responses
 * that Omni will process correctly.
 * 
 * Copy this template and modify it for your use case!
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MCPResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  image?: string;
  author?: string;
  date?: string;
}

// ============================================================================
// RESPONSE FORMATTER CLASS
// ============================================================================

export class MCPToolResponseFormatter {
  /**
   * Format a successful response
   */
  static success(data: any, message?: string): MCPResponse {
    const responseData: any = {
      success: true,
      data: data
    };
    
    if (message) {
      responseData.message = message;
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(responseData, null, 2)
      }]
    };
  }

  /**
   * Format an error response
   */
  static error(errorMessage: string, code?: string, details?: any): MCPResponse {
    const errorData: any = {
      error: errorMessage
    };
    
    if (code) {
      errorData.code = code;
    }
    if (details) {
      errorData.details = details;
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(errorData, null, 2)
      }]
    };
  }

  /**
   * Format search results (renders as cards in Omni)
   */
  static searchResults(results: SearchResult[], total?: number): MCPResponse {
    const response: any = { results };
    if (total !== undefined) {
      response.total = total;
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(response, null, 2)
      }]
    };
  }

  /**
   * Format tabular data (renders as table in Omni)
   */
  static tableData(rows: Record<string, any>[], columns?: string[]): MCPResponse {
    let response: any = rows;
    
    // Optionally wrap with metadata
    if (columns) {
      response = {
        columns: columns,
        data: rows
      };
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(response, null, 2)
      }]
    };
  }

  /**
   * Format markdown content
   */
  static markdown(markdownContent: string): MCPResponse {
    return {
      content: [{
        type: "text",
        text: markdownContent
      }]
    };
  }

  /**
   * Format plain text response
   */
  static plainText(text: string): MCPResponse {
    return {
      content: [{
        type: "text",
        text: text
      }]
    };
  }
}

// ============================================================================
// EXAMPLE TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Example: Search tool that returns formatted results
 * Omni will render this as beautiful search result cards!
 */
export async function exampleSearchTool(query: string, limit: number = 10): Promise<MCPResponse> {
  try {
    // Your search logic here
    const results: SearchResult[] = [
      {
        title: "Example Result 1",
        url: "https://example.com/result1",
        description: "This is a description of the first result",
        image: "https://example.com/images/result1.jpg",
        author: "John Doe",
        date: "2024-01-15"
      },
      {
        title: "Example Result 2",
        url: "https://example.com/result2",
        description: "This is a description of the second result",
        // image is optional
        author: "Jane Smith",
        date: "2024-01-14"
      }
    ];
    
    return MCPToolResponseFormatter.searchResults(results, results.length);
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      "SEARCH_ERROR"
    );
  }
}

/**
 * Example: List tool that returns tabular data
 * Omni will render this as a sortable table!
 */
export async function exampleListItemsTool(category?: string): Promise<MCPResponse> {
  try {
    // Your list logic here
    let items = [
      {
        id: "item_1",
        name: "Item One",
        status: "active",
        created: "2024-01-15",
        count: 42
      },
      {
        id: "item_2",
        name: "Item Two",
        status: "pending",
        created: "2024-01-14",
        count: 17
      },
      {
        id: "item_3",
        name: "Item Three",
        status: "active",
        created: "2024-01-13",
        count: 89
      }
    ];
    
    if (category) {
      // Filter by category if provided
      items = items.filter(item => (item as any).category === category);
    }
    
    return MCPToolResponseFormatter.tableData(
      items,
      ["id", "name", "status", "created", "count"]
    );
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Failed to list items: ${error instanceof Error ? error.message : String(error)}`,
      "LIST_ERROR"
    );
  }
}

/**
 * Example: Create tool that returns a success message
 */
export async function exampleCreateTool(
  name: string, 
  config: Record<string, any>
): Promise<MCPResponse> {
  try {
    // Your creation logic here
    const createdItem = {
      id: "new_item_123",
      name: name,
      config: config,
      status: "created",
      created_at: "2024-01-15T10:30:00Z"
    };
    
    // Return as markdown for rich formatting
    const markdownResponse = `
# ✅ Successfully Created!

Your item **${name}** has been created.

## Details
- **ID:** \`${createdItem.id}\`
- **Status:** ${createdItem.status}
- **Created:** ${createdItem.created_at}

## Configuration
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

You can now use this item with ID: \`${createdItem.id}\`
`;
    
    return MCPToolResponseFormatter.markdown(markdownResponse);
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Failed to create item: ${error instanceof Error ? error.message : String(error)}`,
      "CREATE_ERROR",
      { name, config }
    );
  }
}

/**
 * Example: Status check tool that returns structured data
 */
export async function exampleStatusTool(itemId: string): Promise<MCPResponse> {
  try {
    // Your status check logic here
    const statusData = {
      item_id: itemId,
      status: "running",
      progress: 75,
      metrics: {
        processed: 750,
        total: 1000,
        errors: 2
      },
      last_updated: "2024-01-15T10:30:00Z"
    };
    
    return MCPToolResponseFormatter.success(
      statusData,
      `Status retrieved for ${itemId}`
    );
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      "STATUS_ERROR"
    );
  }
}

/**
 * Example: Analytics tool that returns rich data
 * Omni will format this as expandable JSON with nice styling!
 */
export async function exampleAnalyticsTool(
  metric: string, 
  period: string = "7d"
): Promise<MCPResponse> {
  try {
    // Your analytics logic here
    const analytics = {
      metric: metric,
      period: period,
      summary: {
        total: 12500,
        average: 1785,
        change: "+15.3%"
      },
      daily_breakdown: [
        { date: "2024-01-15", value: 2100 },
        { date: "2024-01-14", value: 1950 },
        { date: "2024-01-13", value: 1800 },
        { date: "2024-01-12", value: 1700 },
        { date: "2024-01-11", value: 1650 },
        { date: "2024-01-10", value: 1600 },
        { date: "2024-01-09", value: 1700 }
      ],
      top_sources: [
        { source: "organic", count: 5500, percentage: 44 },
        { source: "direct", count: 3750, percentage: 30 },
        { source: "referral", count: 2000, percentage: 16 },
        { source: "social", count: 1250, percentage: 10 }
      ]
    };
    
    return MCPToolResponseFormatter.success(
      analytics,
      `Analytics for ${metric} over ${period}`
    );
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Failed to fetch analytics: ${error instanceof Error ? error.message : String(error)}`,
      "ANALYTICS_ERROR"
    );
  }
}

/**
 * Example: Simple action with plain text response
 */
export async function exampleSimpleActionTool(action: string): Promise<MCPResponse> {
  try {
    // Your action logic here
    const result = `✅ Action '${action}' completed successfully at 2024-01-15 10:30:00`;
    
    return MCPToolResponseFormatter.plainText(result);
    
  } catch (error) {
    return MCPToolResponseFormatter.error(
      `Action failed: ${error instanceof Error ? error.message : String(error)}`,
      "ACTION_ERROR"
    );
  }
}

// ============================================================================
// USAGE IN YOUR MCP SERVER (Example with @modelcontextprotocol/sdk)
// ============================================================================

/**
 * Example usage with the official MCP SDK:
 * 
 * ```typescript
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 * import { MCPToolResponseFormatter } from "./response-formatter";
 * 
 * const server = new Server(
 *   {
 *     name: "your-server-name",
 *     version: "1.0.0",
 *   },
 *   {
 *     capabilities: {
 *       tools: {},
 *     },
 *   }
 * );
 * 
 * // List available tools
 * server.setRequestHandler(ListToolsRequestSchema, async () => ({
 *   tools: [
 *     {
 *       name: "search",
 *       description: "Search for items",
 *       inputSchema: {
 *         type: "object",
 *         properties: {
 *           query: { type: "string" },
 *           limit: { type: "integer" }
 *         },
 *         required: ["query"]
 *       }
 *     }
 *   ]
 * }));
 * 
 * // Handle tool calls
 * server.setRequestHandler(CallToolRequestSchema, async (request) => {
 *   const { name, arguments: args } = request.params;
 *   
 *   switch (name) {
 *     case "search":
 *       return await exampleSearchTool(
 *         args.query as string,
 *         args.limit as number || 10
 *       );
 *     
 *     case "list":
 *       return await exampleListItemsTool(args.category as string);
 *     
 *     case "create":
 *       return await exampleCreateTool(
 *         args.name as string,
 *         args.config as Record<string, any>
 *       );
 *     
 *     default:
 *       return MCPToolResponseFormatter.error(
 *         `Unknown tool: ${name}`,
 *         "UNKNOWN_TOOL"
 *       );
 *   }
 * });
 * 
 * // Start server
 * const transport = new StdioServerTransport();
 * await server.connect(transport);
 * ```
 */

// ============================================================================
// USAGE WITH HTTP/SSE SERVER (Example with Express)
// ============================================================================

/**
 * Example usage with HTTP server:
 * 
 * ```typescript
 * import express from 'express';
 * import { MCPToolResponseFormatter } from "./response-formatter";
 * 
 * const app = express();
 * app.use(express.json());
 * 
 * // Health check
 * app.get('/health', (req, res) => {
 *   res.json({ status: 'healthy', service: 'your-mcp-server' });
 * });
 * 
 * // List tools
 * app.get('/tools', (req, res) => {
 *   res.json({
 *     tools: [
 *       {
 *         name: "search",
 *         description: "Search for items",
 *         inputSchema: {
 *           type: "object",
 *           properties: {
 *             query: { type: "string" },
 *             limit: { type: "integer" }
 *           },
 *           required: ["query"]
 *         }
 *       }
 *     ]
 *   });
 * });
 * 
 * // Call tool
 * app.post('/tools/call', async (req, res) => {
 *   const { name, arguments: args } = req.body;
 *   
 *   try {
 *     let result;
 *     
 *     switch (name) {
 *       case "search":
 *         result = await exampleSearchTool(args.query, args.limit);
 *         break;
 *       
 *       case "list":
 *         result = await exampleListItemsTool(args.category);
 *         break;
 *       
 *       default:
 *         result = MCPToolResponseFormatter.error(
 *           `Unknown tool: ${name}`,
 *           "UNKNOWN_TOOL"
 *         );
 *     }
 *     
 *     res.json(result);
 *   } catch (error) {
 *     res.status(500).json(
 *       MCPToolResponseFormatter.error(
 *         error instanceof Error ? error.message : String(error),
 *         "INTERNAL_ERROR"
 *       )
 *     );
 *   }
 * });
 * 
 * app.listen(3010, () => {
 *   console.log('MCP server running on http://localhost:3010');
 * });
 * ```
 */

// ============================================================================
// TESTING YOUR RESPONSES
// ============================================================================

if (require.main === module) {
  console.log("=== Testing MCP Response Formats ===\n");
  
  // Test all example functions
  (async () => {
    console.log("1. Search Results:");
    console.log(JSON.stringify(await exampleSearchTool("test query"), null, 2));
    console.log("\n" + "=".repeat(50) + "\n");
    
    console.log("2. Table Data:");
    console.log(JSON.stringify(await exampleListItemsTool(), null, 2));
    console.log("\n" + "=".repeat(50) + "\n");
    
    console.log("3. Markdown Response:");
    console.log(JSON.stringify(await exampleCreateTool("My Item", { key: "value" }), null, 2));
    console.log("\n" + "=".repeat(50) + "\n");
    
    console.log("4. Structured Data:");
    console.log(JSON.stringify(await exampleStatusTool("item_123"), null, 2));
    console.log("\n" + "=".repeat(50) + "\n");
    
    console.log("5. Error Response:");
    console.log(JSON.stringify(
      MCPToolResponseFormatter.error("Something went wrong", "VALIDATION_ERROR"),
      null,
      2
    ));
  })();
}



