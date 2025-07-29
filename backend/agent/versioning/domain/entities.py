from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID, uuid4
from enum import Enum


class VersionStatus(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


@dataclass(frozen=True)
class VersionId:
    value: UUID
    
    @classmethod
    def generate(cls) -> 'VersionId':
        return cls(value=uuid4())
    
    @classmethod
    def from_string(cls, value: str) -> 'VersionId':
        return cls(value=UUID(value))
    
    def __str__(self) -> str:
        return str(self.value)


@dataclass(frozen=True)
class AgentId:
    value: UUID
    
    @classmethod
    def from_string(cls, value: str) -> 'AgentId':
        return cls(value=UUID(value))
    
    def __str__(self) -> str:
        return str(self.value)


@dataclass(frozen=True)
class UserId:
    value: UUID
    
    @classmethod
    def from_string(cls, value: str) -> 'UserId':
        return cls(value=UUID(value))
    
    def __str__(self) -> str:
        return str(self.value)


@dataclass(frozen=True)
class VersionNumber:
    value: int
    
    def __post_init__(self):
        if self.value < 1:
            raise ValueError("Version number must be positive")
    
    def next(self) -> 'VersionNumber':
        return VersionNumber(self.value + 1)
    
    def __str__(self) -> str:
        return f"v{self.value}"


@dataclass(frozen=True)
class SystemPrompt:
    value: str
    
    def __post_init__(self):
        if not self.value or not self.value.strip():
            raise ValueError("System prompt cannot be empty")


@dataclass(frozen=True)
class MCPConfiguration:
    name: str
    type: str
    config: Dict[str, Any] = field(default_factory=dict)
    enabled_tools: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.name:
            raise ValueError("MCP name cannot be empty")


@dataclass(frozen=True)
class ToolConfiguration:
    tools: Dict[str, Any] = field(default_factory=dict)
    
    @classmethod
    def normalize_agentpress_tools(cls, agentpress_tools: Dict[str, Any]) -> Dict[str, bool]:
        normalized = {}
        for tool_name, tool_config in agentpress_tools.items():
            if isinstance(tool_config, bool):
                normalized[tool_name] = tool_config
            elif isinstance(tool_config, dict) and 'enabled' in tool_config:
                normalized[tool_name] = tool_config['enabled']
            else:
                normalized[tool_name] = False
        return normalized
    
    @classmethod
    def create_normalized(cls, agentpress_tools: Dict[str, Any]) -> 'ToolConfiguration':
        normalized_tools = cls.normalize_agentpress_tools(agentpress_tools)
        return cls(tools=normalized_tools)
    
    def is_tool_enabled(self, tool_name: str) -> bool:
        tool_config = self.tools.get(tool_name, {})
        if isinstance(tool_config, bool):
            return tool_config
        return tool_config.get('enabled', False)
    
    def get_enabled_tools(self) -> List[str]:
        return [
            name for name, config in self.tools.items()
            if self.is_tool_enabled(name)
        ]


@dataclass
class AgentVersion:
    version_id: VersionId
    agent_id: AgentId
    version_number: VersionNumber
    version_name: str
    system_prompt: SystemPrompt
    configured_mcps: List[MCPConfiguration]
    custom_mcps: List[MCPConfiguration]
    tool_configuration: ToolConfiguration
    status: VersionStatus
    created_at: datetime
    updated_at: datetime
    created_by: UserId
    change_description: Optional[str] = None
    previous_version_id: Optional[VersionId] = None
    
    @property
    def is_active(self) -> bool:
        return self.status == VersionStatus.ACTIVE
    
    def activate(self) -> None:
        self.status = VersionStatus.ACTIVE
        self.updated_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        self.status = VersionStatus.INACTIVE
        self.updated_at = datetime.utcnow()
    
    def archive(self) -> None:
        self.status = VersionStatus.ARCHIVED
        self.updated_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'version_id': str(self.version_id),
            'agent_id': str(self.agent_id),
            'version_number': self.version_number.value,
            'version_name': self.version_name,
            'system_prompt': self.system_prompt.value,
            'configured_mcps': [
                {
                    'name': mcp.name,
                    'type': mcp.type,
                    'config': mcp.config,
                    'enabled_tools': mcp.enabled_tools
                }
                for mcp in self.configured_mcps
            ],
            'custom_mcps': [
                {
                    'name': mcp.name,
                    'type': mcp.type,
                    'config': mcp.config,
                    'enabled_tools': mcp.enabled_tools
                }
                for mcp in self.custom_mcps
            ],
            'agentpress_tools': self.tool_configuration.tools,
            'is_active': self.is_active,
            'status': self.status.value,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'created_by': str(self.created_by),
            'change_description': self.change_description,
            'previous_version_id': str(self.previous_version_id) if self.previous_version_id else None
        }
