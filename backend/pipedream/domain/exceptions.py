class PipedreamException(Exception):
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.error_code = error_code
        self.message = message


class DomainException(PipedreamException):
    pass


class ValidationException(DomainException):
    def __init__(self, field: str, message: str):
        super().__init__(f"Validation error for {field}: {message}", "VALIDATION_ERROR")
        self.field = field


class ProfileException(DomainException):
    pass


class ProfileNotFoundError(ProfileException):
    def __init__(self, profile_id: str):
        super().__init__(f"Profile with ID {profile_id} not found", "PROFILE_NOT_FOUND")
        self.profile_id = profile_id


class ProfileAlreadyExistsError(ProfileException):
    def __init__(self, profile_name: str, app_slug: str):
        super().__init__(f"Profile '{profile_name}' already exists for app '{app_slug}'", "PROFILE_ALREADY_EXISTS")
        self.profile_name = profile_name
        self.app_slug = app_slug


class ConnectionException(DomainException):
    pass


class ConnectionNotFoundError(ConnectionException):
    def __init__(self, external_user_id: str, app_slug: str):
        super().__init__(f"Connection not found for user {external_user_id} and app {app_slug}", "CONNECTION_NOT_FOUND")
        self.external_user_id = external_user_id
        self.app_slug = app_slug


class ConnectionFailedError(ConnectionException):
    def __init__(self, app_slug: str, reason: str):
        super().__init__(f"Failed to connect to {app_slug}: {reason}", "CONNECTION_FAILED")
        self.app_slug = app_slug
        self.reason = reason


class AppException(DomainException):
    pass


class AppNotFoundError(AppException):
    def __init__(self, app_slug: str):
        super().__init__(f"App with slug '{app_slug}' not found", "APP_NOT_FOUND")
        self.app_slug = app_slug


class MCPException(DomainException):
    pass


class MCPConnectionError(MCPException):
    def __init__(self, app_slug: str, reason: str):
        super().__init__(f"MCP connection failed for {app_slug}: {reason}", "MCP_CONNECTION_ERROR")
        self.app_slug = app_slug
        self.reason = reason


class MCPServerNotAvailableError(MCPException):
    def __init__(self, message: str = "MCP server is not available"):
        super().__init__(message, "MCP_SERVER_NOT_AVAILABLE")


class InfrastructureException(PipedreamException):
    pass


class ConfigurationException(InfrastructureException):
    def __init__(self, missing_keys: list):
        super().__init__(f"Missing required configuration keys: {', '.join(missing_keys)}", "CONFIGURATION_ERROR")
        self.missing_keys = missing_keys


class DatabaseException(InfrastructureException):
    def __init__(self, operation: str, reason: str):
        super().__init__(f"Database operation '{operation}' failed: {reason}", "DATABASE_ERROR")
        self.operation = operation
        self.reason = reason


class HttpClientException(InfrastructureException):
    def __init__(self, url: str, status_code: int, reason: str):
        super().__init__(f"HTTP request to {url} failed with status {status_code}: {reason}", "HTTP_CLIENT_ERROR")
        self.url = url
        self.status_code = status_code
        self.reason = reason


class AuthenticationException(InfrastructureException):
    def __init__(self, reason: str):
        super().__init__(f"Authentication failed: {reason}", "AUTHENTICATION_ERROR")
        self.reason = reason


class RateLimitException(InfrastructureException):
    def __init__(self, retry_after: int = None):
        super().__init__("Rate limit exceeded", "RATE_LIMIT_EXCEEDED")
        self.retry_after = retry_after


class EncryptionException(InfrastructureException):
    def __init__(self, operation: str, reason: str):
        super().__init__(f"Encryption operation '{operation}' failed: {reason}", "ENCRYPTION_ERROR")
        self.operation = operation
        self.reason = reason 