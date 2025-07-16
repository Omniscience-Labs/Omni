from dataclasses import dataclass
from typing import Optional
from datetime import datetime
import hashlib
import re


@dataclass(frozen=True)
class ExternalUserId:
    value: str
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ExternalUserId must be a non-empty string")
        if len(self.value) > 255:
            raise ValueError("ExternalUserId must be less than 255 characters")


@dataclass(frozen=True)
class AppSlug:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("AppSlug must be a non-empty string")
        if not re.match(r'^[a-z0-9_-]+$', self.value):
            raise ValueError("AppSlug must contain only lowercase letters, numbers, hyphens, and underscores")


@dataclass(frozen=True)
class ProfileName:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ProfileName must be a non-empty string")
        if len(self.value) > 100:
            raise ValueError("ProfileName must be less than 100 characters")


@dataclass(frozen=True)
class ConnectionToken:
    value: str
    expires_at: Optional[datetime] = None
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ConnectionToken must be a non-empty string")
    
    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at


@dataclass(frozen=True)
class MCPServerUrl:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("MCPServerUrl must be a non-empty string")
        if not self.value.startswith(('http://', 'https://')):
            raise ValueError("MCPServerUrl must be a valid HTTP/HTTPS URL")


@dataclass(frozen=True)
class EncryptedConfig:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("EncryptedConfig must be a non-empty string")


@dataclass(frozen=True)
class ConfigHash:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("ConfigHash must be a non-empty string")
        if len(self.value) != 64:
            raise ValueError("ConfigHash must be a 64-character SHA256 hash")
    
    @classmethod
    def from_config(cls, config: str) -> 'ConfigHash':
        hash_value = hashlib.sha256(config.encode()).hexdigest()
        return cls(hash_value)


@dataclass(frozen=True)
class PaginationCursor:
    value: Optional[str] = None
    
    def has_more(self) -> bool:
        return self.value is not None


@dataclass(frozen=True)
class SearchQuery:
    value: Optional[str] = None
    
    def is_empty(self) -> bool:
        return not self.value or not self.value.strip()


@dataclass(frozen=True)
class Category:
    value: str
    
    def __post_init__(self):
        if not self.value or not isinstance(self.value, str):
            raise ValueError("Category must be a non-empty string") 