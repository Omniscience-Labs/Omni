import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from ..domain.entities import Trigger, TriggerEvent, TriggerResult
from ..domain.value_objects import TriggerIdentity, TriggerConfig, TriggerMetadata, TriggerType
from ..domain.services import TriggerDomainService, ProviderRegistryService
from ..repositories.interfaces import TriggerRepository, TriggerEventLogRepository


class TriggerService:
    def __init__(
        self,
        trigger_repository: TriggerRepository,
        event_log_repository: TriggerEventLogRepository,
        domain_service: TriggerDomainService,
        provider_registry: ProviderRegistryService
    ):
        self._trigger_repo = trigger_repository
        self._event_log_repo = event_log_repository
        self._domain_service = domain_service
        self._provider_registry = provider_registry
    
    async def create_trigger(
        self,
        agent_id: str,
        provider_id: str,
        name: str,
        config: Dict[str, Any],
        description: Optional[str] = None
    ) -> Trigger:
        validated_config = await self._domain_service.validate_trigger_configuration(
            provider_id, config
        )
        
        provider = await self._provider_registry.get_provider(provider_id)
        if not provider:
            raise ValueError(f"Provider not found: {provider_id}")
        
        trigger_config = TriggerConfig(
            name=name,
            description=description,
            config={**validated_config, "provider_id": provider_id}
        )
        
        identity = TriggerIdentity(
            trigger_id=str(uuid.uuid4()),
            agent_id=agent_id
        )
        
        trigger = Trigger(
            identity=identity,
            provider_id=provider_id,
            trigger_type=provider.trigger_type,
            config=trigger_config
        )
        
        setup_success = await self._domain_service.setup_trigger(trigger)
        if not setup_success:
            raise ValueError(f"Failed to setup trigger: {name}")
        
        await self._trigger_repo.save(trigger)
        
        return trigger
    
    async def get_trigger(self, trigger_id: str) -> Optional[Trigger]:
        return await self._trigger_repo.find_by_id(trigger_id)
    
    async def get_agent_triggers(self, agent_id: str) -> List[Trigger]:
        return await self._trigger_repo.find_by_agent_id(agent_id)
    
    async def get_active_triggers(self) -> List[Trigger]:
        return await self._trigger_repo.find_active_triggers()
    
    async def update_trigger(
        self,
        trigger_id: str,
        config: Optional[Dict[str, Any]] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Trigger:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            raise ValueError(f"Trigger not found: {trigger_id}")
        
        if config is not None:
            validated_config = await self._domain_service.validate_trigger_configuration(
                trigger.provider_id, config
            )
            config = {**validated_config, "provider_id": trigger.provider_id}
        
        updated_config = TriggerConfig(
            name=name if name is not None else trigger.config.name,
            description=description if description is not None else trigger.config.description,
            config=config if config is not None else trigger.config.config,
            is_active=is_active if is_active is not None else trigger.config.is_active
        )
        
        trigger.update_config(updated_config)
        
        await self._domain_service.teardown_trigger(trigger)
        if trigger.is_active:
            setup_success = await self._domain_service.setup_trigger(trigger)
            if not setup_success:
                raise ValueError(f"Failed to update trigger setup: {trigger_id}")
        
        await self._trigger_repo.update(trigger)
        
        return trigger
    
    async def delete_trigger(self, trigger_id: str) -> bool:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            return False
        
        await self._domain_service.teardown_trigger(trigger)
        return await self._trigger_repo.delete(trigger_id)
    
    async def activate_trigger(self, trigger_id: str) -> Trigger:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            raise ValueError(f"Trigger not found: {trigger_id}")
        
        if not trigger.is_active:
            trigger.activate()
            setup_success = await self._domain_service.setup_trigger(trigger)
            if not setup_success:
                raise ValueError(f"Failed to activate trigger: {trigger_id}")
            
            await self._trigger_repo.update(trigger)
        
        return trigger
    
    async def deactivate_trigger(self, trigger_id: str) -> Trigger:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            raise ValueError(f"Trigger not found: {trigger_id}")
        
        if trigger.is_active:
            await self._domain_service.teardown_trigger(trigger)
            trigger.deactivate()
            await self._trigger_repo.update(trigger)
        
        return trigger
    
    async def health_check_trigger(self, trigger_id: str) -> bool:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            return False
        
        return await self._domain_service.health_check_trigger(trigger)
    
    async def health_check_agent_triggers(self, agent_id: str) -> Dict[str, bool]:
        triggers = await self._trigger_repo.find_by_agent_id(agent_id)
        results = {}
        
        for trigger in triggers:
            results[trigger.trigger_id] = await self._domain_service.health_check_trigger(trigger)
        
        return results
    
    async def process_trigger_event(
        self,
        trigger_id: str,
        raw_data: Dict[str, Any]
    ) -> TriggerResult:
        trigger = await self._trigger_repo.find_by_id(trigger_id)
        if not trigger:
            return TriggerResult(
                success=False,
                error_message=f"Trigger not found: {trigger_id}"
            )
        
        event = TriggerEvent(
            trigger_id=trigger_id,
            agent_id=trigger.agent_id,
            trigger_type=trigger.trigger_type,
            raw_data=raw_data
        )
        
        result = await self._domain_service.process_trigger_event(trigger, event)
        return result
    
    async def get_trigger_logs(
        self,
        trigger_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        return await self._event_log_repo.find_logs_by_trigger_id(trigger_id, limit, offset)
    
    async def get_agent_trigger_logs(
        self,
        agent_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        return await self._event_log_repo.find_logs_by_agent_id(agent_id, limit, offset)
    
    async def get_trigger_stats(
        self,
        trigger_id: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        return await self._event_log_repo.get_execution_stats(trigger_id, hours)
    
    async def get_failed_events(
        self,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        return await self._event_log_repo.find_failed_events(since, limit) 