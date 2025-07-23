from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from ..domain.entities import AgentTemplate
from ..domain.exceptions import TemplateNotFoundError, SunaDefaultAgentTemplateError
from ..repositories.template_repository import TemplateRepository
from ..repositories.agent_repository import AgentRepository
from ..support.validator import TemplateValidator
from ..protocols import Logger


class MarketplaceService:
    def __init__(
        self,
        template_repo: TemplateRepository,
        agent_repo: AgentRepository,
        validator: TemplateValidator,
        logger: Logger
    ):
        self._template_repo = template_repo
        self._agent_repo = agent_repo
        self._validator = validator
        self._logger = logger
    
    async def _is_template_from_suna_default_agent(self, template: AgentTemplate) -> bool:
        source_agent_id = template.metadata.get('source_agent_id')
        if not source_agent_id:
            return False
        
        agent = await self._agent_repo.find_by_id(source_agent_id)
        if agent:
            metadata = agent.get('metadata', {})
            return metadata.get('is_suna_default', False)
        
        return False
    
    async def publish(
        self,
        template_id: str,
        creator_id: str,
        tags: Optional[List[str]] = None
    ) -> bool:
        template = await self._template_repo.find_by_id(template_id)
        if not template:
            raise TemplateNotFoundError("Template not found")
        
        self._validator.validate_ownership(template, creator_id)
        
        if await self._is_template_from_suna_default_agent(template):
            raise SunaDefaultAgentTemplateError("Cannot publish templates created from the default Suna agent")
        
        updated_template = template.with_public_status(
            is_public=True,
            published_at=datetime.now(timezone.utc)
        )
        
        if tags:
            updated_template = AgentTemplate(
                **{**updated_template.__dict__, 'tags': tags}
            )
        
        await self._template_repo.save(updated_template)
        self._logger.info(f"Published template {template_id} to marketplace")
        return True
    
    async def unpublish(self, template_id: str, creator_id: str) -> bool:
        template = await self._template_repo.find_by_id(template_id)
        if not template:
            raise TemplateNotFoundError("Template not found")
        
        self._validator.validate_ownership(template, creator_id)
        
        updated_template = template.with_public_status(is_public=False)
        await self._template_repo.save(updated_template)
        
        self._logger.info(f"Unpublished template {template_id} from marketplace")
        return True
    
    async def search(
        self,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        templates = await self._template_repo.find_public(limit, offset, search, tags)
        
        return [self._format_marketplace_template(t) for t in templates]
    
    def _format_marketplace_template(self, template: AgentTemplate) -> Dict[str, Any]:
        kortix_team_ids = ['xxxxxxxx']
        is_kortix = template.creator_id in kortix_team_ids
        
        return {
            'template_id': template.template_id,
            'name': template.name,
            'description': template.description,
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
            'download_count': template.download_count,
            'marketplace_published_at': template.marketplace_published_at,
            'created_at': template.created_at,
            'creator_name': 'Kortix Team' if is_kortix else 'Community',
            'avatar': template.avatar,
            'avatar_color': template.avatar_color,
            'is_kortix_team': is_kortix
        } 