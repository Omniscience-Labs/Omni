class TemplateException(Exception):
    pass


class TemplateNotFoundError(TemplateException):
    pass


class TemplateAccessDeniedError(TemplateException):
    pass


class TemplateInstallationError(TemplateException):
    pass


class InvalidCredentialError(TemplateException):
    pass 