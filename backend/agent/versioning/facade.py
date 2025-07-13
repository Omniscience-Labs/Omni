from typing import Dict, List, Optional, Any
from .domain.entities import AgentId, VersionId, UserId
from .services.version_service import VersionService
from .infrastructure.dependencies import get_version_service
from utils.logger import logger


class VersionManagerFacade:
    def __init__(self):
        self._service: Optional[VersionService] = None
    
    async def _get_service(self) -> VersionService:
        if not self._service:
            self._service = await get_version_service()
        return self._service
    
    async def create_version(
        self,
        agent_id: str,
        user_id: str,
        system_prompt: str,
        configured_mcps: List[Dict[str, Any]] = None,
        custom_mcps: List[Dict[str, Any]] = None,
        agentpress_tools: Dict[str, Any] = None,
        version_name: Optional[str] = None,
        change_description: Optional[str] = None
    ) -> Dict[str, Any]:
        service = await self._get_service()
        
        try:
            version = await service.create_version(
                agent_id=AgentId.from_string(agent_id),
                user_id=UserId.from_string(user_id),
                system_prompt=system_prompt,
                configured_mcps=configured_mcps or [],
                custom_mcps=custom_mcps or [],
                agentpress_tools=agentpress_tools or {},
                version_name=version_name,
                change_description=change_description
            )
            
            logger.info(f"Created version {version.version_name} for agent {agent_id}")
            return version.to_dict()
        except Exception as e:
            logger.error(f"Error creating version: {str(e)}")
            raise
    
    async def get_version(
        self, agent_id: str, version_id: str, user_id: str
    ) -> Dict[str, Any]:
        service = await self._get_service()
        
        try:
            version = await service.get_version(
                agent_id=AgentId.from_string(agent_id),
                version_id=VersionId.from_string(version_id),
                user_id=UserId.from_string(user_id)
            )
            
            return version.to_dict()
        except Exception as e:
            logger.error(f"Error getting version: {str(e)}")
            raise
    
    async def get_all_versions(
        self, agent_id: str, user_id: str
    ) -> List[Dict[str, Any]]:
        service = await self._get_service()
        
        try:
            versions = await service.get_all_versions(
                agent_id=AgentId.from_string(agent_id),
                user_id=UserId.from_string(user_id)
            )
            
            return [v.to_dict() for v in versions]
        except Exception as e:
            logger.error(f"Error getting versions: {str(e)}")
            raise
    
    async def activate_version(
        self, agent_id: str, version_id: str, user_id: str
    ) -> None:
        service = await self._get_service()
        
        try:
            await service.activate_version(
                agent_id=AgentId.from_string(agent_id),
                version_id=VersionId.from_string(version_id),
                user_id=UserId.from_string(user_id)
            )
            
            logger.info(f"Activated version {version_id} for agent {agent_id}")
        except Exception as e:
            logger.error(f"Error activating version: {str(e)}")
            raise
    
    async def compare_versions(
        self,
        agent_id: str,
        version1_id: str,
        version2_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        service = await self._get_service()
        
        try:
            return await service.compare_versions(
                agent_id=AgentId.from_string(agent_id),
                version1_id=VersionId.from_string(version1_id),
                version2_id=VersionId.from_string(version2_id),
                user_id=UserId.from_string(user_id)
            )
        except Exception as e:
            logger.error(f"Error comparing versions: {str(e)}")
            raise
    
    async def auto_create_version_on_config_change(
        self,
        agent_id: str,
        user_id: str,
        change_description: str = "Auto-saved configuration changes"
    ) -> Optional[str]:
        service = await self._get_service()
        db_client = await service.agent_repo.client
        
        try:
            agent_result = await db_client.table('agents').select(
                '*, agent_versions!current_version_id(*)'
            ).eq('agent_id', agent_id).execute()
            
            if not agent_result.data:
                logger.warning(f"Agent {agent_id} not found for auto-versioning")
                return None
            
            agent = agent_result.data[0]
            current_version = agent.get('agent_versions')
            
            current_config = {
                'system_prompt': agent['system_prompt'],
                'configured_mcps': agent.get('configured_mcps', []),
                'custom_mcps': agent.get('custom_mcps', []),
                'agentpress_tools': agent.get('agentpress_tools', {})
            }
            
            if current_version:
                version_config = {
                    'system_prompt': current_version['system_prompt'],
                    'configured_mcps': current_version.get('configured_mcps', []),
                    'custom_mcps': current_version.get('custom_mcps', []),
                    'agentpress_tools': current_version.get('agentpress_tools', {})
                }
                
                if current_config == version_config:
                    logger.info(f"No configuration changes detected for agent {agent_id}")
                    return None
            
            logger.info(f"Configuration changes detected for agent {agent_id}, creating auto-version")
            
            new_version = await self.create_version(
                agent_id=agent_id,
                user_id=user_id,
                system_prompt=current_config['system_prompt'],
                configured_mcps=current_config['configured_mcps'],
                custom_mcps=current_config['custom_mcps'],
                agentpress_tools=current_config['agentpress_tools'],
                change_description=change_description
            )
            
            return new_version['version_id']
            
        except Exception as e:
            logger.error(f"Error in auto-versioning for agent {agent_id}: {str(e)}")
            return None


version_manager = VersionManagerFacade() 