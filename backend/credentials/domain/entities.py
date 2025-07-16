from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Any, Optional


@dataclass(frozen=True)
class MCPCredential:
    credential_id: str
    account_id: str
    mcp_qualified_name: str
    display_name: str
    config: Dict[str, Any]
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(frozen=True)
class MCPCredentialProfile:
    profile_id: str
    account_id: str
    mcp_qualified_name: str
    profile_name: str
    display_name: str
    config: Dict[str, Any]
    is_active: bool
    is_default: bool
    last_used_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(frozen=True)
class MCPRequirement:
    qualified_name: str
    display_name: str
    enabled_tools: List[str] = field(default_factory=list)
    required_config: List[str] = field(default_factory=list)
    custom_type: Optional[str] = None


@dataclass(frozen=True)
class CredentialMapping:
    qualified_name: str
    profile_id: str
    profile_name: str
    display_name: str


@dataclass
class CredentialRequest:
    account_id: str
    mcp_qualified_name: str
    display_name: str
    config: Dict[str, Any]


@dataclass
class ProfileRequest:
    account_id: str
    mcp_qualified_name: str
    profile_name: str
    display_name: str
    config: Dict[str, Any]
    is_default: bool = False 