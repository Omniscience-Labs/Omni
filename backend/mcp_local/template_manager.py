"""
Agent Template Manager

This module handles:
1. Creating agent templates from existing agents (stripping credentials)
2. Installing templates as agent instances
3. Managing template lifecycle and marketplace operations
4. Converting between legacy agents and new secure architecture
"""

import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timezone

from utils.logger import logger
from services.supabase import DBConnection

from .credential_manager import credential_manager, MCPRequirement, MCPCredential

db = DBConnection()


@dataclass
class AgentTemplate:
    """Represents an agent template"""
    template_id: str
    creator_id: str
    name: str
    description: Optional[str]
    system_prompt: str
    mcp_requirements: List[MCPRequirement]
    agentpress_tools: Dict[str, Any]
    tags: List[str]
    is_public: bool
    marketplace_published_at: Optional[datetime]
    download_count: int
    created_at: datetime
    updated_at: datetime
    avatar: Optional[str]
    avatar_color: Optional[str]


@dataclass
class AgentInstance:
    """Represents an agent instance"""
    instance_id: str
    template_id: Optional[str]
    account_id: str
    name: str
    description: Optional[str]
    credential_mappings: Dict[str, str]
    custom_system_prompt: Optional[str]
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime
    avatar: Optional[str]
    avatar_color: Optional[str]


