from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime, timezone
from services.supabase import DBConnection
from utils.logger import logger


@dataclass
class VersionResult:
    success: bool
    version_id: Optional[str] = None
    error_message: Optional[str] = None


class SunaVersionService:
    def __init__(self, db: DBConnection = None):
        self.db = db or DBConnection()
    
    async def create_sync_version(
        self,
        agent_id: str,
        account_id: str,
        config_data: Dict[str, Any],
        version_tag: str
    ) -> VersionResult:
        try:
            current_mcps = await self._get_current_user_mcps(agent_id, account_id)
            
            from agent.versioning.facade import version_manager
            from agent.versioning.infrastructure.dependencies import set_db_connection
            
            set_db_connection(self.db)

            version = await version_manager.create_version(
                agent_id=agent_id,
                user_id=account_id,
                system_prompt="[SUNA_MANAGED]",
                configured_mcps=current_mcps["configured_mcps"],
                custom_mcps=current_mcps["custom_mcps"],
                agentpress_tools={},
                version_name=f"sync-{version_tag}",
                change_description=f"Auto-sync metadata (system prompt & tools from SunaConfig)"
            )
            
            logger.info(f"Created sync version {version['version_id']} for agent {agent_id} (preserved user MCPs)")
            
            return VersionResult(
                success=True,
                version_id=version['version_id']
            )
            
        except Exception as e:
            error_msg = f"Failed to create sync version for agent {agent_id}: {str(e)}"
            logger.error(error_msg)
            
            return VersionResult(
                success=False,
                error_message=error_msg
            )
    
    async def create_initial_version(
        self,
        agent_id: str,
        account_id: str,
        config_data: Dict[str, Any]
    ) -> VersionResult:
        try:
            from agent.versioning.facade import version_manager
            from agent.versioning.infrastructure.dependencies import set_db_connection
            
            set_db_connection(self.db)
            

            # For Suna agents, use placeholder system_prompt to satisfy version manager validation
            # extract_agent_config will override this with SunaConfig values at runtime
            version = await version_manager.create_version(
                agent_id=agent_id,
                user_id=account_id,
                system_prompt="[SUNA_MANAGED]",  # Placeholder - overridden by extract_agent_config
                configured_mcps=config_data.get("configured_mcps", []),
                custom_mcps=config_data.get("custom_mcps", []),
                agentpress_tools={},  # Empty - read from SunaConfig
                version_name="v1",
                change_description="Initial Suna default agent (system prompt & tools from SunaConfig)"
            )
            
            logger.info(f"Created initial version {version['version_id']} for agent {agent_id}")
            
            return VersionResult(
                success=True,
                version_id=version['version_id']
            )
            
        except Exception as e:
            error_msg = f"Failed to create initial version for agent {agent_id}: {str(e)}"
            logger.warning(error_msg)
            
            return VersionResult(
                success=False,
                error_message=error_msg
            )
    
    def is_version_system_available(self) -> bool:
        try:
            from agent.versioning.facade import version_manager
            return True
        except ImportError:
            return False
    
    async def _get_current_user_mcps(self, agent_id: str, account_id: str) -> Dict[str, Any]:
        try:
            client = await self.db.client
            
            agent_result = await client.table('agents').select(
                'current_version_id, configured_mcps, custom_mcps'
            ).eq('agent_id', agent_id).execute()
            
            if not agent_result.data:
                logger.warning(f"Agent {agent_id} not found for MCP preservation")
                return {"configured_mcps": [], "custom_mcps": []}
            
            agent_data = agent_result.data[0]
            
            if agent_data.get('current_version_id'):
                try:
                    from agent.versioning.facade import version_manager
                    from agent.versioning.infrastructure.dependencies import set_db_connection
                    set_db_connection(self.db)
                    
                    version_data = await version_manager.get_version(
                        agent_id=agent_id,
                        version_id=agent_data['current_version_id'],
                        user_id=account_id
                    )
                    
                    if version_data:
                        logger.info(f"Preserved MCPs from version for agent {agent_id}")
                        
                        # Normalize field names from snake_case to camelCase
                        custom_mcps = version_data.get('custom_mcps', [])
                        normalized_custom_mcps = []
                        for mcp in custom_mcps:
                            normalized_mcp = mcp.copy()
                            # Ensure we use camelCase for enabledTools
                            if 'enabled_tools' in normalized_mcp:
                                normalized_mcp['enabledTools'] = normalized_mcp.pop('enabled_tools')
                            normalized_custom_mcps.append(normalized_mcp)
                        
                        logger.debug(f"Normalized {len(normalized_custom_mcps)} custom MCPs for agent {agent_id}")
                        return {
                            "configured_mcps": version_data.get('configured_mcps', []),
                            "custom_mcps": normalized_custom_mcps
                        }
                except Exception as e:
                    logger.warning(f"Failed to get version MCPs for agent {agent_id}: {e}, falling back to agent record")
            
            # Fallback to agent record MCPs
            logger.info(f"Preserved MCPs from agent record for agent {agent_id}")
            
            # Normalize field names for agent record too
            custom_mcps = agent_data.get('custom_mcps', [])
            normalized_custom_mcps = []
            for mcp in custom_mcps:
                normalized_mcp = mcp.copy() if isinstance(mcp, dict) else mcp
                # Ensure we use camelCase for enabledTools
                if isinstance(normalized_mcp, dict) and 'enabled_tools' in normalized_mcp:
                    normalized_mcp['enabledTools'] = normalized_mcp.pop('enabled_tools')
                normalized_custom_mcps.append(normalized_mcp)
            
            logger.debug(f"Normalized {len(normalized_custom_mcps)} custom MCPs from agent record for agent {agent_id}")
            return {
                "configured_mcps": agent_data.get('configured_mcps', []),
                "custom_mcps": normalized_custom_mcps
            }
            
        except Exception as e:
            logger.error(f"Failed to get current MCPs for agent {agent_id}: {e}, using empty")
            return {"configured_mcps": [], "custom_mcps": []}