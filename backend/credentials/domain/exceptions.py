class CredentialException(Exception):
    pass


class CredentialNotFoundError(CredentialException):
    pass


class CredentialAccessDeniedError(CredentialException):
    pass


class CredentialEncryptionError(CredentialException):
    pass


class CredentialDecryptionError(CredentialException):
    pass


class ProfileNotFoundError(CredentialException):
    pass


class ProfileAccessDeniedError(CredentialException):
    pass


class InvalidCredentialError(CredentialException):
    pass


class CredentialIntegrityError(CredentialException):
    pass 