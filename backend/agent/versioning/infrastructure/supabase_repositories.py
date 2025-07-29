from typing import List, Optional, Dict, Any
from datetime import datetime
from ..domain.entities import (
    AgentVersion, VersionId, AgentId, UserId, VersionNumber,
    SystemPrompt, MCPConfiguration, ToolConfiguration, VersionStatus
)
from ..domain.repositories import (
    IVersionRepository, IAgentRepository
)


class SupabaseVersionRepository(IVersionRepository):
    def __init__(self, db_client):
        self.client = db_client
    
    async def create(self, version: AgentVersion) -> AgentVersion:
        data = {
            'version_id': str(version.version_id),
            'agent_id': str(version.agent_id),
            'version_number': version.version_number.value,
            'version_name': version.version_name,
            'is_active': version.is_active,
            'created_at': version.created_at.isoformat(),
            'updated_at': version.updated_at.isoformat(),
            'created_by': str(version.created_by),
            'change_description': version.change_description,
            'previous_version_id': str(version.previous_version_id) if version.previous_version_id else None,
            'config': {
                'system_prompt': version.system_prompt.value,
                'tools': {
                    'agentpress': version.tool_configuration.tools,
                    'mcp': [
                        {
                            'name': mcp.name,
                            'type': mcp.type,
                            'config': mcp.config,
                            'enabledTools': mcp.enabled_tools
                        }
                        for mcp in version.configured_mcps
                    ],
                    'custom_mcp': [
                        {
                            'name': mcp.name,
                            'type': mcp.type,
                            'config': mcp.config,
                            'enabledTools': mcp.enabled_tools
                        }
                        for mcp in version.custom_mcps
                    ]
                }
            }
        }
        
        result = await self.client.table('agent_versions').insert(data).execute()
        
        if not result.data:
            raise Exception("Failed to create version")
        
        return self._to_entity(result.data[0])
    
    async def find_by_id(self, version_id: VersionId) -> Optional[AgentVersion]:
        result = await self.client.table('agent_versions').select('*').eq(
            'version_id', str(version_id)
        ).execute()
        
        if not result.data:
            return None
        
        return self._to_entity(result.data[0])
    
    async def find_by_agent_id(self, agent_id: AgentId) -> List[AgentVersion]:
        result = await self.client.table('agent_versions').select('*').eq(
            'agent_id', str(agent_id)
        ).execute()
        
        return [self._to_entity(row) for row in result.data]
    
    async def find_active_version(self, agent_id: AgentId) -> Optional[AgentVersion]:
        result = await self.client.table('agent_versions').select('*').eq(
            'agent_id', str(agent_id)
        ).eq('is_active', True).execute()
        
        if not result.data:
            return None
        
        return self._to_entity(result.data[0])
    
    async def find_by_version_number(
        self, agent_id: AgentId, version_number: VersionNumber
    ) -> Optional[AgentVersion]:
        result = await self.client.table('agent_versions').select('*').eq(
            'agent_id', str(agent_id)
        ).eq('version_number', version_number.value).execute()
        
        if not result.data:
            return None
        
        return self._to_entity(result.data[0])
    
    async def update(self, version: AgentVersion) -> AgentVersion:
        data = {
            'version_name': version.version_name,
            'change_description': version.change_description,
            'is_active': version.is_active,
            'updated_at': version.updated_at.isoformat(),
            'config': {
                'system_prompt': version.system_prompt.value,
                'tools': {
                    'agentpress': version.tool_configuration.tools,
                    'mcp': [
                        {
                            'name': mcp.name,
                            'type': mcp.type,
                            'config': mcp.config,
                            'enabledTools': mcp.enabled_tools
                        }
                        for mcp in version.configured_mcps
                    ],
                    'custom_mcp': [
                        {
                            'name': mcp.name,
                            'type': mcp.type,
                            'config': mcp.config,
                            'enabledTools': mcp.enabled_tools
                        }
                        for mcp in version.custom_mcps
                    ]
                }
            }
        }
        
        result = await self.client.table('agent_versions').update(data).eq(
            'version_id', str(version.version_id)
        ).execute()
        
        if not result.data:
            raise Exception("Failed to update version")
        
        return self._to_entity(result.data[0])
    
    async def get_next_version_number(self, agent_id: AgentId) -> VersionNumber:
        result = await self.client.table('agent_versions').select(
            'version_number'
        ).eq('agent_id', str(agent_id)).order(
            'version_number', desc=True
        ).limit(1).execute()
        
        if not result.data:
            return VersionNumber(1)
        
        return VersionNumber(result.data[0]['version_number'] + 1)
    
    async def count_versions(self, agent_id: AgentId) -> int:
        result = await self.client.table('agent_versions').select(
            'version_id', count='exact'
        ).eq('agent_id', str(agent_id)).execute()
        
        return result.count or 0
    
    def _to_entity(self, data: Dict[str, Any]) -> AgentVersion:
        config = data.get('config', {})
        tools = config.get('tools', {})
        
        return AgentVersion(
            version_id=VersionId.from_string(data['version_id']),
            agent_id=AgentId.from_string(data['agent_id']),
            version_number=VersionNumber(data['version_number']),
            version_name=data['version_name'],
            system_prompt=SystemPrompt(config.get('system_prompt', '')),
            configured_mcps=[
                MCPConfiguration(
                    name=mcp['name'],
                    type=mcp.get('type', 'sse'),
                    config=mcp.get('config', {}),
                    enabled_tools=mcp.get('enabledTools', mcp.get('enabled_tools', []))
                )
                for mcp in tools.get('mcp', [])
            ],
            custom_mcps=[
                MCPConfiguration(
                    name=mcp['name'],
                    type=mcp.get('type', 'sse'),
                    config=mcp.get('config', {}),
                    enabled_tools=mcp.get('enabledTools', mcp.get('enabled_tools', []))
                )
                for mcp in tools.get('custom_mcp', [])
            ],
            tool_configuration=ToolConfiguration.create_normalized(
                tools.get('agentpress', {})
            ),
            status=VersionStatus.ACTIVE if data.get('is_active') else VersionStatus.INACTIVE,
            created_at=datetime.fromisoformat(data['created_at'].replace('Z', '+00:00')),
            updated_at=datetime.fromisoformat(data['updated_at'].replace('Z', '+00:00')),
            created_by=UserId.from_string(data['created_by']),
            change_description=data.get('change_description'),
            previous_version_id=VersionId.from_string(data['previous_version_id']) if data.get('previous_version_id') else None
        )