class TemplateManager:
    """Manages agent templates and instances"""
    
    async def create_template_from_agent(
        self, 
        agent_id: str, 
        creator_id: str,
        make_public: bool = False,
        tags: Optional[List[str]] = None
    ) -> str:
        """
        Create an agent template from an existing agent, stripping all credentials
        
        Args:
            agent_id: ID of the existing agent
            creator_id: ID of the user creating the template
            make_public: Whether to make the template public immediately
            tags: Optional tags for the template
            
        Returns:
            template_id: ID of the created template
        """
        logger.info(f"Creating template from agent {agent_id}")
        
        try:
            client = await db.client
            
            # Get the existing agent
            agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).execute()
            if not agent_result.data:
                raise ValueError("Agent not found")
            
            agent = agent_result.data[0]
            
            # Verify ownership
            if agent['account_id'] != creator_id:
                raise ValueError("Access denied: not agent owner")
            
            # Extract MCP requirements (remove credentials)
            mcp_requirements = []
            
            # Process configured_mcps
            for mcp_config in agent.get('configured_mcps', []):
                requirement = {
                    'qualified_name': mcp_config.get('qualifiedName'),
                    'display_name': mcp_config.get('name'),
                    'enabled_tools': mcp_config.get('enabledTools', []),
                    'required_config': list(mcp_config.get('config', {}).keys())
                }
                mcp_requirements.append(requirement)
            
            # Process custom_mcps
            for custom_mcp in agent.get('custom_mcps', []):
                requirement = {
                    'qualified_name': f"custom_{custom_mcp['type']}_{custom_mcp['name'].replace(' ', '_').lower()}",
                    'display_name': custom_mcp['name'],
                    'enabled_tools': custom_mcp.get('enabledTools', []),
                    'required_config': list(custom_mcp.get('config', {}).keys()),
                    'custom_type': custom_mcp['type']
                }
                mcp_requirements.append(requirement)
            
            # Create template
            template_data = {
                'creator_id': creator_id,
                'name': agent['name'],
                'description': agent.get('description'),
                'system_prompt': agent['system_prompt'],
                'mcp_requirements': mcp_requirements,
                'agentpress_tools': agent.get('agentpress_tools', {}),
                'tags': tags or [],
                'is_public': make_public,
                'avatar': agent.get('avatar'),
                'avatar_color': agent.get('avatar_color')
            }
            
            if make_public:
                template_data['marketplace_published_at'] = datetime.now(timezone.utc).isoformat()
            
            result = await client.table('agent_templates').insert(template_data).execute()
            
            if not result.data:
                raise ValueError("Failed to create template")
            
            template_id = result.data[0]['template_id']
            logger.info(f"Successfully created template {template_id} from agent {agent_id}")
            
            return template_id
            
        except Exception as e:
            logger.error(f"Error creating template from agent {agent_id}: {str(e)}")
            raise
    
    async def get_template(self, template_id: str) -> Optional[AgentTemplate]:
        """Get an agent template by ID"""
        try:
            client = await db.client
            
            result = await client.table('agent_templates').select('*')\
                .eq('template_id', template_id).execute()
            
            if not result.data:
                return None
            
            template_data = result.data[0]
            
            # Convert mcp_requirements to MCPRequirement objects
            mcp_requirements = []
            for req_data in template_data.get('mcp_requirements', []):
                mcp_requirements.append(MCPRequirement(
                    qualified_name=req_data.get('qualified_name') or req_data.get('qualifiedName'),
                    display_name=req_data.get('display_name') or req_data.get('name'),
                    enabled_tools=req_data.get('enabled_tools') or req_data.get('enabledTools', []),
                    required_config=req_data.get('required_config') or req_data.get('requiredConfig', [])
                ))
            
            return AgentTemplate(
                template_id=template_data['template_id'],
                creator_id=template_data['creator_id'],
                name=template_data['name'],
                description=template_data.get('description'),
                system_prompt=template_data['system_prompt'],
                mcp_requirements=mcp_requirements,
                agentpress_tools=template_data.get('agentpress_tools', {}),
                tags=template_data.get('tags', []),
                is_public=template_data.get('is_public', False),
                marketplace_published_at=template_data.get('marketplace_published_at'),
                download_count=template_data.get('download_count', 0),
                created_at=template_data['created_at'],
                updated_at=template_data['updated_at'],
                avatar=template_data.get('avatar'),
                avatar_color=template_data.get('avatar_color')
            )
            
        except Exception as e:
            logger.error(f"Error getting template {template_id}: {str(e)}")
            return None
    
    async def install_template(
        self, 
        template_id: str, 
        account_id: str,
        instance_name: Optional[str] = None,
        custom_system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Install a template as an agent instance for a user
        
        Args:
            template_id: ID of the template to install
            account_id: ID of the user installing the template
            instance_name: Optional custom name for the instance
            custom_system_prompt: Optional custom system prompt override
            
        Returns:
            Dictionary with installation result and any missing credentials
        """
        logger.info(f"Installing template {template_id} for user {account_id}")
        
        try:
            # Get the template
            template = await self.get_template(template_id)
            if not template:
                raise ValueError("Template not found")
            
            # Check if template is accessible
            if not template.is_public:
                # Check if user owns the template
                if template.creator_id != account_id:
                    raise ValueError("Access denied to private template")
            
            # Check for missing credentials
            missing_credentials = await credential_manager.get_missing_credentials_for_requirements(
                account_id, template.mcp_requirements
            )
            
            if missing_credentials:
                return {
                    'status': 'credentials_required',
                    'missing_credentials': [
                        {
                            'qualified_name': req.qualified_name,
                            'display_name': req.display_name,
                            'required_config': req.required_config
                        }
                        for req in missing_credentials
                    ],
                    'template': {
                        'template_id': template.template_id,
                        'name': template.name,
                        'description': template.description
                    }
                }
            
            # Build credential mappings
            credential_mappings = await credential_manager.build_credential_mappings(
                account_id, template.mcp_requirements
            )
            
            # Create regular agent with secure credentials
            client = await db.client
            
            # Build configured_mcps with user's credentials
            configured_mcps = []
            
            for req in template.mcp_requirements:
                credential_id = credential_mappings.get(req.qualified_name)
                if not credential_id:
                    logger.warning(f"No credential mapping for {req.qualified_name}")
                    continue
                
                # Get the credential
                credential = await credential_manager.get_credential(
                    account_id, req.qualified_name
                )
                
                if not credential:
                    logger.warning(f"Credential not found for {req.qualified_name}")
                    continue
                
                # Build MCP config with actual credentials
                mcp_config = {
                    'name': req.display_name,
                    'qualifiedName': req.qualified_name,
                    'config': credential.config,
                    'enabledTools': req.enabled_tools
                }
                
                configured_mcps.append(mcp_config)
            
            # Create regular agent that will show up in agent playground
            agent_data = {
                'account_id': account_id,
                'name': instance_name or f"{template.name} (from marketplace)",
                'description': template.description,
                'system_prompt': custom_system_prompt or template.system_prompt,
                'configured_mcps': configured_mcps,
                'custom_mcps': [],  # TODO: Handle custom MCPs from templates
                'agentpress_tools': template.agentpress_tools,
                'is_default': False,
                'avatar': template.avatar,
                'avatar_color': template.avatar_color
            }
            
            result = await client.table('agents').insert(agent_data).execute()
            
            if not result.data:
                raise ValueError("Failed to create agent")
            
            instance_id = result.data[0]['agent_id']
            
            # Update template download count
            await client.table('agent_templates')\
                .update({'download_count': template.download_count + 1})\
                .eq('template_id', template_id).execute()
            
            logger.info(f"Successfully installed template {template_id} as instance {instance_id}")
            
            return {
                'status': 'installed',
                'instance_id': instance_id,
                'name': agent_data['name']
            }
            
        except Exception as e:
            logger.error(f"Error installing template {template_id}: {str(e)}")
            raise
    
    async def get_agent_instance(self, instance_id: str) -> Optional[AgentInstance]:
        """Get an agent instance by ID"""
        try:
            client = await db.client
            
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
            logger.error(f"Error getting agent instance {instance_id}: {str(e)}")
            return None
    
    async def build_runtime_agent_config(self, instance_id: str) -> Dict[str, Any]:
        """
        Build a complete agent configuration for runtime use by combining
        template data with user credentials
        
        Args:
            instance_id: ID of the agent instance
            
        Returns:
            Complete agent configuration with populated MCP configs
        """
        logger.info(f"Building runtime config for agent instance {instance_id}")
        
        try:
            # Get the agent instance
            instance = await self.get_agent_instance(instance_id)
            if not instance:
                raise ValueError("Agent instance not found")
            
            # If this is a legacy agent (no template), handle differently
            if not instance.template_id:
                return await self._build_legacy_agent_config(instance_id)
            
            # Get the template
            template = await self.get_template(instance.template_id)
            if not template:
                raise ValueError("Template not found")
            
            # Build configured_mcps with user's credentials
            configured_mcps = []
            
            for req in template.mcp_requirements:
                credential_id = instance.credential_mappings.get(req.qualified_name)
                if not credential_id:
                    logger.warning(f"No credential mapping for {req.qualified_name}")
                    continue
                
                # Get the credential
                credential = await credential_manager.get_credential(
                    instance.account_id, req.qualified_name
                )
                
                if not credential:
                    logger.warning(f"Credential not found for {req.qualified_name}")
                    continue
                
                # Build MCP config
                mcp_config = {
                    'name': req.display_name,
                    'qualifiedName': req.qualified_name,
                    'config': credential.config,
                    'enabledTools': req.enabled_tools
                }
                
                configured_mcps.append(mcp_config)
            
            # Build complete agent config
            agent_config = {
                'agent_id': instance.instance_id,
                'account_id': instance.account_id,
                'name': instance.name,
                'description': instance.description,
                'system_prompt': instance.custom_system_prompt or template.system_prompt,
                'configured_mcps': configured_mcps,
                'custom_mcps': [],  # TODO: Handle custom MCPs from templates
                'agentpress_tools': template.agentpress_tools,
                'is_default': instance.is_default,
                'avatar': instance.avatar,
                'avatar_color': instance.avatar_color,
                'created_at': instance.created_at,
                'updated_at': instance.updated_at
            }
            
            return agent_config
            
        except Exception as e:
            logger.error(f"Error building runtime config for instance {instance_id}: {str(e)}")
            raise
    
    async def _build_legacy_agent_config(self, instance_id: str) -> Dict[str, Any]:
        """Build config for legacy agents (backward compatibility)"""
        try:
            client = await db.client
            
            # For legacy agents, instance_id should match agent_id in agents table
            result = await client.table('agents').select('*').eq('agent_id', instance_id).execute()
            
            if not result.data:
                raise ValueError("Legacy agent not found")
            
            agent = result.data[0]
            return agent
            
        except Exception as e:
            logger.error(f"Error building legacy agent config: {str(e)}")
            raise
    
    async def publish_template(self, template_id: str, creator_id: str, tags: Optional[List[str]] = None) -> bool:
        """Publish a template to the marketplace"""
        try:
            client = await db.client
            
            # Verify ownership
            template = await self.get_template(template_id)
            if not template or template.creator_id != creator_id:
                raise ValueError("Template not found or access denied")
            
            # Update template
            update_data = {
                'is_public': True,
                'marketplace_published_at': datetime.now(timezone.utc).isoformat()
            }
            
            if tags:
                update_data['tags'] = tags
            
            result = await client.table('agent_templates')\
                .update(update_data)\
                .eq('template_id', template_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error(f"Error publishing template {template_id}: {str(e)}")
            return False

    async def unpublish_template(self, template_id: str, creator_id: str) -> bool:
        """Unpublish a template from the marketplace"""
        try:
            client = await db.client
            
            # Verify ownership
            template = await self.get_template(template_id)
            if not template or template.creator_id != creator_id:
                raise ValueError("Template not found or access denied")
            
            # Update template to make it private
            update_data = {
                'is_public': False,
                'marketplace_published_at': None
            }
            
            result = await client.table('agent_templates')\
                .update(update_data)\
                .eq('template_id', template_id)\
                .execute()
            
            return len(result.data) > 0
            
        except Exception as e:
            logger.error(f"Error unpublishing template {template_id}: {str(e)}")
            return False
    
    async def get_marketplace_templates(
        self, 
        limit: int = 50, 
        offset: int = 0,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get public templates from marketplace"""
        try:
            client = await db.client
            
            query = client.table('agent_templates')\
                .select('*')\
                .eq('is_public', True)\
                .order('marketplace_published_at', desc=True)\
                .range(offset, offset + limit - 1)
            
            if search:
                query = query.or_(f'name.ilike.%{search}%,description.ilike.%{search}%')
            
            if tags:
                query = query.overlaps('tags', tags)
            
            result = await query.execute()
            
            templates = []
            for template_data in result.data:
                templates.append({
                    'template_id': template_data['template_id'],
                    'name': template_data['name'],
                    'description': template_data.get('description'),
                    'mcp_requirements': template_data.get('mcp_requirements', []),
                    'agentpress_tools': template_data.get('agentpress_tools', {}),
                    'tags': template_data.get('tags', []),
                    'is_public': template_data.get('is_public', True),
                    'download_count': template_data.get('download_count', 0),
                    'marketplace_published_at': template_data.get('marketplace_published_at'),
                    'created_at': template_data['created_at'],
                    'creator_name': 'Anonymous',
                    'avatar': template_data.get('avatar'),
                    'avatar_color': template_data.get('avatar_color')
                })
            
            return templates
            
        except Exception as e:
            logger.error(f"Error getting marketplace templates: {str(e)}")
            return []

    async def get_user_templates(
        self, 
        creator_id: str,
        limit: int = 50, 
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get all templates created by a specific user"""
        try:
            client = await db.client
            
            query = client.table('agent_templates')\
                .select('*')\
                .eq('creator_id', creator_id)\
                .order('created_at', desc=True)\
                .range(offset, offset + limit - 1)
            
            result = await query.execute()
            
            templates = []
            for template_data in result.data:
                templates.append({
                    'template_id': template_data['template_id'],
                    'name': template_data['name'],
                    'description': template_data.get('description'),
                    'mcp_requirements': template_data.get('mcp_requirements', []),
                    'agentpress_tools': template_data.get('agentpress_tools', {}),
                    'tags': template_data.get('tags', []),
                    'is_public': template_data.get('is_public', False),
                    'download_count': template_data.get('download_count', 0),
                    'marketplace_published_at': template_data.get('marketplace_published_at'),
                    'created_at': template_data['created_at'],
                    'creator_name': 'You',
                    'avatar': template_data.get('avatar'),
                    'avatar_color': template_data.get('avatar_color')
                })
            
            return templates
            
        except Exception as e:
            logger.error(f"Error getting user templates: {str(e)}")
            return []


# Global template manager instance
template_manager = TemplateManager() 