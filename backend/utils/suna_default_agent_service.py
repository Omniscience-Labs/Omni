from typing import Dict, Any, Optional
from utils.logger import logger
from utils.omni_default_agent_service import OmniDefaultAgentService


class SunaDefaultAgentService:
    """
    Compatibility layer for the old Suna branding while using the new Omni service underneath.
    This service provides the interface expected by legacy scripts while delegating to OmniDefaultAgentService.
    """
    
    def __init__(self):
        self._omni_service = OmniDefaultAgentService()
        logger.info("🔄 SunaDefaultAgentService initialized (compatibility layer for Omni)")
    
    async def get_suna_default_config(self) -> Dict[str, Any]:
        """Get the current default configuration (rebranded as Omni)"""
        config = await self._omni_service.get_omni_default_config()
        # For compatibility, also return it under the old Suna name for scripts that expect it
        return config
    
    async def sync_all_suna_agents(self) -> Dict[str, Any]:
        """Sync all default agents (now Omni agents)"""
        logger.info("🔄 Syncing all agents (Suna→Omni compatibility layer)")
        return await self._omni_service.sync_all_omni_agents()
    
    async def update_all_suna_agents(self, target_version: Optional[str] = None) -> Dict[str, Any]:
        """Update all default agents (now Omni agents)"""
        logger.info("🔄 Updating all agents (Suna→Omni compatibility layer)")
        return await self._omni_service.update_all_omni_agents(target_version)
    
    async def install_for_all_users(self) -> Dict[str, Any]:
        """Install default agent for all users who don't have it"""
        logger.info("🔄 Installing agents for all missing users (Suna→Omni compatibility layer)")
        return await self._omni_service.install_for_all_users()
    
    async def install_suna_agent_for_user(self, account_id: str, replace_existing: bool = False) -> Optional[str]:
        """Install default agent for a specific user (now installs Omni agent)"""
        logger.info(f"🔄 Installing agent for user {account_id} (Suna→Omni compatibility layer)")
        return await self._omni_service.install_omni_agent_for_user(account_id, replace_existing)
    
    async def get_agent_for_user(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Get the default agent for a specific user"""
        return await self._omni_service.get_agent_for_user(account_id)
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get statistics about default agents"""
        return await self._omni_service.get_stats()
    async def install_for_all_users(self) -> Dict[str, Any]:
        """Install Suna agent for all users who don't have one."""
        logger.debug("🚀 Installing Suna agents for users who don't have them")
        
        try:
            client = await self._db.client
            
            # Get all personal accounts
            accounts_result = await client.schema('basejump').table('accounts').select('id').eq('personal_account', True).execute()
            all_account_ids = {row['id'] for row in accounts_result.data} if accounts_result.data else set()
            
            # Get existing Suna agents
            existing_result = await client.table('agents').select('account_id').eq('metadata->>is_suna_default', 'true').execute()
            existing_account_ids = {row['account_id'] for row in existing_result.data} if existing_result.data else set()
            
            # Find accounts without Suna
            missing_accounts = all_account_ids - existing_account_ids
            
            if not missing_accounts:
                return {
                    "installed_count": 0,
                    "failed_count": 0,
                    "details": ["All users already have Suna agents"]
                }
            
            logger.debug(f"📦 Installing Suna for {len(missing_accounts)} users")
            
            success_count = 0
            failed_count = 0
            errors = []
            
            for account_id in missing_accounts:
                try:
                    await self._create_suna_agent_for_user(account_id)
                    success_count += 1
                    logger.debug(f"✅ Installed Suna for user {account_id}")
                except Exception as e:
                    failed_count += 1
                    error_msg = f"Failed to install for user {account_id}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg)
            
            return {
                "installed_count": success_count,
                "failed_count": failed_count,
                "details": errors if errors else [f"Successfully installed for {success_count} users"]
            }
            
        except Exception as e:
            error_msg = f"Installation operation failed: {str(e)}"
            logger.error(error_msg)
            return {
                "installed_count": 0,
                "failed_count": 0,
                "details": [error_msg]
            }
    
    async def install_suna_agent_for_user(self, account_id: str, replace_existing: bool = False) -> Optional[str]:
        """Install Suna agent for a specific user."""
        logger.debug(f"🔄 Installing Suna agent for user: {account_id}")
        
        try:
            client = await self._db.client
            
            # Check for existing Suna agent
            existing_result = await client.table('agents').select('agent_id').eq('account_id', account_id).eq('metadata->>is_suna_default', 'true').execute()
            
            if existing_result.data:
                existing_agent_id = existing_result.data[0]['agent_id']
                
                if replace_existing:
                    # Delete existing agent
                    await self._delete_agent(existing_agent_id)
                    logger.debug(f"Deleted existing Suna agent for replacement")
                else:
                    logger.debug(f"User {account_id} already has Suna agent: {existing_agent_id}")
                    return existing_agent_id

            # Create new agent
            agent_id = await self._create_suna_agent_for_user(account_id)
            logger.debug(f"Successfully installed Suna agent {agent_id} for user {account_id}")
            return agent_id
                
        except Exception as e:
            logger.error(f"Error in install_suna_agent_for_user: {e}")
            return None
    
    async def get_suna_agent_stats(self) -> Dict[str, Any]:
        """Get statistics about Suna agents."""
        try:
            client = await self._db.client
            
            # Get total count
            total_result = await client.table('agents').select('agent_id', count='exact').eq('metadata->>is_suna_default', 'true').execute()
            total_count = total_result.count or 0
            
            # Get creation dates for last 30 days
            from datetime import timedelta
            thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            recent_result = await client.table('agents').select('created_at').eq('metadata->>is_suna_default', 'true').gte('created_at', thirty_days_ago).execute()
            recent_count = len(recent_result.data) if recent_result.data else 0
            
            return {
                "total_agents": total_count,
                "recent_installs": recent_count,
                "note": "Suna agents always use current central configuration"
            }
            
        except Exception as e:
            logger.error(f"Failed to get agent stats: {e}")
            return {"error": str(e)}
    
    async def _create_suna_agent_for_user(self, account_id: str) -> str:
        """Create a Suna agent for a user."""
        from agent.suna_config import SUNA_CONFIG
        
        client = await self._db.client
        
        # Create agent record
        agent_data = {
            "account_id": account_id,
            "name": SUNA_CONFIG["name"],
            "description": SUNA_CONFIG["description"],
            "is_default": True,
            "avatar": SUNA_CONFIG["avatar"],
            "avatar_color": SUNA_CONFIG["avatar_color"],
            "metadata": {
                "is_suna_default": True,
                "centrally_managed": True,
                "installation_date": datetime.now(timezone.utc).isoformat()
            },
            "version_count": 1
        }
        
        result = await client.table('agents').insert(agent_data).execute()
        
        if not result.data:
            raise Exception("Failed to create agent record")
        
        agent_id = result.data[0]['agent_id']
        
        # Create initial version
        await self._create_initial_version(agent_id, account_id)
        
        return agent_id
    
    async def _create_initial_version(self, agent_id: str, account_id: str) -> None:
        """Create initial version for Suna agent."""
        try:
            from agent.versioning.version_service import get_version_service
            from agent.suna_config import SUNA_CONFIG
            
            version_service = await get_version_service()
            await version_service.create_version(
                agent_id=agent_id,
                user_id=account_id,
                system_prompt=SUNA_CONFIG["system_prompt"],
                configured_mcps=SUNA_CONFIG["configured_mcps"],
                custom_mcps=SUNA_CONFIG["custom_mcps"],
                agentpress_tools=SUNA_CONFIG["agentpress_tools"],
                model=SUNA_CONFIG["model"],
                version_name="v1",
                change_description="Initial Suna agent installation"
            )
            
            logger.debug(f"Created initial version for Suna agent {agent_id}")
            
        except Exception as e:
            logger.error(f"Failed to create initial version for Suna agent {agent_id}: {e}")
            raise
    
    async def _delete_agent(self, agent_id: str) -> bool:
        """Delete an agent and clean up related data."""
        try:
            client = await self._db.client
            
            # Clean up triggers first
            try:
                from triggers.trigger_service import get_trigger_service
                trigger_service = get_trigger_service(self._db)
                
                triggers_result = await client.table('agent_triggers').select('trigger_id').eq('agent_id', agent_id).execute()
                
                if triggers_result.data:
                    for trigger_record in triggers_result.data:
                        try:
                            await trigger_service.delete_trigger(trigger_record['trigger_id'])
                        except Exception as e:
                            logger.warning(f"Failed to clean up trigger: {str(e)}")
            except Exception as e:
                logger.warning(f"Failed to clean up triggers for agent {agent_id}: {str(e)}")
            
            # Delete agent
            result = await client.table('agents').delete().eq('agent_id', agent_id).execute()
            return bool(result.data)
            
        except Exception as e:
            logger.error(f"Failed to delete agent {agent_id}: {e}")
            raise