class SupabaseAgentRepository(IAgentRepository):
    def __init__(self, db_client):
        self.client = db_client
    
    async def find_by_id(self, agent_id: AgentId) -> Optional[Dict[str, Any]]:
        result = await self.client.table('agents').select('*').eq(
            'agent_id', str(agent_id)
        ).execute()
        
        if not result.data:
            return None
        
        return result.data[0]
    
    async def update_current_version(
        self, agent_id: AgentId, version_id: VersionId, version_count: int
    ) -> None:
        data = {
            'current_version_id': str(version_id),
            'version_count': version_count
        }
        
        result = await self.client.table('agents').update(data).eq(
            'agent_id', str(agent_id)
        ).execute()
        
        if not result.data:
            raise Exception("Failed to update agent current version")
    
    async def verify_ownership(self, agent_id: AgentId, user_id: UserId) -> bool:
        result = await self.client.table('agents').select('account_id').eq(
            'agent_id', str(agent_id)
        ).eq('account_id', str(user_id)).execute()
        
        return bool(result.data)
    
    async def is_public(self, agent_id: AgentId) -> bool:
        result = await self.client.table('agents').select('is_public').eq(
            'agent_id', str(agent_id)
        ).execute()
        
        if not result.data:
            return False
        
        return result.data[0].get('is_public', False) 