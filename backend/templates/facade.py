import logging
from typing import Dict, List, Any, Optional

from .domain.entities import AgentTemplate, AgentInstance, TemplateInstallationRequest
from .repositories.template_repository import SupabaseTemplateRepository
from .repositories.agent_repository import SupabaseAgentRepository
from .services.creation_service import TemplateCreationService
from .services.installation_service import TemplateInstallationService
from .services.marketplace_service import MarketplaceService
from .support.validator import TemplateValidator
from .support.factory import MCPRequirementFactory
from .support.config_builder import ConfigBuilder
from .protocols import DatabaseConnection, VersionManager, CredentialManager, ProfileManager, Logger


class TemplateManager:
    def __init__(
        self,
        db: Optional[DatabaseConnection] = None,
        version_manager: Optional[VersionManager] = None,
        credential_manager: Optional[CredentialManager] = None,
        profile_manager: Optional[ProfileManager] = None,
        logger: Optional[Logger] = None
    ):
        self._logger = logger or logging.getLogger(__name__)
        
        if db is None:
            from services.supabase import DBConnection
            self._db = DBConnection()
        else:
            self._db = db
        
        self._template_repo = SupabaseTemplateRepository(self._db, self._logger)
        self._agent_repo = SupabaseAgentRepository(self._db, self._logger)
        
        self._validator = TemplateValidator(self._logger)
        self._factory = MCPRequirementFactory()
        self._config_builder = ConfigBuilder(self._logger)
        
        self._creation_service = TemplateCreationService(
            self._template_repo,
            self._agent_repo,
            version_manager,
            self._validator,
            self._factory,
            self._logger
        )
        
        self._installation_service = TemplateInstallationService(
            self._template_repo,
            self._agent_repo,
            version_manager,
            credential_manager,
            profile_manager,
            self._validator,
            self._config_builder,
            self._logger
        )
        
        self._marketplace_service = MarketplaceService(
            self._template_repo,
            self._agent_repo,
            self._validator,
            self._logger
        )
    
    async def create_template_from_agent(
        self,
        agent_id: str,
        creator_id: str,
        make_public: bool = False,
        tags: Optional[List[str]] = None
    ) -> str:
        return await self._creation_service.create_from_agent(
            agent_id, creator_id, make_public, tags
        )
    
    async def get_template(self, template_id: str) -> Optional[AgentTemplate]:
        return await self._template_repo.find_by_id(template_id)
    
    async def get_user_templates(
        self,
        creator_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        templates = await self._template_repo.find_by_creator(creator_id, limit, offset)
        return [self._format_template(t) for t in templates]
    
    async def install_template(
        self,
        template_id: str,
        account_id: str,
        instance_name: Optional[str] = None,
        custom_system_prompt: Optional[str] = None,
        profile_mappings: Optional[Dict[str, str]] = None,
        custom_mcp_configs: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        request = TemplateInstallationRequest(
            template_id=template_id,
            account_id=account_id,
            instance_name=instance_name,
            custom_system_prompt=custom_system_prompt,
            profile_mappings=profile_mappings,
            custom_mcp_configs=custom_mcp_configs
        )
        
        result = await self._installation_service.install(request)
        
        return {
            'status': result.status,
            'instance_id': result.instance_id,
            'name': result.name,
            'missing_regular_credentials': result.missing_regular_credentials,
            'missing_custom_configs': result.missing_custom_configs,
            'template': result.template_info
        }
    
    async def publish_template(
        self,
        template_id: str,
        creator_id: str,
        tags: Optional[List[str]] = None
    ) -> bool:
        return await self._marketplace_service.publish(template_id, creator_id, tags)
    
    async def unpublish_template(self, template_id: str, creator_id: str) -> bool:
        return await self._marketplace_service.unpublish(template_id, creator_id)
    
    async def get_marketplace_templates(
        self,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        return await self._marketplace_service.search(limit, offset, search, tags)
    
    async def get_agent_instance(self, instance_id: str) -> Optional[AgentInstance]:
        try:
            client = await self._db.client
            
            result = await client.table('agent_instances').select('*')\
                .eq('instance_id', instance_id).execute()
            
            if not result.data:
                return None
            
            instance_data = result.data[0]
            
            return AgentInstance(
                instance_id=instance_data['instance_id'],
                template_id=instance_data.get('template_id'),
                account_id=instance_data['account_id'],
                name=instance_data['name'],
                description=instance_data.get('description'),
                credential_mappings=instance_data.get('credential_mappings', {}),
                custom_system_prompt=instance_data.get('custom_system_prompt'),
                is_active=instance_data.get('is_active', True),
                is_default=instance_data.get('is_default', False),
                created_at=instance_data['created_at'],
                updated_at=instance_data['updated_at'],
                avatar=instance_data.get('avatar'),
                avatar_color=instance_data.get('avatar_color')
            )
            
        except Exception as e:
            self._logger.error(f"Error getting agent instance {instance_id}: {str(e)}")
            return None
    
    async def build_runtime_agent_config(self, instance_id: str) -> Dict[str, Any]:
        raise NotImplementedError("Runtime config building requires instance management implementation")
    
    async def _build_legacy_agent_config(self, instance_id: str) -> Dict[str, Any]:
        try:
            client = await self._db.client
            
            result = await client.table('agents').select('*').eq('agent_id', instance_id).execute()
            
            if not result.data:
                raise ValueError("Legacy agent not found")
            
            agent = result.data[0]
            return agent
            
        except Exception as e:
            self._logger.error(f"Error building legacy agent config: {str(e)}")
            raise
    
    def _format_template(self, template: AgentTemplate) -> Dict[str, Any]:
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
            'creator_name': 'You',
            'avatar': template.avatar,
            'avatar_color': template.avatar_color
        }
    
    def _create_mock_version_manager(self) -> VersionManager:
        from uuid import uuid4
        class MockVersionManager:
            async def create_version(self, **kwargs):
                return {'version_id': str(uuid4())}
            
            async def get_version(self, **kwargs):
                return None
        
        return MockVersionManager()
    
    def _create_mock_credential_manager(self) -> CredentialManager:
        class MockCredentialManager:
            async def get_default_credential_profile(self, account_id, qualified_name):
                return None
            
            async def get_credential_by_profile(self, account_id, profile_id):
                return None
        
        return MockCredentialManager() 