import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from uuid import uuid4
import secrets
import string

from core.services.supabase import DBConnection
from core.utils.logger import logger

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
    toolkit_slug: Optional[str] = None
    app_slug: Optional[str] = None
    source: Optional[str] = None
    trigger_index: Optional[int] = None
    
    def is_custom(self) -> bool:
        if self.custom_type == 'composio' or self.qualified_name.startswith('composio.'):
            return False
        return self.custom_type is not None and self.qualified_name.startswith('custom_')

@dataclass(frozen=True)
class AgentTemplate:
    template_id: str
    creator_id: str
    name: str
    config: ConfigType
    tags: List[str] = field(default_factory=list)
    is_public: bool = False
    is_kortix_team: bool = False
    marketplace_published_at: Optional[datetime] = None
    download_count: int = 0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    icon_name: Optional[str] = None
    icon_color: Optional[str] = None
    icon_background: Optional[str] = None
    metadata: ConfigType = field(default_factory=dict)
    creator_name: Optional[str] = None
            'icon_name': template.icon_name,
            'icon_color': template.icon_color,
            'icon_background': template.icon_background,
            'metadata': template.metadata,
            'usage_examples': template.usage_examples
        }
        
        await client.table('agent_templates').insert(template_data).execute()
    
    def _map_to_template(self, data: Dict[str, Any]) -> AgentTemplate:
        creator_name = data.get('creator_name')
        
        usage_examples = data.get('usage_examples', [])
        logger.debug(f"Mapping template {data.get('template_id')}: usage_examples from DB = {usage_examples}")
        logger.debug(f"Raw data keys: {list(data.keys())}")
        
        return AgentTemplate(
            template_id=data['template_id'],
            creator_id=data['creator_id'],
            name=data['name'],
            config=data.get('config', {}),
            tags=data.get('tags', []),
            is_public=data.get('is_public', False),
            is_kortix_team=data.get('is_kortix_team', False),
            marketplace_published_at=datetime.fromisoformat(data['marketplace_published_at'].replace('Z', '+00:00')) if data.get('marketplace_published_at') else None,
            download_count=data.get('download_count', 0),
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            updated_at=datetime.fromisoformat(data['updated_at'].replace('Z', '+00:00')),
            icon_name=data.get('icon_name'),
            icon_color=data.get('icon_color'),
            icon_background=data.get('icon_background'),
            metadata=data.get('metadata', {}),
            creator_name=creator_name,
            usage_examples=usage_examples
        )
    
    # Share link functionality removed - now using direct template ID URLs for simplicity

def get_template_service(db_connection: DBConnection) -> TemplateService:
    return TemplateService(db_connection) 