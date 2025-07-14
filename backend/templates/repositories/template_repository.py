from abc import abstractmethod
from typing import List, Optional, Dict, Any

from .base import Repository
from ..domain.entities import AgentTemplate, MCPRequirementValue
from ..protocols import DatabaseConnection, Logger


class TemplateRepository(Repository[AgentTemplate]):
    @abstractmethod
    async def find_by_creator(
        self, creator_id: str, limit: int = 50, offset: int = 0
    ) -> List[AgentTemplate]:
        pass
    
    @abstractmethod
    async def find_public(
        self, limit: int = 50, offset: int = 0, 
        search: Optional[str] = None, tags: Optional[List[str]] = None
    ) -> List[AgentTemplate]:
        pass
    
    @abstractmethod
    async def increment_download_count(self, template_id: str) -> None:
        pass


class SupabaseTemplateRepository(TemplateRepository):
    def __init__(self, db: DatabaseConnection, logger: Logger):
        self._db = db
        self._logger = logger
    
    async def find_by_id(self, template_id: str) -> Optional[AgentTemplate]:
        try:
            client = await self._db.client
            result = await client.table('agent_templates').select('*')\
                .eq('template_id', template_id).execute()
            
            if not result.data:
                return None
            
            return self._map_to_template(result.data[0])
            
        except Exception as e:
            self._logger.error(f"Error finding template {template_id}: {str(e)}")
            return None
    
    async def save(self, template: AgentTemplate) -> AgentTemplate:
        try:
            client = await self._db.client
            template_data = self._map_to_db(template)
            
            existing_template = await self.find_by_id(template.template_id)
            if existing_template:
                result = await client.table('agent_templates')\
                    .update(template_data)\
                    .eq('template_id', template.template_id)\
                    .execute()
            else:
                template_data.pop('created_at', None)
                template_data.pop('updated_at', None)
                result = await client.table('agent_templates')\
                    .insert(template_data)\
                    .execute()
            
            if not result.data:
                raise Exception("Failed to save template")
            
            return self._map_to_template(result.data[0])
            
        except Exception as e:
            self._logger.error(f"Error saving template: {str(e)}")
            raise Exception(f"Failed to save template: {str(e)}")
    
    async def delete(self, template_id: str) -> bool:
        try:
            client = await self._db.client
            result = await client.table('agent_templates')\
                .delete()\
                .eq('template_id', template_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            self._logger.error(f"Error deleting template {template_id}: {str(e)}")
            return False
    
    async def find_by_creator(
        self, creator_id: str, limit: int = 50, offset: int = 0
    ) -> List[AgentTemplate]:
        try:
            client = await self._db.client
            result = await client.table('agent_templates')\
                .select('*')\
                .eq('creator_id', creator_id)\
                .order('created_at', desc=True)\
                .range(offset, offset + limit - 1)\
                .execute()
            
            return [self._map_to_template(data) for data in result.data]
            
        except Exception as e:
            self._logger.error(f"Error finding templates by creator: {str(e)}")
            return []
    
    async def find_public(
        self, limit: int = 50, offset: int = 0,
        search: Optional[str] = None, tags: Optional[List[str]] = None
    ) -> List[AgentTemplate]:
        try:
            client = await self._db.client
            query = client.table('agent_templates')\
                .select('*')\
                .eq('is_public', True)\
                .order('is_kortix_team', desc=True)\
                .order('marketplace_published_at', desc=True)\
                .range(offset, offset + limit - 1)
            
            if search:
                query = query.or_(f'name.ilike.%{search}%,description.ilike.%{search}%')
            
            if tags:
                query = query.overlaps('tags', tags)
            
            result = await query.execute()
            return [self._map_to_template(data) for data in result.data]
            
        except Exception as e:
            self._logger.error(f"Error finding public templates: {str(e)}")
            return []
    
    async def increment_download_count(self, template_id: str) -> None:
        try:
            client = await self._db.client
            template = await self.find_by_id(template_id)
            if template:
                await client.table('agent_templates')\
                    .update({'download_count': template.download_count + 1})\
                    .eq('template_id', template_id)\
                    .execute()
                    
        except Exception as e:
            self._logger.error(f"Error incrementing download count: {str(e)}")
    
    def _map_to_template(self, data: Dict[str, Any]) -> AgentTemplate:
        mcp_requirements = []
        for req_data in data.get('mcp_requirements', []):
            mcp_requirements.append(MCPRequirementValue(
                qualified_name=req_data.get('qualified_name') or req_data.get('qualifiedName'),
                display_name=req_data.get('display_name') or req_data.get('name'),
                enabled_tools=req_data.get('enabled_tools') or req_data.get('enabledTools', []),
                required_config=req_data.get('required_config') or req_data.get('requiredConfig', []),
                custom_type=req_data.get('custom_type')
            ))
        
        return AgentTemplate(
            template_id=data['template_id'],
            creator_id=data['creator_id'],
            name=data['name'],
            description=data.get('description'),
            system_prompt=data['system_prompt'],
            mcp_requirements=mcp_requirements,
            agentpress_tools=data.get('agentpress_tools', {}),
            tags=data.get('tags', []),
            is_public=data.get('is_public', False),
            marketplace_published_at=data.get('marketplace_published_at'),
            download_count=data.get('download_count', 0),
            created_at=data['created_at'],
            updated_at=data['updated_at'],
            avatar=data.get('avatar'),
            avatar_color=data.get('avatar_color'),
            metadata=data.get('metadata', {})
        )
    
    def _map_to_db(self, template: AgentTemplate) -> Dict[str, Any]:
        kortix_team_account_ids = ['xxxxxxxx']
        is_kortix_team = template.creator_id in kortix_team_account_ids
        
        return {
            'template_id': template.template_id,
            'creator_id': template.creator_id,
            'name': template.name,
            'description': template.description,
            'system_prompt': template.system_prompt,
            'mcp_requirements': [
                {
                    'qualified_name': req.qualified_name,
                    'display_name': req.display_name,
                    'enabled_tools': req.enabled_tools,
                    'required_config': req.required_config,
                    'custom_type': req.custom_type
                }
                for req in template.mcp_requirements
            ],
            'agentpress_tools': template.agentpress_tools,
            'tags': template.tags,
            'is_public': template.is_public,
            'is_kortix_team': is_kortix_team,
            'marketplace_published_at': template.marketplace_published_at.isoformat() if template.marketplace_published_at else None,
            'download_count': template.download_count,
            'avatar': template.avatar,
            'avatar_color': template.avatar_color,
            'metadata': template.metadata
        } 