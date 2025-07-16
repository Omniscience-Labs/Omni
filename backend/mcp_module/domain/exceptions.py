class MCPException(Exception):
    pass


class MCPConnectionError(MCPException):
    pass


class MCPServerNotFoundError(MCPException):
    pass


class MCPToolNotFoundError(MCPException):
    pass


class MCPToolExecutionError(MCPException):
    pass


class MCPProviderError(MCPException):
    pass


class MCPConfigurationError(MCPException):
    pass


class MCPRegistryError(MCPException):
    pass


class MCPAuthenticationError(MCPException):
    pass


class CustomMCPError(MCPException):
    pass
