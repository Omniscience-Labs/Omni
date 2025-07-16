import importlib
from typing import Dict, Optional, List
from abc import ABC, abstractmethod

from .entities import Trigger, TriggerProvider, TriggerEvent, TriggerResult
from .value_objects import ProviderDefinition, TriggerType


class TriggerDomainService:
    def __init__(self, provider_registry: 'ProviderRegistryService'):
        self._provider_registry = provider_registry
    
    async def validate_trigger_configuration(
        self,
        provider_id: str,
        config: Dict[str, any]
    ) -> Dict[str, any]:
        provider = await self._provider_registry.get_provider(provider_id)
        if not provider:
            raise ValueError(f"Provider not found: {provider_id}")
        
        return await provider.validate_config(config)
    
    async def process_trigger_event(
        self,
        trigger: Trigger,
        event: TriggerEvent
    ) -> TriggerResult:
        if not trigger.is_active:
            return TriggerResult(
                success=False,
                error_message=f"Trigger {trigger.trigger_id} is not active"
            )
        
        provider = await self._provider_registry.get_provider(trigger.provider_id)
        if not provider:
            return TriggerResult(
                success=False,
                error_message=f"Provider not found: {trigger.provider_id}"
            )
        
        try:
            return await provider.process_event(event)
        except Exception as e:
            return TriggerResult(
                success=False,
                error_message=f"Error processing event: {str(e)}"
            )
    
    async def setup_trigger(self, trigger: Trigger) -> bool:
        provider = await self._provider_registry.get_provider(trigger.provider_id)
        if not provider:
            return False
        
        try:
            return await provider.setup_trigger(trigger)
        except Exception:
            return False
    
    async def teardown_trigger(self, trigger: Trigger) -> bool:
        provider = await self._provider_registry.get_provider(trigger.provider_id)
        if not provider:
            return False
        
        try:
            return await provider.teardown_trigger(trigger)
        except Exception:
            return False
    
    async def health_check_trigger(self, trigger: Trigger) -> bool:
        provider = await self._provider_registry.get_provider(trigger.provider_id)
        if not provider:
            return False
        
        try:
            return await provider.health_check(trigger)
        except Exception:
            return False


class ProviderRegistryService:
    def __init__(self):
        self._providers: Dict[str, TriggerProvider] = {}
        self._provider_definitions: Dict[str, ProviderDefinition] = {}
        self._provider_factory = ProviderFactory()
    
    def register_provider_definition(self, definition: ProviderDefinition) -> None:
        self._provider_definitions[definition.provider_id] = definition
    
    async def get_provider(self, provider_id: str) -> Optional[TriggerProvider]:
        if provider_id in self._providers:
            return self._providers[provider_id]
        
        definition = self._provider_definitions.get(provider_id)
        if not definition:
            return None
        
        try:
            provider = await self._provider_factory.create_provider(definition)
            self._providers[provider_id] = provider
            return provider
        except Exception:
            return None
    
    def get_provider_definitions(self) -> List[ProviderDefinition]:
        return list(self._provider_definitions.values())
    
    def get_providers_by_type(self, trigger_type: TriggerType) -> List[ProviderDefinition]:
        return [
            definition for definition in self._provider_definitions.values()
            if definition.trigger_type == trigger_type
        ]
    
    def is_provider_registered(self, provider_id: str) -> bool:
        return provider_id in self._provider_definitions
    
    async def load_builtin_providers(self) -> None:
        builtin_providers = [
            ProviderDefinition(
                provider_id="schedule",
                name="Schedule",
                description="Schedule agent or workflow execution using cron expressions",
                trigger_type=TriggerType.SCHEDULE,
                provider_class="triggers.infrastructure.providers.schedule_provider.ScheduleTriggerProvider",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "cron_expression": {
                            "type": "string",
                            "description": "Cron expression for scheduling"
                        },
                        "execution_type": {
                            "type": "string",
                            "enum": ["agent", "workflow"],
                            "description": "Type of execution"
                        },
                        "agent_prompt": {
                            "type": "string",
                            "description": "Prompt for agent execution"
                        },
                        "workflow_id": {
                            "type": "string",
                            "description": "ID of workflow to execute"
                        }
                    },
                    "required": ["cron_expression", "execution_type"],
                    "oneOf": [
                        {
                            "properties": {"execution_type": {"const": "agent"}},
                            "required": ["agent_prompt"]
                        },
                        {
                            "properties": {"execution_type": {"const": "workflow"}},
                            "required": ["workflow_id"]
                        }
                    ]
                }
            ),
            ProviderDefinition(
                provider_id="webhook",
                name="Webhook",
                description="Generic webhook trigger for external integrations",
                trigger_type=TriggerType.WEBHOOK,
                provider_class="triggers.infrastructure.providers.webhook_provider.WebhookTriggerProvider",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "webhook_secret": {
                            "type": "string",
                            "description": "Secret for webhook validation"
                        },
                        "field_mappings": {
                            "type": "object",
                            "description": "Mapping of webhook fields to execution variables"
                        },
                        "response_template": {
                            "type": "object",
                            "description": "Template for webhook response"
                        }
                    },
                    "required": []
                }
            )
        ]
        
        for provider_def in builtin_providers:
            self.register_provider_definition(provider_def)


class ProviderFactory:
    async def create_provider(self, definition: ProviderDefinition) -> TriggerProvider:
        if definition.provider_class:
            try:
                module_path, class_name = definition.provider_class.rsplit('.', 1)
                module = importlib.import_module(module_path)
                provider_class = getattr(module, class_name)
                return provider_class(definition)
            except (ImportError, AttributeError) as e:
                raise ValueError(f"Failed to load provider class {definition.provider_class}: {e}")
        
        if definition.trigger_type == TriggerType.WEBHOOK:
            from ..infrastructure.providers.webhook_provider import GenericWebhookProvider
            return GenericWebhookProvider(definition)
        
        raise ValueError(f"No implementation available for provider {definition.provider_id}")


class TriggerEventProcessor:
    def __init__(self, domain_service: TriggerDomainService):
        self._domain_service = domain_service
    
    async def process_event(
        self,
        trigger: Trigger,
        raw_data: Dict[str, any]
    ) -> TriggerResult:
        event = TriggerEvent(
            trigger_id=trigger.trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type,
            raw_data=raw_data
        )
        
        return await self._domain_service.process_trigger_event(trigger, event) 