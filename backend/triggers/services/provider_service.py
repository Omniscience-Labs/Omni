from typing import List, Optional, Dict, Any

from ..domain.value_objects import ProviderDefinition, TriggerType
from ..domain.services import ProviderRegistryService


class ProviderService:
    
    def __init__(self, provider_registry: ProviderRegistryService):
        self._provider_registry = provider_registry
    
    async def initialize(self) -> None:
        await self._provider_registry.load_builtin_providers()
    
    async def get_available_providers(self) -> List[ProviderDefinition]:
        return self._provider_registry.get_provider_definitions()
    
    async def get_providers_by_type(self, trigger_type: TriggerType) -> List[ProviderDefinition]:
        return self._provider_registry.get_providers_by_type(trigger_type)
    
    async def get_provider_definition(self, provider_id: str) -> Optional[ProviderDefinition]:
        provider = await self._provider_registry.get_provider(provider_id)
        return provider.provider_definition if provider else None
    
    async def get_provider_config_schema(self, provider_id: str) -> Dict[str, Any]:
        provider = await self._provider_registry.get_provider(provider_id)
        return provider.get_config_schema() if provider else {}
    
    def register_provider_definition(self, definition: ProviderDefinition) -> None:
        self._provider_registry.register_provider_definition(definition)
    
    def is_provider_available(self, provider_id: str) -> bool:
        return self._provider_registry.is_provider_registered(provider_id)
    
    async def validate_provider_config(self, provider_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        provider = await self._provider_registry.get_provider(provider_id)
        if not provider:
            raise ValueError(f"Provider not found: {provider_id}")
        
        return await provider.validate_config(config) 