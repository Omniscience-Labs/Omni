"""
Agent Version Manager - Comprehensive module for managing agent versions
"""
from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from uuid import UUID
import json
from pydantic import BaseModel, Field, validator
from utils.logger import logger
from services.supabase import DBConnection
from fastapi import HTTPException


class VersionData(BaseModel):
    """Model for version data with proper validation"""
    system_prompt: str
    configured_mcps: List[Dict[str, Any]] = Field(default_factory=list)
    custom_mcps: List[Dict[str, Any]] = Field(default_factory=list)
    agentpress_tools: Dict[str, Any] = Field(default_factory=dict)
    
    @validator('custom_mcps', pre=True)
    def normalize_custom_mcps(cls, v):
        """Ensure custom MCPs have consistent structure"""
        if not isinstance(v, list):
            return []
        
        normalized = []
        for mcp in v:
            if isinstance(mcp, dict):
                normalized.append({
                    'name': mcp.get('name', 'Unnamed MCP'),
                    'type': mcp.get('type') or mcp.get('customType', 'sse'),
                    'customType': mcp.get('customType') or mcp.get('type', 'sse'),
                    'config': mcp.get('config', {}),
                    'enabledTools': mcp.get('enabledTools') or mcp.get('enabled_tools', [])
                })
        return normalized
    
    @validator('configured_mcps', pre=True)
    def normalize_configured_mcps(cls, v):
        """Ensure configured MCPs are always a list"""
        return v if isinstance(v, list) else []
    
    @validator('agentpress_tools', pre=True)
    def normalize_agentpress_tools(cls, v):
        """Ensure agentpress tools are always a dict"""
        return v if isinstance(v, dict) else {}


