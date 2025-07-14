from typing import Optional
from services.supabase import DBConnection

from ..domain.services import TriggerDomainService, ProviderRegistryService
from ..repositories.interfaces import TriggerRepository, TriggerEventLogRepository
from ..repositories.implementations import SupabaseTriggerRepository, SupabaseTriggerEventLogRepository
from ..services.trigger_service import TriggerService
from ..services.execution_service import TriggerExecutionService
from ..services.provider_service import ProviderService


class TriggerContainer:
    def __init__(self, db_connection: DBConnection):
        self._db_connection = db_connection
        self._trigger_repository: Optional[TriggerRepository] = None
        self._event_log_repository: Optional[TriggerEventLogRepository] = None
        self._provider_registry: Optional[ProviderRegistryService] = None
        self._domain_service: Optional[TriggerDomainService] = None
        self._trigger_service: Optional[TriggerService] = None
        self._execution_service: Optional[TriggerExecutionService] = None
        self._provider_service: Optional[ProviderService] = None
    
    def get_trigger_repository(self) -> TriggerRepository:
        if self._trigger_repository is None:
            self._trigger_repository = SupabaseTriggerRepository(self._db_connection)
        return self._trigger_repository
    
    def get_event_log_repository(self) -> TriggerEventLogRepository:
        if self._event_log_repository is None:
            self._event_log_repository = SupabaseTriggerEventLogRepository(self._db_connection)
        return self._event_log_repository
    
    def get_provider_registry(self) -> ProviderRegistryService:
        if self._provider_registry is None:
            self._provider_registry = ProviderRegistryService()
        return self._provider_registry
    
    def get_domain_service(self) -> TriggerDomainService:
        if self._domain_service is None:
            self._domain_service = TriggerDomainService(self.get_provider_registry())
        return self._domain_service
    
    def get_trigger_service(self) -> TriggerService:
        if self._trigger_service is None:
            self._trigger_service = TriggerService(
                trigger_repository=self.get_trigger_repository(),
                event_log_repository=self.get_event_log_repository(),
                domain_service=self.get_domain_service(),
                provider_registry=self.get_provider_registry()
            )
        return self._trigger_service
    
    def get_execution_service(self) -> TriggerExecutionService:
        if self._execution_service is None:
            self._execution_service = TriggerExecutionService(self._db_connection)
        return self._execution_service
    
    def get_provider_service(self) -> ProviderService:
        if self._provider_service is None:
            self._provider_service = ProviderService(self.get_provider_registry())
        return self._provider_service


_container: Optional[TriggerContainer] = None


def get_trigger_container(db_connection: Optional[DBConnection] = None) -> TriggerContainer:
    global _container
    
    if _container is None:
        if db_connection is None:
            raise ValueError("Database connection is required to initialize trigger container")
        _container = TriggerContainer(db_connection)
    
    return _container


def reset_trigger_container():
    global _container
    _container = None 