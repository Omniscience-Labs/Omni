from typing import Tuple
from services.supabase import DBConnection

from .dependency_injection import TriggerContainer, get_trigger_container
from ..services.trigger_service import TriggerService
from ..services.execution_service import TriggerExecutionService
from ..services.provider_service import ProviderService


class TriggerModuleFactory:
    @staticmethod
    async def create_trigger_module(db_connection: DBConnection) -> Tuple[TriggerService, TriggerExecutionService, ProviderService]:
        container = get_trigger_container(db_connection)
        
        provider_service = container.get_provider_service()
        await provider_service.initialize()
        
        trigger_service = container.get_trigger_service()
        execution_service = container.get_execution_service()
        
        return trigger_service, execution_service, provider_service
    
    @staticmethod
    def get_trigger_service(db_connection: DBConnection) -> TriggerService:
        container = get_trigger_container(db_connection)
        return container.get_trigger_service()
    
    @staticmethod
    def get_execution_service(db_connection: DBConnection) -> TriggerExecutionService:
        container = get_trigger_container(db_connection)
        return container.get_execution_service()
    
    @staticmethod
    def get_provider_service(db_connection: DBConnection) -> ProviderService:
        container = get_trigger_container(db_connection)
        return container.get_provider_service() 