class AgentVersionManager:
    """Manager class for handling all agent version operations"""
    
    def __init__(self):
        self.logger = logger
        self.db = DBConnection()
    
    async def get_version(self, agent_id: str, version_id: str, user_id: str) -> Dict[str, Any]:
        """Get a specific version with proper data normalization"""
        client = await self.db.client
        
        # Verify access
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        if agent['account_id'] != user_id and not agent.get('is_public', False):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get version
        version_result = await client.table('agent_versions').select('*').eq('version_id', version_id).eq('agent_id', agent_id).execute()
        
        if not version_result.data:
            raise HTTPException(status_code=404, detail="Version not found")
        
        version_data = version_result.data[0]
        return self._normalize_version_data(version_data)
    
    async def get_all_versions(self, agent_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Get all versions for an agent"""
        client = await self.db.client
        
        # Verify access
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent = agent_result.data[0]
        if agent['account_id'] != user_id and not agent.get('is_public', False):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get all versions
        versions_result = await client.table('agent_versions').select('*').eq('agent_id', agent_id).order('version_number', desc=True).execute()
        
        return [self._normalize_version_data(v) for v in versions_result.data]
    
    async def create_version(
        self, 
        agent_id: str, 
        version_data: VersionData,
        user_id: str,
        version_name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new version with proper validation"""
        client = await self.db.client
        
        # Verify ownership
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found or access denied")
        
        # Get next version number
        versions_result = await client.table('agent_versions').select('version_number').eq('agent_id', agent_id).order('version_number', desc=True).limit(1).execute()
        next_version_number = 1
        if versions_result.data:
            next_version_number = versions_result.data[0]['version_number'] + 1
        
        # Create version
        new_version_data = {
            "agent_id": agent_id,
            "version_number": next_version_number,
            "version_name": version_name or f"v{next_version_number}",
            "system_prompt": version_data.system_prompt,
            "configured_mcps": version_data.configured_mcps,
            "custom_mcps": version_data.custom_mcps,
            "agentpress_tools": version_data.agentpress_tools,
            "is_active": True,
            "created_by": user_id,
            "change_description": description
        }
        
        # Build unified config
        config = self._build_unified_config(version_data)
        new_version_data['config'] = config
        
        try:
            version_result = await client.table('agent_versions').insert(new_version_data).execute()
            
            if not version_result.data:
                raise HTTPException(status_code=500, detail="Failed to create version")
            
            version = version_result.data[0]
            
            # Update agent's current version
            await client.table('agents').update({
                'current_version_id': version['version_id'],
                'version_count': next_version_number
            }).eq('agent_id', agent_id).execute()
            
            self.logger.info(f"Created version {version['version_name']} for agent {agent_id}")
            return self._normalize_version_data(version)
            
        except Exception as e:
            self.logger.error(f"Error creating version: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to create version: {str(e)}")
    
    async def auto_create_version_on_config_change(
        self, 
        agent_id: str, 
        user_id: str,
        change_description: str = "Auto-saved configuration changes"
    ) -> Optional[str]:
        try:
            db = DBConnection()
            current_agent = await db.fetch_one(
                "SELECT * FROM agents WHERE agent_id = %s", (agent_id,)
            )
            
            if not current_agent:
                logger.warning(f"Agent {agent_id} not found for auto-versioning")
                return None
            current_version = None
            if current_agent['current_version_id']:
                current_version = await db.fetch_one(
                    "SELECT * FROM agent_versions WHERE version_id = %s", 
                    (current_agent['current_version_id'],)
                )

            current_config = {
                'system_prompt': current_agent['system_prompt'],
                'configured_mcps': current_agent['configured_mcps'] or [],
                'custom_mcps': current_agent['custom_mcps'] or [],
                'agentpress_tools': current_agent['agentpress_tools'] or {}
            }
            
            version_config = None
            if current_version:
                version_config = {
                    'system_prompt': current_version['system_prompt'],
                    'configured_mcps': current_version['configured_mcps'] or [],
                    'custom_mcps': current_version['custom_mcps'] or [],
                    'agentpress_tools': current_version['agentpress_tools'] or {}
                }
            
            if version_config and current_config == version_config:
                logger.info(f"No configuration changes detected for agent {agent_id}")
                return None
            
            logger.info(f"Configuration changes detected for agent {agent_id}, creating auto-version")
            
            version_data = VersionData(
                system_prompt=current_config['system_prompt'],
                configured_mcps=current_config['configured_mcps'],
                custom_mcps=current_config['custom_mcps'],
                agentpress_tools=current_config['agentpress_tools']
            )
            
            new_version = await self.create_version(
                agent_id=agent_id,
                version_data=version_data,
                user_id=user_id,
                description=change_description
            )
            
            if new_version:
                await self.activate_version(agent_id, new_version['version_id'], user_id)
                logger.info(f"Auto-created and activated version {new_version['version_name']} for agent {agent_id}")
                return new_version['version_id']
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to auto-create version for agent {agent_id}: {e}")
            return None

    async def activate_version(self, agent_id: str, version_id: str, user_id: str) -> None:
        """Activate a specific version"""
        client = await self.db.client
        
        # Verify ownership
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found or access denied")
        
        # Verify version exists
        version_result = await client.table('agent_versions').select('*').eq('version_id', version_id).eq('agent_id', agent_id).execute()
        if not version_result.data:
            raise HTTPException(status_code=404, detail="Version not found")
        
        # Update agent's current version
        await client.table('agents').update({
            'current_version_id': version_id
        }).eq('agent_id', agent_id).execute()
        
        self.logger.info(f"Activated version {version_id} for agent {agent_id}")
    
    async def compare_versions(
        self, 
        agent_id: str, 
        version1_id: str, 
        version2_id: str, 
        user_id: str
    ) -> Dict[str, Any]:
        """Compare two versions"""
        version1 = await self.get_version(agent_id, version1_id, user_id)
        version2 = await self.get_version(agent_id, version2_id, user_id)
        
        return {
            'version1': version1,
            'version2': version2,
            'differences': self._calculate_differences(version1, version2)
        }
    
    def _normalize_version_data(self, version_data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize version data to ensure consistent structure"""
        # Handle custom MCPs normalization
        custom_mcps = version_data.get('custom_mcps', [])
        if custom_mcps is None:
            custom_mcps = []
        elif isinstance(custom_mcps, list):
            custom_mcps = [
                {
                    'name': mcp.get('name', 'Unnamed MCP'),
                    'type': mcp.get('type') or mcp.get('customType', 'sse'),
                    'customType': mcp.get('customType') or mcp.get('type', 'sse'),
                    'config': mcp.get('config', {}),
                    'enabledTools': mcp.get('enabledTools') or mcp.get('enabled_tools', [])
                }
                for mcp in custom_mcps
                if isinstance(mcp, dict)
            ]
        
        # Handle configured MCPs
        configured_mcps = version_data.get('configured_mcps', [])
        if configured_mcps is None:
            configured_mcps = []
        elif not isinstance(configured_mcps, list):
            configured_mcps = []
        
        # Handle agentpress tools
        agentpress_tools = version_data.get('agentpress_tools', {})
        if not isinstance(agentpress_tools, dict):
            agentpress_tools = {}
        
        return {
            'version_id': version_data['version_id'],
            'agent_id': version_data['agent_id'],
            'version_number': version_data['version_number'],
            'version_name': version_data['version_name'],
            'system_prompt': version_data.get('system_prompt', ''),
            'configured_mcps': configured_mcps,
            'custom_mcps': custom_mcps,
            'agentpress_tools': agentpress_tools,
            'is_active': version_data.get('is_active', True),
            'created_at': version_data['created_at'],
            'updated_at': version_data.get('updated_at', version_data['created_at']),
            'created_by': version_data.get('created_by'),
            'change_description': version_data.get('change_description'),
            'config': version_data.get('config', {})
        }
    
    def _build_unified_config(self, version_data: VersionData) -> Dict[str, Any]:
        """Build unified config object"""
        simplified_tools = {}
        for tool_name, tool_config in version_data.agentpress_tools.items():
            if isinstance(tool_config, dict):
                simplified_tools[tool_name] = tool_config.get('enabled', False)
            elif isinstance(tool_config, bool):
                simplified_tools[tool_name] = tool_config
        
        return {
            'system_prompt': version_data.system_prompt,
            'tools': {
                'agentpress': simplified_tools,
                'mcp': version_data.configured_mcps,
                'custom_mcp': version_data.custom_mcps
            }
        }
    
    def _calculate_differences(self, version1: Dict[str, Any], version2: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate differences between two versions"""
        differences = {}
        
        # Check system prompt
        if version1['system_prompt'] != version2['system_prompt']:
            differences['system_prompt'] = {
                'changed': True,
                'version1': version1['system_prompt'][:100] + '...' if len(version1['system_prompt']) > 100 else version1['system_prompt'],
                'version2': version2['system_prompt'][:100] + '...' if len(version2['system_prompt']) > 100 else version2['system_prompt']
            }
        
        # Check tools
        v1_tools = set(version1['agentpress_tools'].keys())
        v2_tools = set(version2['agentpress_tools'].keys())
        
        tools_added = v2_tools - v1_tools
        tools_removed = v1_tools - v2_tools
        tools_changed = []
        
        for tool in v1_tools & v2_tools:
            if version1['agentpress_tools'][tool] != version2['agentpress_tools'][tool]:
                tools_changed.append(tool)
        
        if tools_added or tools_removed or tools_changed:
            differences['agentpress_tools'] = {
                'added': list(tools_added),
                'removed': list(tools_removed),
                'changed': tools_changed
            }
        
        # Check MCPs
        if json.dumps(version1['configured_mcps'], sort_keys=True) != json.dumps(version2['configured_mcps'], sort_keys=True):
            differences['configured_mcps'] = {
                'version1_count': len(version1['configured_mcps']),
                'version2_count': len(version2['configured_mcps'])
            }
        
        if json.dumps(version1['custom_mcps'], sort_keys=True) != json.dumps(version2['custom_mcps'], sort_keys=True):
            differences['custom_mcps'] = {
                'version1_count': len(version1['custom_mcps']),
                'version2_count': len(version2['custom_mcps'])
            }
        
        return differences


# Singleton instance
version_manager = AgentVersionManager() 