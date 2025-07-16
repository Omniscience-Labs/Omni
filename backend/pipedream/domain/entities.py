from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum

from .value_objects import (
    ExternalUserId, AppSlug, ProfileName, ConnectionToken, 
    MCPServerUrl, EncryptedConfig, ConfigHash
)


class ConnectionStatus(Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"
    PENDING = "pending"


class AuthType(Enum):
    OAUTH = "oauth"
    API_KEY = "api_key"
    BASIC = "basic"
    NONE = "none"
    KEYS = "keys"
    CUSTOM = "custom"
    
    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            return cls.CUSTOM
        return super()._missing_(value)


@dataclass
class MCPTool:
    name: str
    description: str
    input_schema: Dict[str, Any]
    
    def is_valid(self) -> bool:
        return bool(self.name and self.description and self.input_schema)


@dataclass
class MCPServer:
    app_slug: AppSlug
    app_name: str
    server_url: MCPServerUrl
    project_id: str
    environment: str
    external_user_id: ExternalUserId
    oauth_app_id: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    available_tools: List[MCPTool] = field(default_factory=list)
    error_message: Optional[str] = None
    
    def is_connected(self) -> bool:
        return self.status == ConnectionStatus.CONNECTED
    
    def add_tool(self, tool: MCPTool) -> None:
        if tool.is_valid():
            self.available_tools.append(tool)
    
    def get_tool_count(self) -> int:
        return len(self.available_tools)


@dataclass
class App:
    name: str
    slug: AppSlug
    description: str
    category: str
    logo_url: Optional[str] = None
    auth_type: AuthType = AuthType.OAUTH
    is_verified: bool = False
    url: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    featured_weight: int = 0
    
    def is_featured(self) -> bool:
        return self.featured_weight > 0


@dataclass
class Connection:
    external_user_id: ExternalUserId
    app: App
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    
    def activate(self) -> None:
        self.is_active = True
        self.updated_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        self.is_active = False
        self.updated_at = datetime.utcnow()


@dataclass
class Profile:
    profile_id: UUID
    account_id: UUID
    mcp_qualified_name: str
    profile_name: ProfileName
    display_name: str
    encrypted_config: EncryptedConfig
    config_hash: ConfigHash
    app_slug: AppSlug
    app_name: str
    external_user_id: ExternalUserId
    enabled_tools: List[str] = field(default_factory=list)
    is_active: bool = True
    is_default: bool = False
    is_connected: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    last_used_at: Optional[datetime] = None
    
    def update_last_used(self) -> None:
        self.last_used_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def activate(self) -> None:
        self.is_active = True
        self.updated_at = datetime.utcnow()
    
    def deactivate(self) -> None:
        self.is_active = False
        self.updated_at = datetime.utcnow()
    
    def set_as_default(self) -> None:
        self.is_default = True
        self.updated_at = datetime.utcnow()
    
    def unset_as_default(self) -> None:
        self.is_default = False
        self.updated_at = datetime.utcnow()
    
    def update_connection_status(self, is_connected: bool) -> None:
        self.is_connected = is_connected
        self.updated_at = datetime.utcnow()
    
    def enable_tool(self, tool_name: str) -> None:
        if tool_name not in self.enabled_tools:
            self.enabled_tools.append(tool_name)
            self.updated_at = datetime.utcnow()
    
    def disable_tool(self, tool_name: str) -> None:
        if tool_name in self.enabled_tools:
            self.enabled_tools.remove(tool_name)
            self.updated_at = datetime.utcnow()
    
    def get_mcp_qualified_name(self) -> str:
        return f"pipedream:{self.app_slug.value}" 