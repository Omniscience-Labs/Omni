"""
Kortix SDK exceptions
"""


class KortixError(Exception):
    """Base exception for all Kortix SDK errors"""
    pass


class AuthenticationError(KortixError):
    """Raised when authentication fails"""
    pass


class AgentError(KortixError):
    """Raised when agent operations fail"""
    pass


class ThreadError(KortixError):
    """Raised when thread operations fail"""
    pass


class ToolExecutionError(KortixError):
    """Raised when tool execution fails"""
    pass


class APIError(KortixError):
    """Raised when API requests fail"""
    
    def __init__(self, message: str, status_code: int = None, response_data: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data or {} 