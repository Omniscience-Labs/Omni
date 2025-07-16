from typing import Dict, List, Optional, Any
from collections import OrderedDict

from ..domain.entities import ToolExecutionRequest, ToolExecutionResult, MCPConnection
from ..domain.exceptions import MCPToolNotFoundError, MCPToolExecutionError
from ..services.connection_service import ConnectionService
from ..protocols import Logger


class ToolService:
    def __init__(self, connection_service: ConnectionService, logger: Logger):
        self._connection_service = connection_service
        self._logger = logger
    
    def get_all_tools_openapi(self) -> List[Dict[str, Any]]:
        tools = []
        
        for connection in self._connection_service.get_all_connections():
            if not connection.tools:
                continue
            
            for tool in connection.tools:
                if tool.name not in connection.enabled_tools:
                    continue
                
                openapi_tool = {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.inputSchema
                    }
                }
                tools.append(openapi_tool)
        
        return tools
    
    async def execute_tool(self, request: ToolExecutionRequest) -> ToolExecutionResult:
        self._logger.info(f"Executing tool: {request.tool_name}")
        
        connection = self._find_tool_connection(request.tool_name)
        if not connection:
            raise MCPToolNotFoundError(f"Tool not found: {request.tool_name}")
        
        if not connection.session:
            raise MCPToolExecutionError(f"No active session for tool: {request.tool_name}")
        
        if request.tool_name not in connection.enabled_tools:
            raise MCPToolExecutionError(f"Tool not enabled: {request.tool_name}")
        
        try:
            result = await connection.session.call_tool(request.tool_name, request.arguments)
            
            self._logger.info(f"Tool {request.tool_name} executed successfully")
            
            if hasattr(result, 'content'):
                content = result.content
                if isinstance(content, list) and content:
                    if hasattr(content[0], 'text'):
                        result_data = content[0].text
                    else:
                        result_data = str(content[0])
                else:
                    result_data = str(content)
            else:
                result_data = str(result)
            
            return ToolExecutionResult(
                success=True,
                result=result_data
            )
            
        except Exception as e:
            error_msg = f"Tool execution failed: {str(e)}"
            self._logger.error(error_msg)
            
            return ToolExecutionResult(
                success=False,
                result=None,
                error=error_msg
            )
    
    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        connection = self._find_tool_connection(tool_name)
        if not connection or not connection.tools:
            return None
        
        for tool in connection.tools:
            if tool.name == tool_name:
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema,
                    "server": connection.qualified_name,
                    "enabled": tool_name in connection.enabled_tools
                }
        
        return None
    
    def _find_tool_connection(self, tool_name: str) -> Optional[MCPConnection]:
        for connection in self._connection_service.get_all_connections():
            if not connection.tools:
                continue
            
            for tool in connection.tools:
                if tool.name == tool_name:
                    return connection
        
        return None
    
    def get_tools_by_server(self, qualified_name: str) -> List[Dict[str, Any]]:
        connection = self._connection_service.get_connection(qualified_name)
        if not connection or not connection.tools:
            return []
        
        tools = []
        for tool in connection.tools:
            tools.append({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema,
                "enabled": tool.name in connection.enabled_tools
            })
        
        return tools
    
    def get_enabled_tools(self) -> List[str]:
        enabled_tools = []
        
        for connection in self._connection_service.get_all_connections():
            enabled_tools.extend(connection.enabled_tools)
        
        return enabled_tools 