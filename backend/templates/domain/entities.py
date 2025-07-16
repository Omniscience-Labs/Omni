from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional


ConfigType = Dict[str, Any]
ProfileId = str
QualifiedName = str


@dataclass(frozen=True)
class MCPRequirementValue:
    qualified_name: str
    display_name: str
    enabled_tools: List[str] = field(default_factory=list)
    required_config: List[str] = field(default_factory=list)
    custom_type: Optional[str] = None
    
    def is_custom(self) -> bool:
        return self.custom_type is not None


@dataclass(frozen=True)
class AgentTemplate:
    template_id: str
    creator_id: str
    name: str
    system_prompt: str
    mcp_requirements: List[MCPRequirementValue]
    agentpress_tools: ConfigType
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    is_public: bool = False
    marketplace_published_at: Optional[datetime] = None
    download_count: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    avatar: Optional[str] = None
    avatar_color: Optional[str] = None
    metadata: ConfigType = field(default_factory=dict)
    
    def with_public_status(self, is_public: bool, published_at: Optional[datetime] = None) -> 'AgentTemplate':
        return AgentTemplate(
            **{**self.__dict__, 
               'is_public': is_public, 
               'marketplace_published_at': published_at}
        )


@dataclass(frozen=True)
class AgentInstance:
    instance_id: str
    account_id: str
    name: str
    template_id: Optional[str] = None
    description: Optional[str] = None
    credential_mappings: Dict[QualifiedName, ProfileId] = field(default_factory=dict)
    custom_system_prompt: Optional[str] = None
    is_active: bool = True
    is_default: bool = False
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    avatar: Optional[str] = None
    avatar_color: Optional[str] = None


@dataclass
class TemplateInstallationRequest:
    template_id: str
    account_id: str
    instance_name: Optional[str] = None
    custom_system_prompt: Optional[str] = None
    profile_mappings: Optional[Dict[QualifiedName, ProfileId]] = None
    custom_mcp_configs: Optional[Dict[QualifiedName, ConfigType]] = None


@dataclass
class TemplateInstallationResult:
    status: str
    instance_id: Optional[str] = None
    name: Optional[str] = None
    missing_regular_credentials: List[Dict[str, Any]] = field(default_factory=list)
    missing_custom_configs: List[Dict[str, Any]] = field(default_factory=list)
    template_info: Optional[Dict[str, Any]] = None 