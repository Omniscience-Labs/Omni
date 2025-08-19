from typing import Dict, Any, Optional
from utils.logger import logger
from services.supabase import DBConnection
from agent.suna import SunaSyncService


class OmniDefaultAgentService:
    def __init__(self, db: DBConnection = None):
        self._sync_service = SunaSyncService()
        self._db = db or DBConnection()
        logger.info("🔄 OmniDefaultAgentService initialized with modular backend")
    
    async def get_omni_default_config(self) -> Dict[str, Any]:
        current_config = self._sync_service.config_manager.get_current_config()
        return current_config.to_dict()
    
    async def sync_all_omni_agents(self) -> Dict[str, Any]:
        logger.info("🔄 Delegating to modular sync service (preserves user customizations)")
        result = await self._sync_service.sync_all_agents()
        
        return {
            "updated_count": result.synced_count,
            "failed_count": result.failed_count,
            "details": result.details
        }
    
    async def update_all_omni_agents(self, target_version: Optional[str] = None) -> Dict[str, Any]:
        logger.info("🔄 Delegating to modular sync service (version auto-detected)")
        return await self.sync_all_omni_agents()
    
    async def install_for_all_users(self) -> Dict[str, Any]:
        logger.info("🔄 Delegating to modular installation service")
        result = await self._sync_service.install_for_all_missing_users()
        
        return {
            "installed_count": result.synced_count,
            "failed_count": result.failed_count,
            "details": result.details
        }
    
    async def install_omni_agent_for_user(self, account_id: str, replace_existing: bool = False) -> Optional[str]:
        logger.info(f"🔄 Installing Omni agent for user: {account_id}")
        
        try:
            if replace_existing:
                agents = await self._sync_service.repository.find_all_omni_agents()
                existing = next((a for a in agents if a.account_id == account_id), None)
                if existing:
                    await self._sync_service.repository.delete_agent(existing.agent_id)
                    logger.info(f"Deleted existing Omni agent for replacement")
            
            result = await self._sync_service.install_for_user(account_id)
            
            if result.synced_count > 0:
                logger.info(f"✅ Successfully installed Omni agent for user: {account_id}")
                return result.details[0] if result.details else None
            else:
                logger.error(f"❌ Failed to install Omni agent for user: {account_id}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error installing Omni agent for user {account_id}: {e}")
            return None
    
    async def get_agent_for_user(self, account_id: str) -> Optional[Dict[str, Any]]:
        try:
            agents = await self._sync_service.repository.find_all_omni_agents()
            user_agent = next((a for a in agents if a.account_id == account_id), None)
            
            if user_agent:
                return {
                    "agent_id": user_agent.agent_id,
                    "name": user_agent.name,
                    "account_id": user_agent.account_id,
                    "system_prompt": user_agent.system_prompt,
                    "model": user_agent.model,
                    "created_at": user_agent.created_at.isoformat() if user_agent.created_at else None,
                    "updated_at": user_agent.updated_at.isoformat() if user_agent.updated_at else None
                }
            return None
            
        except Exception as e:
            logger.error(f"Error getting Omni agent for user {account_id}: {e}")
            return None
