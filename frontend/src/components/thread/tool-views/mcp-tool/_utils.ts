import { Search, Code, FileText, Network, Database, Server } from 'lucide-react';

export interface MCPResult {
  success: boolean;
  data: any;
  isError?: boolean;
  content?: string;
  mcp_metadata?: {
    server_name: string;
    tool_name: string;
    full_tool_name: string;
    arguments_count: number;
    is_mcp_tool: boolean;
  };
  error_type?: string;
  raw_result?: any;
}

export interface ParsedMCPTool {
  serverName: string;
  toolName: string;
  fullToolName: string;
  displayName: string;
  arguments: Record<string, any>;
}

function extractFromNewFormat(toolContent: string | object): MCPResult | null {
  try {
    let parsed: any;
    
    if (typeof toolContent === 'string') {
      parsed = JSON.parse(toolContent);
    } else {
      parsed = toolContent;
    }

    if (parsed && typeof parsed === 'object' && 'tool_execution' in parsed) {
      const toolExecution = parsed.tool_execution;
      
      if (toolExecution && typeof toolExecution === 'object' && 'result' in toolExecution) {
        const result = toolExecution.result;
        const success = result.success === true;
        let output = result.output;

        if (typeof output === 'string') {
          try {
            output = JSON.parse(output);
          } catch (e) {
          }
        }

        const args = toolExecution.arguments || {};
        const toolName = args.tool_name || 'unknown_mcp_tool';
        const toolArgs = args.arguments || {};
        
        const parts = toolName.split('_');
        const serverName = parts.length > 1 ? parts[1] : 'unknown';
        const actualToolName = parts.length > 2 ? parts.slice(2).join('_') : toolName;

        return {
          success,
          data: output,
          isError: !success,
          content: output,
          mcp_metadata: {
            server_name: serverName,
            tool_name: actualToolName,
            full_tool_name: toolName,
            arguments_count: Object.keys(toolArgs).length,
            is_mcp_tool: true
          }
        };
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function extractFromLegacyFormat(toolContent: string): MCPResult | null {
  try {
    const toolResultMatch = toolContent.match(/ToolResult\(success=(\w+),\s*output='([\s\S]*)'\)/);
    if (toolResultMatch) {
      const isSuccess = toolResultMatch[1] === 'True';
      let output = toolResultMatch[2];
      
      output = output.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
      
      return {
        success: isSuccess,
        data: output,
        isError: !isSuccess,
        content: output
      };
    }

    const xmlMatch = toolContent.match(/<tool_result>\s*<call-mcp-tool>\s*([\s\S]*?)\s*<\/call-mcp-tool>\s*<\/tool_result>/);
    if (xmlMatch && xmlMatch[1]) {
      const innerContent = xmlMatch[1].trim();
      
      try {
        const parsed = JSON.parse(innerContent);
        
        if (parsed.mcp_metadata) {
          let actualContent = parsed.content;
          if (typeof actualContent === 'string') {
            try {
              actualContent = JSON.parse(actualContent);
            } catch (e) {
            }
          }
          
          return {
            success: !parsed.isError,
            data: actualContent,
            isError: parsed.isError,
            content: actualContent,
            mcp_metadata: parsed.mcp_metadata,
            error_type: parsed.error_type,
            raw_result: parsed.raw_result
          };
        }
        
        return {
          success: !parsed.isError,
          data: parsed.content || parsed,
          isError: parsed.isError,
          content: parsed.content
        };
      } catch (e) {
        return {
          success: true,
          data: innerContent,
          content: innerContent
        };
      }
    }

    const parsed = JSON.parse(toolContent);
    
    if (parsed.mcp_metadata) {
      let actualContent = parsed.content;
      if (typeof actualContent === 'string') {
        try {
          actualContent = JSON.parse(actualContent);
        } catch (e) {
        }
      }
      
      return {
        success: !parsed.isError,
        data: actualContent,
        isError: parsed.isError,
        content: actualContent,
        mcp_metadata: parsed.mcp_metadata,
        error_type: parsed.error_type,
        raw_result: parsed.raw_result
      };
    }
    
    return {
      success: !parsed.isError,
      data: parsed.content || parsed,
      isError: parsed.isError,
      content: parsed.content
    };
  } catch (e) {
    return null;
  }
}

export function parseMCPResult(toolContent: string | object | undefined): MCPResult {
  if (!toolContent) {
    return {
      success: true,
      data: '',
      content: ''
    };
  }

  const newFormatResult = extractFromNewFormat(toolContent);
  if (newFormatResult) {
    return newFormatResult;
  }

  if (typeof toolContent === 'string') {
    const legacyResult = extractFromLegacyFormat(toolContent);
    if (legacyResult) {
      return legacyResult;
    }
  }

  const content = typeof toolContent === 'string' ? toolContent : JSON.stringify(toolContent);
  return {
    success: true,
    data: content,
    content: content
  };
}

export function parseMCPToolCall(assistantContent: string): ParsedMCPTool {
  try {
    const toolNameMatch = assistantContent.match(/tool_name="([^"]+)"/);
    const fullToolName = toolNameMatch ? toolNameMatch[1] : 'unknown_mcp_tool';
    
    const contentMatch = assistantContent.match(/<call-mcp-tool[^>]*>([\s\S]*?)<\/call-mcp-tool>/);
    let args = {};
    
    if (contentMatch && contentMatch[1]) {
      try {
        args = JSON.parse(contentMatch[1].trim());
      } catch (e) {
        args = { raw: contentMatch[1].trim() };
      }
    }
    
    const parts = fullToolName.split('_');
    const serverName = parts.length > 1 ? parts[1] : 'unknown';
    const toolName = parts.length > 2 ? parts.slice(2).join('_') : fullToolName;
    
    const serverDisplayName = serverName.charAt(0).toUpperCase() + serverName.slice(1);
    const toolDisplayName = toolName.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    return {
      serverName,
      toolName,
      fullToolName,
      displayName: `${serverDisplayName}: ${toolDisplayName}`,
      arguments: args
    };
  } catch (e) {
    return {
      serverName: 'unknown',
      toolName: 'unknown',
      fullToolName: 'unknown_mcp_tool',
      displayName: 'MCP Tool',
      arguments: {}
    };
  }
}

export function getMCPServerIcon(serverName: string) {
  switch (serverName.toLowerCase()) {
    case 'exa':
      return Search;
    case 'github':
      return Code;
    case 'notion':
      return FileText;
    case 'slack':
      return Network;
    case 'filesystem':
      return Database;
    default:
      return Server;
  }
}

export function getMCPServerColor(serverName: string) {
  switch (serverName.toLowerCase()) {
    case 'exa':
      return 'from-blue-500/20 to-blue-600/10 border-blue-500/20';
    case 'github':
      return 'from-purple-500/20 to-purple-600/10 border-purple-500/20';
    case 'notion':
      return 'from-gray-500/20 to-gray-600/10 border-gray-500/20';
    case 'slack':
      return 'from-green-500/20 to-green-600/10 border-green-500/20';
    case 'filesystem':
      return 'from-orange-500/20 to-orange-600/10 border-orange-500/20';
    default:
      return 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/20';
  }
} 