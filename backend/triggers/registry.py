from typing import Dict, List, Optional
from .core import TriggerProvider, TriggerType
from .providers import ScheduleTriggerProvider

class TriggerRegistry:
    """Registry for trigger providers."""
    
    def __init__(self):
        self._providers: Dict[TriggerType, TriggerProvider] = {}
        self._initialize_default_providers()
    
    def _initialize_default_providers(self):
        """Initialize default trigger providers."""
        self.register_provider(ScheduleTriggerProvider())
    
    def register_provider(self, provider: TriggerProvider):
        """Register a trigger provider."""
        self._providers[provider.trigger_type] = provider
    
    def get_provider(self, trigger_type: TriggerType) -> Optional[TriggerProvider]:
        """Get a trigger provider by type."""
        return self._providers.get(trigger_type)
    
    def get_all_providers(self) -> Dict[TriggerType, TriggerProvider]:
        """Get all registered providers."""
        return self._providers.copy()
    
    def get_supported_types(self) -> List[TriggerType]:
        """Get list of supported trigger types."""
        return list(self._providers.keys())
    
    def get_provider_schemas(self) -> Dict[str, Dict]:
        """Get configuration schemas for all providers."""
        schemas = {}
        for trigger_type, provider in self._providers.items():
            trigger_type_str = trigger_type.value if hasattr(trigger_type, 'value') else str(trigger_type)
        schemas[trigger_type_str] = provider.get_config_schema()
        return schemas
    
    def is_supported(self, trigger_type: TriggerType) -> bool:
        """Check if a trigger type is supported."""
        return trigger_type in self._providers

trigger_registry = TriggerRegistry() 