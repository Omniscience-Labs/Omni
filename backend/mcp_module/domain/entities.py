from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from uuid import UUID
from datetime import datetime
from mcp import ClientSession


@dataclass(frozen=True)
class MCPServer:
    qualified_name: str
    display_name: str
    description: str
    created_at: str
    use_count: int
    homepage: str
    icon_url: Optional[str] = None
    is_deployed: Optional[bool] = None
    tools: Optional[List[Dict[str, Any]]] = None
    security: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class MCPConnection:
    qualified_name: str
    name: str
    config: Dict[str, Any]
    enabled_tools: List[str]
    provider: str = 'smithery'
    external_user_id: Optional[str] = None
    session: Optional[ClientSession] = field(default=None, compare=False)
    tools: Optional[List[Any]] = field(default=None, compare=False)


@dataclass(frozen=True)
class MCPServerDetail:
    qualified_name: str
    display_name: str
    icon_url: Optional[str] = None
    deployment_url: Optional[str] = None
    connections: List[Dict[str, Any]] = field(default_factory=list)
    security: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None


@dataclass(frozen=True)
class MCPServerListResult:
    servers: List[MCPServer]
    pagination: Dict[str, int]


@dataclass(frozen=True)
class PopularServersResult:
    success: bool
    servers: List[Dict[str, Any]]
    categorized: Dict[str, List[Dict[str, Any]]]
    total: int
    category_count: int
    pagination: Dict[str, int]


@dataclass(frozen=True)
class ToolInfo:
    name: str
    description: str
    input_schema: Dict[str, Any]


@dataclass(frozen=True)
class CustomMCPConnectionResult:
    success: bool
    qualified_name: str
    display_name: str
    tools: List[Dict[str, Any]]
    config: Dict[str, Any]
    url: str
    message: str


@dataclass
class MCPConnectionRequest:
    qualified_name: str
    name: str
    config: Dict[str, Any]
    enabled_tools: List[str]
    provider: str = 'smithery'
    external_user_id: Optional[str] = None


@dataclass
class CustomMCPRequest:
    url: str
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolExecutionRequest:
    tool_name: str
    arguments: Dict[str, Any]
    external_user_id: Optional[str] = None


@dataclass
class ToolExecutionResult:
    success: bool
    result: Any
    error: Optional[str] = None 