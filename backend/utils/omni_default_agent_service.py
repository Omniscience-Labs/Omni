from typing import Dict, Any, Optional, List
from utils.logger import logger
from services.supabase import DBConnection
from agent.omni_config import OMNI_CONFIG
import uuid
from datetime import datetime


class OmniDefaultAgentService:
    def __init__(self, db: DBConnection = None):
        self._db = db or DBConnection()
        logger.info("🔄 OmniDefaultAgentService initialized")
    
    async def get_omni_default_config(self) -> Dict[str, Any]:
        """Get the current Omni default configuration"""
        return OMNI_CONFIG.copy()
    
    async def sync_all_omni_agents(self) -> Dict[str, Any]:
        """Sync all Omni agents to current configuration"""
        logger.info("🔄 Syncing all Omni agents")
        
        try:
            # Get all Omni default agents (direct query to avoid broken function)
            query = """
            SELECT agent_id, account_id, name, description, created_at, updated_at, 
                   current_version_id, is_default, metadata, config, 
                   COALESCE(version_count, 1) as version_count
            FROM agents 
            WHERE COALESCE((metadata->>'is_omni_default')::boolean, false) = true
            ORDER BY created_at DESC
            """
            result = await self._db.execute_query(query)
            
            if not result:
                return {
                    "updated_count": 0,
                    "failed_count": 0,
                    "details": []
                }
            
            config = await self.get_omni_default_config()
            updated_count = 0
            failed_count = 0
            details = []
            
            for agent_row in result:
                try:
                    agent_id = agent_row['agent_id']
                    # Update agent with current config
                    update_query = """
                    UPDATE agents 
                    SET config = $1, 
                        updated_at = NOW(),
                        metadata = jsonb_set(
                            COALESCE(metadata, '{}'::jsonb),
                            '{last_central_update}',
                            to_jsonb(NOW()::text)
                        )
                    WHERE agent_id = $2
                    """
                    await self._db.execute_query(update_query, [config, agent_id])
                    updated_count += 1
                    details.append({
                        "agent_id": str(agent_id),
                        "account_id": str(agent_row['account_id']),
                        "status": "updated"
                    })
                except Exception as e:
                    logger.error(f"Failed to update agent {agent_id}: {e}")
                    failed_count += 1
                    details.append({
                        "agent_id": str(agent_id) if 'agent_id' in locals() else "unknown",
                        "status": "failed",
                        "error": str(e)
                    })
            
            return {
                "updated_count": updated_count,
                "failed_count": failed_count,
                "details": details
            }
        except Exception as e:
            logger.error(f"Error syncing Omni agents: {e}")
            return {
                "updated_count": 0,
                "failed_count": 0,
                "details": [],
                "error": str(e)
            }
    
    async def update_all_omni_agents(self, target_version: Optional[str] = None) -> Dict[str, Any]:
        """Update all Omni agents (alias for sync)"""
        logger.info("🔄 Updating all Omni agents")
        return await self.sync_all_omni_agents()
    
    async def install_for_all_users(self) -> Dict[str, Any]:
        """Install Omni agent for all users who don't have it"""
        logger.info("🔄 Installing Omni agents for all missing users")
        
        try:
            # Get all accounts that don't have an Omni default agent
            query = """
            SELECT account_id 
            FROM accounts 
            WHERE account_id NOT IN (
                SELECT DISTINCT account_id 
                FROM agents 
                WHERE COALESCE((metadata->>'is_omni_default')::boolean, false) = true
            )
            AND personal_account = true
            """
            
            accounts_result = await self._db.execute_query(query)
            
            if not accounts_result:
                return {
                    "installed_count": 0,
                    "failed_count": 0,
                    "details": []
                }
            
            installed_count = 0
            failed_count = 0
            details = []
            
            for account_row in accounts_result:
                account_id = str(account_row['account_id'])
                try:
                    agent_id = await self.install_omni_agent_for_user(account_id)
                    if agent_id:
                        installed_count += 1
                        details.append({
                            "account_id": account_id,
                            "agent_id": agent_id,
                            "status": "installed"
                        })
                    else:
                        failed_count += 1
                        details.append({
                            "account_id": account_id,
                            "status": "failed",
                            "error": "Installation returned None"
                        })
                except Exception as e:
                    logger.error(f"Failed to install for user {account_id}: {e}")
                    failed_count += 1
                    details.append({
                        "account_id": account_id,
                        "status": "failed",
                        "error": str(e)
                    })
            
            return {
                "installed_count": installed_count,
                "failed_count": failed_count,
                "details": details
            }
        except Exception as e:
            logger.error(f"Error installing Omni agents for all users: {e}")
            return {
                "installed_count": 0,
                "failed_count": 0,
                "details": [],
                "error": str(e)
            }
    
    async def install_omni_agent_for_user(self, account_id: str, replace_existing: bool = False) -> Optional[str]:
        """Install Omni agent for a specific user"""
        logger.info(f"🔄 Installing Omni agent for user: {account_id}")
        
        try:
            logger.debug(f"🔍 Starting installation process for user {account_id}, replace_existing={replace_existing}")
            if replace_existing:
                logger.debug(f"🗑️ Deleting existing Omni agent for replacement")
                # Delete existing Omni agent if it exists
                delete_query = """
                DELETE FROM agents 
                WHERE account_id = $1 
                AND COALESCE((metadata->>'is_omni_default')::boolean, false) = true
                """
                await self._db.execute_query(delete_query, [account_id])
                logger.info(f"✅ Deleted existing Omni agent for replacement")
            else:
                logger.debug(f"🔍 Checking if user already has an Omni agent")
                # Check if user already has an Omni agent (direct query to avoid broken function)
                check_query = """
                SELECT agent_id 
                FROM agents 
                WHERE account_id = $1 
                AND COALESCE((metadata->>'is_omni_default')::boolean, false) = true
                LIMIT 1
                """
                existing = await self._db.execute_query(check_query, [account_id])
                if existing:
                    logger.info(f"✅ User {account_id} already has an Omni agent: {existing[0]['agent_id']}")
                    return str(existing[0]['agent_id'])
                logger.debug(f"👤 User does not have an existing Omni agent, proceeding with installation")
            
            # Get the Omni configuration
            logger.debug(f"📋 Getting Omni default config")
            config = await self.get_omni_default_config()
            logger.debug(f"✅ Config retrieved: {list(config.keys())}")
            
            # Generate new agent ID
            agent_id = str(uuid.uuid4())
            logger.debug(f"🆔 Generated agent ID: {agent_id}")
            
            # Create the agent (updated for new schema)
            insert_query = """
            INSERT INTO agents (
                agent_id, 
                account_id, 
                name, 
                description,
                is_default,
                config,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
            )
            """
            
            metadata = {
                "is_omni_default": True,
                "centrally_managed": True,
                "installation_date": datetime.now().isoformat(),
                "management_version": "1.0.0"
            }
            
            logger.debug(f"🏗️ Creating agent in database")
            try:
                await self._db.execute_query(insert_query, [
                    agent_id,
                    account_id,
                    config["name"],
                    config["description"],
                    config.get("is_default", True),
                    config,
                    metadata
                ])
                logger.debug(f"✅ Agent created successfully")
            except Exception as e:
                logger.error(f"❌ Failed to create agent: {e}")
                raise
            
            # Create initial agent version (updated for new schema)
            version_id = str(uuid.uuid4())
            version_query = """
            INSERT INTO agent_versions (
                version_id,
                agent_id,
                account_id,
                config,
                created_at
            ) VALUES ($1, $2, $3, $4, NOW())
            """
            
            logger.debug(f"📝 Creating agent version")
            try:
                await self._db.execute_query(version_query, [
                    version_id,
                    agent_id,
                    account_id,
                    config
                ])
                logger.debug(f"✅ Version created successfully")
            except Exception as e:
                logger.error(f"❌ Failed to create version: {e}")
                raise
            
            # Update agent with current version
            update_version_query = """
            UPDATE agents 
            SET current_version_id = $1, version_count = 1
            WHERE agent_id = $2
            """
            logger.debug(f"🔄 Updating agent with version reference")
            try:
                await self._db.execute_query(update_version_query, [version_id, agent_id])
                logger.debug(f"✅ Agent updated with version successfully")
            except Exception as e:
                logger.error(f"❌ Failed to update agent with version: {e}")
                raise
            
            logger.info(f"✅ Successfully installed Omni agent {agent_id} for user: {account_id}")
            return agent_id
                
        except Exception as e:
            logger.error(f"❌ Error installing Omni agent for user {account_id}: {e}")
            return None
    
    async def get_agent_for_user(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Get the Omni agent for a specific user"""
        try:
            query = "SELECT * FROM find_omni_default_agent_for_account($1)"
            result = await self._db.execute_query(query, [account_id])
            
            if result:
                agent = result[0]
                return {
                    "agent_id": str(agent['agent_id']),
                    "name": agent['name'],
                    "account_id": str(agent['account_id']),
                    "system_prompt": agent['system_prompt'],
                    "model": agent['model'],
                    "created_at": agent['created_at'].isoformat() if agent['created_at'] else None,
                    "updated_at": agent['updated_at'].isoformat() if agent['updated_at'] else None,
                    "config": agent['config'],
                    "metadata": agent['metadata']
                }
            return None
            
        except Exception as e:
            logger.error(f"Error getting Omni agent for user {account_id}: {e}")
            return None

    async def get_stats(self) -> Dict[str, Any]:
        """Get statistics about Omni agents"""
        try:
            query = "SELECT * FROM get_omni_default_agent_stats()"
            result = await self._db.execute_query(query)
            
            if result:
                stats = result[0]
                return {
                    "total_agents": stats['total_agents'],
                    "active_agents": stats['active_agents'],
                    "inactive_agents": stats['inactive_agents'],
                    "version_breakdown": stats['version_breakdown'],
                    "monthly_breakdown": stats['monthly_breakdown']
                }
            return {
                "total_agents": 0,
                "active_agents": 0,
                "inactive_agents": 0,
                "version_breakdown": [],
                "monthly_breakdown": []
            }
        except Exception as e:
            logger.error(f"Error getting Omni agent stats: {e}")
            return {
                "total_agents": 0,
                "active_agents": 0,
                "inactive_agents": 0,
                "version_breakdown": [],
                "monthly_breakdown": [],
                "error": str(e)
            }
