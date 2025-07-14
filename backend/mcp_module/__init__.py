from .facade import MCPManager
from .infrastructure.dependencies import get_mcp_dependencies, initialize_mcp_dependencies
from .domain.entities import (
    MCPServer,
    MCPConnection, 
    MCPServerDetail,
    MCPServerListResult,
    ToolExecutionResult,
    CustomMCPConnectionResult,
)
from .domain.exceptions import (
    MCPException,
    MCPConnectionError,
    MCPServerNotFoundError,
    MCPToolNotFoundError,
    MCPToolExecutionError,
    MCPProviderError,
    MCPConfigurationError,
    MCPRegistryError,
    MCPAuthenticationError,
    CustomMCPError,
)

_default_dependencies = get_mcp_dependencies()
mcp_manager = _default_dependencies.mcp_manager

__all__ = [
    "MCPManager",
    "mcp_manager",
    "get_mcp_dependencies",
    "initialize_mcp_dependencies",
    "MCPServer",
    "MCPConnection",
    "MCPServerDetail", 
    "MCPServerListResult",
    "ToolExecutionResult",
    "CustomMCPConnectionResult",
    "MCPException",
    "MCPConnectionError",
    "MCPServerNotFoundError",
    "MCPToolNotFoundError",
    "MCPToolExecutionError",
    "MCPProviderError",
    "MCPConfigurationError",
    "MCPRegistryError",
    "MCPAuthenticationError",
    "CustomMCPError"
] 