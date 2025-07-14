import abc
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from .value_objects import (
    TriggerType, TriggerConfig, ProviderDefinition, TriggerIdentity,
    TriggerMetadata, ExecutionVariables, WebhookEndpoint
)


@dataclass
class TriggerEvent:
    trigger_id: str
    agent_id: str
    trigger_type: TriggerType
    raw_data: Dict[str, Any]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    source: Optional[str] = None
    
    def __post_init__(self):
        if not self.trigger_id:
            raise ValueError("Trigger ID is required")
        if not self.agent_id:
            raise ValueError("Agent ID is required")
        if self.raw_data is None:
            self.raw_data = {}


@dataclass
class TriggerResult:
    success: bool
    should_execute_agent: bool = False
    should_execute_workflow: bool = False
    agent_prompt: Optional[str] = None
    workflow_id: Optional[str] = None
    workflow_input: Optional[Dict[str, Any]] = None
    execution_variables: ExecutionVariables = field(default_factory=ExecutionVariables)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.success and not self.error_message:
            raise ValueError("Error message is required when success is False")
        
        if self.should_execute_workflow and not self.workflow_id:
            raise ValueError("Workflow ID is required when should_execute_workflow is True")


class Trigger:
    
    def __init__(
        self,
        identity: TriggerIdentity,
        provider_id: str,
        trigger_type: TriggerType,
        config: TriggerConfig,
        metadata: Optional[TriggerMetadata] = None
    ):
        self._identity = identity
        self._provider_id = provider_id
        self._trigger_type = trigger_type
        self._config = config
        self._metadata = metadata or TriggerMetadata()
        self._domain_events: List['DomainEvent'] = []
    
    @property
    def identity(self) -> TriggerIdentity:
        return self._identity
    
    @property
    def trigger_id(self) -> str:
        return self._identity.trigger_id
    
    @property
    def agent_id(self) -> str:
        return self._identity.agent_id
    
    @property
    def provider_id(self) -> str:
        return self._provider_id
    
    @property
    def trigger_type(self) -> TriggerType:
        return self._trigger_type
    
    @property
    def config(self) -> TriggerConfig:
        return self._config
    
    @property
    def metadata(self) -> TriggerMetadata:
        return self._metadata
    
    @property
    def is_active(self) -> bool:
        return self._config.is_active
    
    def update_config(self, new_config: TriggerConfig) -> None:
        if not new_config:
            raise ValueError("Configuration cannot be None")
        
        old_config = self._config
        self._config = new_config
        self._metadata = self._metadata.update_timestamp()
        
        self._add_domain_event(TriggerConfigUpdatedEvent(
            trigger_id=self.trigger_id,
            old_config=old_config,
            new_config=new_config
        ))
    
    def activate(self) -> None:
        if self.is_active:
            return
        
        updated_config = TriggerConfig(
            name=self._config.name,
            description=self._config.description,
            config=self._config.config,
            is_active=True
        )
        self.update_config(updated_config)
        
        self._add_domain_event(TriggerActivatedEvent(
            trigger_id=self.trigger_id,
            agent_id=self.agent_id
        ))
    
    def deactivate(self) -> None:
        if not self.is_active:
            return
        
        updated_config = TriggerConfig(
            name=self._config.name,
            description=self._config.description,
            config=self._config.config,
            is_active=False
        )
        self.update_config(updated_config)
        
        self._add_domain_event(TriggerDeactivatedEvent(
            trigger_id=self.trigger_id,
            agent_id=self.agent_id
        ))
    
    def get_domain_events(self) -> List['DomainEvent']:
        return self._domain_events.copy()
    
    def clear_domain_events(self) -> None:
        self._domain_events.clear()
    
    def _add_domain_event(self, event: 'DomainEvent') -> None:
        self._domain_events.append(event)


class TriggerProvider(abc.ABC):
    
    def __init__(self, provider_definition: ProviderDefinition):
        if not provider_definition:
            raise ValueError("Provider definition is required")
        self._provider_definition = provider_definition
    
    @property
    def provider_definition(self) -> ProviderDefinition:
        return self._provider_definition
    
    @property
    def provider_id(self) -> str:
        return self._provider_definition.provider_id
    
    @property
    def trigger_type(self) -> TriggerType:
        return self._provider_definition.trigger_type
    
    @abc.abstractmethod
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        pass
    
    @abc.abstractmethod
    async def setup_trigger(self, trigger: Trigger) -> bool:
        pass
    
    @abc.abstractmethod
    async def teardown_trigger(self, trigger: Trigger) -> bool:
        pass
    
    @abc.abstractmethod
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        pass
    
    @abc.abstractmethod
    async def health_check(self, trigger: Trigger) -> bool:
        pass
    
    def get_config_schema(self) -> Dict[str, Any]:
        return self._provider_definition.config_schema
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> Optional[str]:
        if not self._provider_definition.webhook_enabled:
            return None
        return f"{base_url}/api/triggers/{trigger_id}/webhook"


class DomainEvent:
    
    def __init__(self):
        self.event_id = str(__import__('uuid').uuid4())
        self.occurred_at = datetime.now(timezone.utc)


@dataclass
class TriggerCreatedEvent(DomainEvent):
    trigger_id: str
    agent_id: str
    provider_id: str
    trigger_type: TriggerType
    
    def __init__(self, trigger_id: str, agent_id: str, provider_id: str, trigger_type: TriggerType):
        super().__init__()
        self.trigger_id = trigger_id
        self.agent_id = agent_id
        self.provider_id = provider_id
        self.trigger_type = trigger_type


@dataclass
class TriggerConfigUpdatedEvent(DomainEvent):
    trigger_id: str
    old_config: TriggerConfig
    new_config: TriggerConfig
    
    def __init__(self, trigger_id: str, old_config: TriggerConfig, new_config: TriggerConfig):
        super().__init__()
        self.trigger_id = trigger_id
        self.old_config = old_config
        self.new_config = new_config


@dataclass
class TriggerActivatedEvent(DomainEvent):
    trigger_id: str
    agent_id: str
    
    def __init__(self, trigger_id: str, agent_id: str):
        super().__init__()
        self.trigger_id = trigger_id
        self.agent_id = agent_id


@dataclass
class TriggerDeactivatedEvent(DomainEvent):
    trigger_id: str
    agent_id: str
    
    def __init__(self, trigger_id: str, agent_id: str):
        super().__init__()
        self.trigger_id = trigger_id
        self.agent_id = agent_id


@dataclass
class TriggerDeletedEvent(DomainEvent):
    trigger_id: str
    agent_id: str
    
    def __init__(self, trigger_id: str, agent_id: str):
        super().__init__()
        self.trigger_id = trigger_id
        self.agent_id = agent_id 