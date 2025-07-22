from typing import Dict, Any, List, Optional, NamedTuple
from dataclasses import dataclass
from datetime import datetime, timezone
from agent.config_helper import build_unified_config, extract_agent_config
from utils.logger import logger

from .config_manager import SunaConfigManager, SunaConfiguration
from .repository import SunaAgentRepository, SunaAgentRecord
from .version_service import SunaVersionService, VersionResult


@dataclass
class SyncResult:
    """Result of sync operation"""
    success: bool
    synced_count: int = 0
    failed_count: int = 0
    errors: List[str] = None
    details: List[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
        if self.details is None:
            self.details = []


@dataclass 
class AgentSyncResult:
    """Result of syncing a single agent"""
    agent_id: str
    account_id: str
    success: bool
    error_message: Optional[str] = None
    version_created: bool = False
    version_id: Optional[str] = None


class SunaSyncService:
    def __init__(self):
        self.config_manager = SunaConfigManager()
        self.repository = SunaAgentRepository()
        self.version_service = SunaVersionService()
    
    async def sync_all_agents(self, dry_run: bool = False) -> SyncResult:
        logger.info("🚀 Starting Suna agent sync operation")
        
        try:
            # 1. Get current configuration
            current_config = self.config_manager.get_current_config()
            is_valid, validation_errors = self.config_manager.validate_config(current_config)
            
            if not is_valid:
                return SyncResult(
                    success=False,
                    errors=[f"Configuration validation failed: {', '.join(validation_errors)}"]
                )
            
            # 2. Find agents that need syncing
            agents_to_sync = await self.repository.find_suna_agents_needing_sync(
                current_config.version_tag
            )
            
            if not agents_to_sync:
                logger.info("📋 All Suna agents are already up to date")
                return SyncResult(
                    success=True,
                    synced_count=0,
                    details=[{"message": "All agents already up to date"}]
                )
            
            logger.info(f"📊 Found {len(agents_to_sync)} agents needing sync to version {current_config.version_tag}")
            
            if dry_run:
                return SyncResult(
                    success=True,
                    details=[{
                        "message": f"DRY RUN: Would sync {len(agents_to_sync)} agents",
                        "agents": [{"agent_id": a.agent_id, "account_id": a.account_id} for a in agents_to_sync]
                    }]
                )
            
            # 3. Sync each agent
            results = []
            for agent in agents_to_sync:
                result = await self._sync_single_agent(agent, current_config)
                results.append(result)
            
            # 4. Compile results
            success_count = sum(1 for r in results if r.success)
            failed_count = sum(1 for r in results if not r.success)
            
            overall_success = failed_count == 0
            
            return SyncResult(
                success=overall_success,
                synced_count=success_count,
                failed_count=failed_count,
                errors=[r.error_message for r in results if r.error_message],
                details=[{
                    "agent_id": r.agent_id,
                    "account_id": r.account_id,
                    "status": "synced" if r.success else "failed",
                    "error": r.error_message,
                    "version_created": r.version_created,
                    "version_id": r.version_id
                } for r in results]
            )
            
        except Exception as e:
            error_msg = f"Sync operation failed: {str(e)}"
            logger.error(error_msg)
            return SyncResult(
                success=False,
                errors=[error_msg]
            )
    
    async def install_for_all_missing_users(self) -> SyncResult:
        """Install Suna agent for users who don't have it"""
        logger.info("🚀 Installing Suna agents for users who don't have them")
        
        try:
            # Get current config
            current_config = self.config_manager.get_current_config()
            is_valid, validation_errors = self.config_manager.validate_config(current_config)
            
            if not is_valid:
                return SyncResult(
                    success=False,
                    errors=[f"Configuration validation failed: {', '.join(validation_errors)}"]
                )
            
            # Get all personal accounts
            all_accounts = await self.repository.get_all_personal_accounts()
            existing_agents = await self.repository.find_all_suna_agents()
            existing_account_ids = {agent.account_id for agent in existing_agents}
            
            # Find accounts without Suna agents
            missing_accounts = [acc for acc in all_accounts if acc not in existing_account_ids]
            
            if not missing_accounts:
                return SyncResult(
                    success=True,
                    details=[{"message": "All users already have Suna agents"}]
                )
            
            logger.info(f"📦 Installing Suna for {len(missing_accounts)} users")
            
            # Install for each missing account
            results = []
            for account_id in missing_accounts:
                result = await self._install_for_user(account_id, current_config)
                results.append(result)
            
            success_count = sum(1 for r in results if r.success)
            failed_count = sum(1 for r in results if not r.success)
            
            return SyncResult(
                success=failed_count == 0,
                synced_count=success_count,
                failed_count=failed_count,
                errors=[r.error_message for r in results if r.error_message],
                details=[{
                    "account_id": r.account_id,
                    "agent_id": r.agent_id,
                    "status": "installed" if r.success else "failed",
                    "error": r.error_message
                } for r in results]
            )
            
        except Exception as e:
            error_msg = f"Installation operation failed: {str(e)}"
            logger.error(error_msg)
            return SyncResult(success=False, errors=[error_msg])
    
    async def get_sync_status(self) -> Dict[str, Any]:
        """Get current sync status and statistics"""
        try:
            current_config = self.config_manager.get_current_config()
            agents_needing_sync = await self.repository.find_suna_agents_needing_sync(
                current_config.version_tag
            )
            stats = await self.repository.get_agent_stats()
            
            return {
                "current_config_version": current_config.version_tag,
                "total_agents": stats.get("total_agents", 0),
                "agents_needing_sync": len(agents_needing_sync),
                "version_distribution": stats.get("version_distribution", {}),
                "last_sync": stats.get("last_updated", "unknown"),
                "version_system_available": self.version_service.is_version_system_available()
            }
            
        except Exception as e:
            logger.error(f"Failed to get sync status: {e}")
            return {"error": str(e)}
    
    async def _sync_single_agent(
        self, 
        agent: SunaAgentRecord, 
        config: SunaConfiguration
    ) -> AgentSyncResult:
        try:
            logger.info(f"🔬 Starting surgical sync for agent {agent.agent_id} - PRESERVING all user customizations")
            
            from services.supabase import DBConnection
            db = DBConnection()
            client = await db.client
            
            current_agent_result = await client.table('agents').select(
                '*'
            ).eq('agent_id', agent.agent_id).execute()
            
            current_agent_data = current_agent_result.data[0] if current_agent_result.data else {}
            current_user_mcps = await self.version_service._get_current_user_mcps(agent.agent_id, agent.account_id)
            
            # If version returned empty MCPs but agent has MCPs, use agent's MCPs
            if not current_user_mcps.get('custom_mcps') and current_agent_data.get('custom_mcps'):
                logger.info(f"Version had no MCPs for agent {agent.agent_id}, using agent's current MCPs")
                current_user_mcps['custom_mcps'] = current_agent_data.get('custom_mcps', [])
            
            current_config = extract_agent_config(current_agent_data) if current_agent_data else {}
            current_config['configured_mcps'] = current_user_mcps.get('configured_mcps', [])
            current_config['custom_mcps'] = current_user_mcps.get('custom_mcps', [])
            
            logger.info(f"🔍 Preserved {len(current_config.get('configured_mcps', []))} configured MCPs and {len(current_config.get('custom_mcps', []))} custom MCPs for agent {agent.agent_id}")
            
            # For Suna agents, we only need to sync metadata and preserve user MCPs
            # System prompt & tools are now read dynamically from SunaConfig
            minimal_config_data = {
                "configured_mcps": current_config.get('configured_mcps', []),
                "custom_mcps": current_config.get('custom_mcps', []),
                "metadata": {
                    "is_suna_default": True,
                    "centrally_managed": True,
                    "config_version": config.version_tag,
                    "last_central_update": datetime.now(timezone.utc).isoformat()
                    }
            }
            
            logger.info(f"🔧 Preserving {len(minimal_config_data.get('configured_mcps', []))} configured MCPs and {len(minimal_config_data.get('custom_mcps', []))} custom MCPs for agent {agent.agent_id}")
            
            agent_updated = await self.repository.update_agent_record(
                agent.agent_id, 
                minimal_config_data, 
                {}
            )
            
            if not agent_updated:
                return AgentSyncResult(
                    agent_id=agent.agent_id,
                    account_id=agent.account_id,
                    success=False,
                    error_message="Failed to surgically update agent record"
                )
            
            # Step 2: Create sync version (version service handles MCP preservation)
            version_result = await self.version_service.create_sync_version(
                agent.agent_id,
                agent.account_id,
                minimal_config_data,
                config.version_tag
            )
            
            # Step 3: Update version pointer (if version was created)
            if version_result.success:
                version_pointer_updated = await self.repository.update_agent_version_pointer(
                    agent.agent_id,
                    version_result.version_id
                )
                
                if not version_pointer_updated:
                    logger.warning(f"Version created but failed to update pointer for agent {agent.agent_id}")
            
            logger.info(f"✅ Surgical sync completed for agent {agent.agent_id} - system prompt & tools updated, everything else preserved")
            
            return AgentSyncResult(
                agent_id=agent.agent_id,
                account_id=agent.account_id,
                success=True,
                version_created=version_result.success,
                version_id=version_result.version_id
            )
            
        except Exception as e:
            logger.error(f"❌ Surgical sync failed for agent {agent.agent_id}: {e}")
            return AgentSyncResult(
                agent_id=agent.agent_id,
                account_id=agent.account_id,
                success=False,
                error_message=str(e)
            )
    
    async def _install_for_user(
        self, 
        account_id: str, 
        config: SunaConfiguration
    ) -> AgentSyncResult:
        """Install Suna agent for a specific user"""
        try:
            config_data = config.to_dict()
            unified_config = build_unified_config(
                system_prompt=config.system_prompt,
                agentpress_tools=config.agentpress_tools,
                configured_mcps=config.configured_mcps,
                custom_mcps=config.custom_mcps,
                avatar=config.avatar,
                avatar_color=config.avatar_color
            )
            
            # Create agent
            agent_id = await self.repository.create_suna_agent(
                account_id,
                config_data,
                unified_config
            )
            
            if not agent_id:
                return AgentSyncResult(
                    agent_id="",
                    account_id=account_id,
                    success=False,
                    error_message="Failed to create agent record"
                )
            
            # Create initial version
            version_result = await self.version_service.create_initial_version(
                agent_id,
                account_id,
                config_data
            )
            
            # Update version pointer if version was created
            if version_result.success:
                await self.repository.update_agent_version_pointer(
                    agent_id,
                    version_result.version_id
                )
            
            return AgentSyncResult(
                agent_id=agent_id,
                account_id=account_id,
                success=True,
                version_created=version_result.success,
                version_id=version_result.version_id
            )
            
        except Exception as e:
            return AgentSyncResult(
                agent_id="",
                account_id=account_id,
                success=False,
                error_message=str(e)
            ) 