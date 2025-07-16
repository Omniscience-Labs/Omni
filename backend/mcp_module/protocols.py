from typing import Protocol, Any, Dict, List, Optional, Tuple
from .domain.entities import (
    MCPServer, MCPServerDetail, MCPServerListResult, 
    PopularServersResult, MCPConnection, ToolExecutionResult
)


class Logger(Protocol):
    def info(self, message: str) -> None:
        ...
    
    def debug(self, message: str) -> None:
        ...
    
    def warning(self, message: str) -> None:
        ...
    
    def error(self, message: str) -> None:
        ...


class HTTPClient(Protocol):
    async def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        ...
    
    async def post(self, url: str, data: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        ...


class MCPProvider(Protocol):
    def get_server_url(self, qualified_name: str, config: Dict[str, Any]) -> str:
        ...
    
    def get_headers(self, qualified_name: str, config: Dict[str, Any], external_user_id: Optional[str] = None) -> Dict[str, str]:
        ...


class MCPRegistry(Protocol):
    async def list_servers(
        self, 
        query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> MCPServerListResult:
        ...
    
    async def get_server_details(self, qualified_name: str) -> MCPServerDetail:
        ...
    
    async def get_popular_servers(self) -> PopularServersResult:
        ...


class ConnectionManager(Protocol):
    async def connect_server(self, config: Dict[str, Any], external_user_id: Optional[str] = None) -> MCPConnection:
        ...
    
    async def disconnect_server(self, qualified_name: str) -> None:
        ...
    
    async def disconnect_all(self) -> None:
        ...
    
    def get_connection(self, qualified_name: str) -> Optional[MCPConnection]:
        ...
    
    def get_all_connections(self) -> List[MCPConnection]:
        ...


class ToolManager(Protocol):
    def get_all_tools_openapi(self) -> List[Dict[str, Any]]:
        ...
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any], external_user_id: Optional[str] = None) -> ToolExecutionResult:
        ...
    
    def get_tool_info(self, tool_name: str) -> Optional[Dict[str, Any]]:
        ...


class EncryptionService(Protocol):
    def encrypt_config(self, config: Dict[str, Any]) -> Tuple[bytes, str]:
        ...
    
    def decrypt_config(self, encrypted_config: bytes, expected_hash: str) -> Dict[str, Any]:
        ... 