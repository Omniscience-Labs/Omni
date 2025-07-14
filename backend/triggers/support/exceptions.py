class TriggerError(Exception):
    pass


class ConfigurationError(TriggerError):
    pass


class ProviderError(TriggerError):
    pass


class TriggerNotFoundError(TriggerError):
    pass


class TriggerExecutionError(TriggerError):
    pass


class ProviderNotFoundError(ProviderError):
    pass


class ProviderSetupError(ProviderError):
    pass


class ValidationError(TriggerError):
    pass 