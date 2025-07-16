class VersionServiceError(Exception):
    pass


class VersionNotFoundError(VersionServiceError):
    pass


class AgentNotFoundError(VersionServiceError):
    pass


class UnauthorizedError(VersionServiceError):
    pass


class InvalidVersionError(VersionServiceError):
    pass


class VersionConflictError(VersionServiceError):
    pass 