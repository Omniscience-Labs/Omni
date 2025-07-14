from typing import List, Optional, Dict, Any

from ..domain.entities import (
    AgentTemplate, TemplateInstallationRequest, TemplateInstallationResult,
    MCPRequirementValue, QualifiedName, ProfileId, ConfigType
)
from ..domain.exceptions import TemplateNotFoundError, TemplateInstallationError, InvalidCredentialError
from ..repositories.template_repository import TemplateRepository
from ..repositories.agent_repository import AgentRepository
from ..support.validator import TemplateValidator
from ..support.config_builder import ConfigBuilder
from ..protocols import VersionManager, CredentialManager, ProfileManager, Logger


class TemplateInstallationService:
    def __init__(
        self,
        template_repo: TemplateRepository,
        agent_repo: AgentRepository,
        version_manager: VersionManager,
        credential_manager: CredentialManager,
        profile_manager: Optional[ProfileManager],
        validator: TemplateValidator,
        config_builder: ConfigBuilder,
        logger: Logger
    ):
        self._template_repo = template_repo
        self._agent_repo = agent_repo
        self._version_manager = version_manager
        self._credential_manager = credential_manager
        self._profile_manager = profile_manager
        self._validator = validator
        self._config_builder = config_builder
        self._logger = logger
    
    async def install(self, request: TemplateInstallationRequest) -> TemplateInstallationResult:
        self._logger.info(f"Installing template {request.template_id} for user {request.account_id}")
        
        template = await self._template_repo.find_by_id(request.template_id)
        if not template:
            raise TemplateNotFoundError("Template not found")
        
        self._validator.validate_access(template, request.account_id)
        
        if not request.profile_mappings:
            request.profile_mappings = await self._auto_map_profiles(
                template.mcp_requirements,
                request.account_id
            )
        
        missing_profiles, missing_configs = self._validator.validate_installation_requirements(
            template.mcp_requirements,
            request.profile_mappings,
            request.custom_mcp_configs
        )
        
        if missing_profiles or missing_configs:
            return TemplateInstallationResult(
                status='configs_required',
                missing_regular_credentials=missing_profiles,
                missing_custom_configs=missing_configs,
                template_info={
                    'template_id': template.template_id,
                    'name': template.name,
                    'description': template.description
                }
            )
        
        configured_mcps, custom_mcps = await self._build_mcp_configs(
            template.mcp_requirements,
            request.profile_mappings,
            request.custom_mcp_configs,
            request.account_id
        )
        
        agent_id = await self._create_agent(
            template,
            request,
            configured_mcps,
            custom_mcps
        )
        
        await self._create_initial_version(
            agent_id,
            request.account_id,
            template,
            configured_mcps,
            custom_mcps,
            request.custom_system_prompt
        )
        
        await self._template_repo.increment_download_count(template.template_id)
        
        agent_name = request.instance_name or f"{template.name} (from marketplace)"
        self._logger.info(f"Successfully installed template {template.template_id} as agent {agent_id}")
        
        return TemplateInstallationResult(
            status='installed',
            instance_id=agent_id,
            name=agent_name
        )
    
    async def _auto_map_profiles(
        self,
        requirements: List[MCPRequirementValue],
        account_id: str
    ) -> Dict[QualifiedName, ProfileId]:
        profile_mappings = {}
        
        for req in requirements:
            if not req.is_custom():
                default_profile = await self._credential_manager.get_default_credential_profile(
                    account_id, req.qualified_name
                )
                
                if default_profile:
                    profile_mappings[req.qualified_name] = default_profile.profile_id
                    self._logger.info(f"Auto-mapped {req.qualified_name} to profile {default_profile.profile_id}")
        
        return profile_mappings
    
    async def _build_mcp_configs(
        self,
        requirements: List[MCPRequirementValue],
        profile_mappings: Dict[QualifiedName, ProfileId],
        custom_configs: Optional[Dict[QualifiedName, ConfigType]],
        account_id: str
    ) -> tuple[List[ConfigType], List[ConfigType]]:
        configured_mcps = []
        custom_mcps = []
        
        for req in requirements:
            if req.is_custom():
                config = await self._build_custom_mcp_config(req, custom_configs, account_id)
                if config:
                    custom_mcps.append(config)
            else:
                config = await self._build_regular_mcp_config(req, profile_mappings, account_id)
                if config:
                    configured_mcps.append(config)
        
        return configured_mcps, custom_mcps
    
    async def _build_custom_mcp_config(
        self,
        req: MCPRequirementValue,
        custom_configs: Optional[Dict[QualifiedName, ConfigType]],
        account_id: str
    ) -> Optional[ConfigType]:
        if not custom_configs or req.qualified_name not in custom_configs:
            return None
        
        provided_config = custom_configs[req.qualified_name]
        
        if req.custom_type == 'pipedream' and self._profile_manager:
            profile_id = provided_config.get('profile_id')
            if profile_id:
                profile = await self._profile_manager.get_profile(account_id, profile_id)
                if profile:
                    provided_config = {
                        'app_slug': profile.app_slug,
                        'profile_id': profile_id,
                        'url': 'https://remote.mcp.pipedream.net',
                        'headers': {'x-pd-app-slug': profile.app_slug}
                    }
        
        return await self._config_builder.build_mcp_config(req, provided_config, self._logger)
    
    async def _build_regular_mcp_config(
        self,
        req: MCPRequirementValue,
        profile_mappings: Dict[QualifiedName, ProfileId],
        account_id: str
    ) -> Optional[ConfigType]:
        profile_id = profile_mappings.get(req.qualified_name)
        if not profile_id:
            return None
        
        profile = await self._credential_manager.get_credential_by_profile(account_id, profile_id)
        if not profile:
            raise InvalidCredentialError(f"Credential profile not found for {req.display_name}")
        
        if not profile.is_active:
            raise InvalidCredentialError(f"Credential profile is inactive for {req.display_name}")
        
        return await self._config_builder.build_mcp_config(req, profile, self._logger)
    
    async def _create_agent(
        self,
        template: AgentTemplate,
        request: TemplateInstallationRequest,
        configured_mcps: List[ConfigType],
        custom_mcps: List[ConfigType]
    ) -> str:
        system_prompt = request.custom_system_prompt or template.system_prompt
        
        unified_config = self._config_builder.build_unified_config(
            system_prompt=system_prompt,
            agentpress_tools=template.agentpress_tools,
            configured_mcps=configured_mcps,
            custom_mcps=custom_mcps,
            avatar=template.avatar,
            avatar_color=template.avatar_color
        )
        
        agent_data = {
            'account_id': request.account_id,
            'name': request.instance_name or f"{template.name} (from marketplace)",
            'description': template.description,
            'config': unified_config,
            'system_prompt': system_prompt,
            'configured_mcps': configured_mcps,
            'custom_mcps': custom_mcps,
            'agentpress_tools': template.agentpress_tools,
            'is_default': False,
            'avatar': template.avatar,
            'avatar_color': template.avatar_color,
            'version_count': 1
        }
        
        return await self._agent_repo.create_from_template(agent_data)
    
    async def _create_initial_version(
        self,
        agent_id: str,
        account_id: str,
        template: AgentTemplate,
        configured_mcps: List[ConfigType],
        custom_mcps: List[ConfigType],
        custom_system_prompt: Optional[str]
    ) -> None:
        try:
            version = await self._version_manager.create_version(
                agent_id=agent_id,
                user_id=account_id,
                system_prompt=custom_system_prompt or template.system_prompt,
                configured_mcps=configured_mcps,
                custom_mcps=custom_mcps,
                agentpress_tools=template.agentpress_tools,
                version_name="v1",
                change_description=f"Initial version from template {template.name}"
            )
            
            await self._agent_repo.update_version_info(
                agent_id=agent_id,
                version_id=version['version_id'],
                version_count=1
            )
            
        except Exception as e:
            await self._agent_repo.delete(agent_id)
            raise TemplateInstallationError(f"Failed to create initial version: {str(e)}") 