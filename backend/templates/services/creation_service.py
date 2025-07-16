from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from uuid import uuid4

from ..domain.entities import AgentTemplate, ConfigType, MCPRequirementValue
from ..domain.exceptions import TemplateNotFoundError, TemplateAccessDeniedError
from ..repositories.template_repository import TemplateRepository
from ..repositories.agent_repository import AgentRepository
from ..support.validator import TemplateValidator
from ..support.factory import MCPRequirementFactory
from ..protocols import VersionManager, Logger


class TemplateCreationService:
    def __init__(
        self,
        template_repo: TemplateRepository,
        agent_repo: AgentRepository,
        version_manager: Optional[VersionManager],
        validator: TemplateValidator,
        factory: MCPRequirementFactory,
        logger: Logger
    ):
        self._template_repo = template_repo
        self._agent_repo = agent_repo
        self._version_manager = version_manager
        self._validator = validator
        self._factory = factory
        self._logger = logger
    
    async def create_from_agent(
        self,
        agent_id: str,
        creator_id: str,
        make_public: bool = False,
        tags: Optional[List[str]] = None
    ) -> str:
        self._logger.info(f"Creating template from agent {agent_id} for user {creator_id}")
        
        agent = await self._agent_repo.find_by_id(agent_id)
        if not agent:
            raise TemplateNotFoundError("Agent not found")
        
        if agent['account_id'] != creator_id:
            raise TemplateAccessDeniedError("You can only create templates from your own agents")
        
        version_data = await self._get_version_data(agent, creator_id)
        config = self._extract_config(agent, version_data)
        mcp_requirements = self._build_requirements(
            config['configured_mcps'],
            config['custom_mcps']
        )
        
        template = AgentTemplate(
            template_id=str(uuid4()),
            creator_id=creator_id,
            name=agent['name'],
            description=agent.get('description'),
            system_prompt=config['system_prompt'],
            mcp_requirements=mcp_requirements,
            agentpress_tools=config['agentpress_tools'],
            tags=tags or [],
            is_public=make_public,
            marketplace_published_at=datetime.now(timezone.utc) if make_public else None,
            avatar=agent.get('avatar'),
            avatar_color=agent.get('avatar_color'),
            metadata={
                'source_agent_id': agent_id,
                'source_version_id': agent.get('current_version_id'),
                'source_version_name': version_data.get('version_name', 'v1') if version_data else 'legacy'
            }
        )
        
        saved_template = await self._template_repo.save(template)
        self._logger.info(f"Successfully created template {saved_template.template_id}")
        return saved_template.template_id
    
    async def _get_version_data(self, agent: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
        if not self._version_manager or not agent.get('current_version_id'):
            return None
        
        try:
            return await self._version_manager.get_version(
                agent_id=agent['agent_id'],
                version_id=agent['current_version_id'],
                user_id=user_id
            )
        except Exception as e:
            self._logger.warning(f"Failed to get version data: {e}")
            return None
    
    def _extract_config(self, agent: Dict[str, Any], version_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if version_data:
            self._logger.info(f"Using version config for template creation")
            configured_mcps = version_data.get('configured_mcps', [])
            custom_mcps = version_data.get('custom_mcps', [])
            self._logger.info(f"Version data - configured_mcps: {len(configured_mcps)}, custom_mcps: {len(custom_mcps)}")
            return {
                'system_prompt': version_data.get('system_prompt', ''),
                'agentpress_tools': version_data.get('agentpress_tools', {}),
                'configured_mcps': configured_mcps,
                'custom_mcps': custom_mcps
            }
        else:
            self._logger.info(f"Using legacy config for template creation")
            config = agent.get('config', {})
            if config and config != {}:
                self._logger.info(f"Found unified config, extracting MCP data from it")
                tools = config.get('tools', {})
                configured_mcps = tools.get('mcp', [])
                custom_mcps = tools.get('custom_mcp', [])
                system_prompt = config.get('system_prompt', agent.get('system_prompt', ''))
                agentpress_tools = tools.get('agentpress', agent.get('agentpress_tools', {}))
            else:
                self._logger.info(f"No unified config, using legacy columns")
                configured_mcps = agent.get('configured_mcps', [])
                custom_mcps = agent.get('custom_mcps', [])
                system_prompt = agent.get('system_prompt', '')
                agentpress_tools = agent.get('agentpress_tools', {})
            
            self._logger.info(f"Extracted data - configured_mcps: {len(configured_mcps)}, custom_mcps: {len(custom_mcps)}")
            self._logger.debug(f"Agent keys: {list(agent.keys())}")
            
            return {
                'system_prompt': system_prompt,
                'agentpress_tools': agentpress_tools,
                'configured_mcps': configured_mcps,
                'custom_mcps': custom_mcps
            }
    
    def _build_requirements(
        self,
        configured_mcps: List[ConfigType],
        custom_mcps: List[ConfigType]
    ) -> List[MCPRequirementValue]:
        requirements = []
        
        self._logger.info(f"Building requirements from {len(configured_mcps)} configured MCPs and {len(custom_mcps)} custom MCPs")
        
        for i, mcp in enumerate(configured_mcps):
            self._logger.debug(f"Processing configured MCP {i}: {mcp}")
            if isinstance(mcp, dict):
                has_qualified_name = 'qualifiedName' in mcp or 'qualified_name' in mcp
                if has_qualified_name:
                    try:
                        req = self._factory.from_configured_mcp(mcp)
                        requirements.append(req)
                        self._logger.info(f"Added configured requirement: {req.qualified_name}")
                    except Exception as e:
                        self._logger.error(f"Error processing configured MCP {i}: {e}")
                        self._logger.debug(f"Failed MCP data: {mcp}")
                else:
                    self._logger.warning(f"Skipping configured MCP {i}: missing qualifiedName field")
            else:
                self._logger.warning(f"Skipping configured MCP {i}: not a dict")
        
        for i, custom_mcp in enumerate(custom_mcps):
            self._logger.debug(f"Processing custom MCP {i}: {custom_mcp}")
            if isinstance(custom_mcp, dict) and 'name' in custom_mcp:
                try:
                    req = self._factory.from_custom_mcp(custom_mcp)
                    requirements.append(req)
                    self._logger.info(f"Added custom requirement: {req.qualified_name}")
                except Exception as e:
                    self._logger.error(f"Error processing custom MCP {i}: {e}")
                    self._logger.debug(f"Failed custom MCP data: {custom_mcp}")
            else:
                self._logger.warning(f"Skipping custom MCP {i}: missing name field or not dict")
        
        self._logger.info(f"Built {len(requirements)} total MCP requirements")
        return requirements 