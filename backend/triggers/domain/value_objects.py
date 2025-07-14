from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional
from datetime import datetime, timezone


class TriggerType(str, Enum):
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"
    EVENT = "event"


@dataclass(frozen=True)
class TriggerConfig:
    name: str
    description: Optional[str]
    config: Dict[str, Any]
    is_active: bool = True
    
    def __post_init__(self):
        if not self.name or not self.name.strip():
            raise ValueError("Trigger name cannot be empty")
        
        if self.config is None:
            object.__setattr__(self, 'config', {})


@dataclass(frozen=True)
class ProviderDefinition:
    provider_id: str
    name: str
    description: str
    trigger_type: TriggerType
    provider_class: Optional[str] = None
    config_schema: Dict[str, Any] = field(default_factory=dict)
    webhook_enabled: bool = False
    setup_required: bool = True
    webhook_config: Optional[Dict[str, Any]] = None
    response_template: Optional[Dict[str, Any]] = None
    field_mappings: Optional[Dict[str, str]] = None
    
    def __post_init__(self):
        if not self.provider_id or not self.provider_id.strip():
            raise ValueError("Provider ID cannot be empty")
        
        if not self.name or not self.name.strip():
            raise ValueError("Provider name cannot be empty")
        
        if self.webhook_enabled and not self.webhook_config:
            object.__setattr__(self, 'webhook_config', {})


@dataclass(frozen=True)
class TriggerIdentity:
    trigger_id: str
    agent_id: str
    
    def __post_init__(self):
        if not self.trigger_id or not self.trigger_id.strip():
            raise ValueError("Trigger ID cannot be empty")
        
        if not self.agent_id or not self.agent_id.strip():
            raise ValueError("Agent ID cannot be empty")


@dataclass(frozen=True)
class TriggerMetadata:
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def update_timestamp(self) -> 'TriggerMetadata':
        return TriggerMetadata(
            created_at=self.created_at,
            updated_at=datetime.now(timezone.utc)
        )


@dataclass(frozen=True)
class ExecutionVariables:
    variables: Dict[str, Any] = field(default_factory=dict)
    
    def get(self, key: str, default: Any = None) -> Any:
        return self.variables.get(key, default)
    
    def add(self, key: str, value: Any) -> 'ExecutionVariables':
        new_variables = {**self.variables, key: value}
        return ExecutionVariables(variables=new_variables)
    
    def merge(self, other: 'ExecutionVariables') -> 'ExecutionVariables':
        new_variables = {**self.variables, **other.variables}
        return ExecutionVariables(variables=new_variables)


@dataclass(frozen=True)
class WebhookEndpoint:
    url: str
    method: str = "POST"
    headers: Dict[str, str] = field(default_factory=dict)
    authentication: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if not self.url or not self.url.strip():
            raise ValueError("Webhook URL cannot be empty")
        
        if self.method not in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
            raise ValueError(f"Invalid HTTP method: {self.method}") 