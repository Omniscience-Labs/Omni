import logging
from typing import List, Optional, Dict, Any, Union
from uuid import UUID

from .domain.entities import Profile, Connection, App, MCPServer
from .domain.value_objects import ExternalUserId, AppSlug
from .repositories.profile_repository import SupabaseProfileRepository
from .repositories.connection_repository import PipedreamConnectionRepository
from .repositories.app_repository import PipedreamAppRepository
from .repositories.mcp_server_repository import PipedreamMCPServerRepository
from .services.profile_service import ProfileService
from .services.external_user_id_service import ExternalUserIdService
from .services.mcp_qualified_name_service import MCPQualifiedNameService
from .services.profile_configuration_service import ProfileConfigurationService
from .services.connection_status_service import ConnectionStatusService
from .services.connection_token_service import ConnectionTokenService
from .support.http_client import HttpClient
from .support.encryption_service import EncryptionService
from .protocols import DatabaseConnection, Logger
from utils.logger import logger

class PipedreamManager:
    def __init__(
        self,
        db: Optional[DatabaseConnection] = None,
        logger: Optional[Logger] = None
    ):
        self._logger = logger or logging.getLogger(__name__)
        
        if db is None:
            from services.supabase import DBConnection
            self._db = DBConnection()
        else:
            self._db = db
        
        self._encryption_service = EncryptionService()
        self._http_client = HttpClient()
        
        self._profile_repo = SupabaseProfileRepository(self._db, self._encryption_service, self._logger)
        self._connection_repo = PipedreamConnectionRepository(self._http_client, self._logger)
        self._app_repo = PipedreamAppRepository(self._http_client, self._logger)
        self._mcp_server_repo = PipedreamMCPServerRepository(self._http_client, self._logger)
        
        self._external_user_id_service = ExternalUserIdService()
        self._mcp_qualified_name_service = MCPQualifiedNameService()
        self._profile_config_service = ProfileConfigurationService()
        self._connection_status_service = ConnectionStatusService(self._connection_repo, self._logger)
        self._connection_token_service = ConnectionTokenService(self._http_client, self._logger)
        
        self._profile_service = ProfileService(
            self._profile_repo,
            self._external_user_id_service,
            self._mcp_qualified_name_service,
            self._profile_config_service,
            self._connection_status_service,
            self._logger
        )

    async def create_profile(
        self,
        account_id: str,
        profile_name: str,
        app_slug: str,
        app_name: str,
        description: Optional[str] = None,
        is_default: bool = False,
        oauth_app_id: Optional[str] = None,
        enabled_tools: Optional[List[str]] = None,
        external_user_id: Optional[str] = None
    ) -> Profile:
        return await self._profile_service.create_profile(
            UUID(account_id),
            profile_name,
            app_slug,
            app_name,
            description,
            is_default,
            oauth_app_id,
            enabled_tools,
            external_user_id
        )

    async def get_profile(self, account_id: str, profile_id: str) -> Optional[Profile]:
        return await self._profile_service.get_profile(UUID(account_id), UUID(profile_id))

    async def validate_profile_access(self, account_id: str, profile_id: str) -> bool:
        try:
            profile = await self.get_profile(account_id, profile_id)
            return profile is not None
        except Exception as e:
            self._logger.warning(f"Error validating profile access: {str(e)}")
            return False

    async def get_profiles(
        self,
        account_id: str,
        app_slug: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> List[Profile]:
        return await self._profile_service.get_profiles(UUID(account_id), app_slug, is_active)

    async def update_profile(
        self,
        account_id: str,
        profile_id: str,
        profile_name: Optional[str] = None,
        display_name: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
        enabled_tools: Optional[List[str]] = None
    ) -> Profile:
        return await self._profile_service.update_profile(
            UUID(account_id),
            UUID(profile_id),
            profile_name,
            display_name,
            is_active,
            is_default,
            enabled_tools
        )

    async def delete_profile(self, account_id: str, profile_id: str) -> bool:
        return await self._profile_service.delete_profile(UUID(account_id), UUID(profile_id))

    async def get_profile_by_app(
        self,
        account_id: str,
        app_slug: str,
        profile_name: Optional[str] = None
    ) -> Optional[Profile]:
        return await self._profile_service.get_profile_by_app(UUID(account_id), app_slug, profile_name)

    async def create_connection_token(
        self,
        external_user_id: Union[str, ExternalUserId],
        app: Optional[str] = None
    ) -> Dict[str, Any]:
        from .domain.value_objects import ExternalUserId, AppSlug
        
        if isinstance(external_user_id, ExternalUserId):
            external_user_id_vo = external_user_id
        else:
            external_user_id_vo = ExternalUserId(external_user_id)
            
        app_slug_vo = AppSlug(app) if app else None
        return await self._connection_token_service.create(external_user_id_vo, app_slug_vo)

    async def get_connections(self, external_user_id: Union[str, ExternalUserId]) -> List[Connection]:
        from .domain.value_objects import ExternalUserId
        
        if isinstance(external_user_id, ExternalUserId):
            external_user_id_vo = external_user_id
        else:
            external_user_id_vo = ExternalUserId(external_user_id)
            
        return await self._connection_repo.get_by_external_user_id(external_user_id_vo)

    async def discover_mcp_servers(
        self,
        external_user_id: Union[str, ExternalUserId],
        app_slug: Optional[Union[str, AppSlug]] = None
    ) -> List[MCPServer]:
        from .domain.value_objects import ExternalUserId, AppSlug

        if isinstance(external_user_id, ExternalUserId):
            external_user_id_vo = external_user_id
        else:
            external_user_id_vo = ExternalUserId(external_user_id)
            
        if app_slug is None:
            app_slug_vo = None
        elif isinstance(app_slug, AppSlug):
            app_slug_vo = app_slug
        else:
            app_slug_vo = AppSlug(app_slug)
            
        return await self._mcp_server_repo.discover_for_user(external_user_id_vo, app_slug_vo)

    async def create_mcp_connection(
        self,
        external_user_id: Union[str, ExternalUserId],
        app_slug: str,
        oauth_app_id: Optional[str] = None
    ) -> MCPServer:
        from .domain.value_objects import ExternalUserId, AppSlug
        
        if isinstance(external_user_id, ExternalUserId):
            external_user_id_vo = external_user_id
        else:
            external_user_id_vo = ExternalUserId(external_user_id)
            
        app_slug_vo = AppSlug(app_slug)
        return await self._mcp_server_repo.create_connection(external_user_id_vo, app_slug_vo, oauth_app_id)

    async def search_apps(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        from .domain.value_objects import SearchQuery, Category, PaginationCursor
        search_query = SearchQuery(query)
        category_vo = Category(category) if category else None
        cursor_vo = PaginationCursor(cursor) if cursor else None
        return await self._app_repo.search(search_query, category_vo, page, limit, cursor_vo)

    async def get_app_by_slug(self, app_slug: str) -> Optional[App]:
        from .domain.value_objects import AppSlug
        app_slug_vo = AppSlug(app_slug)
        return await self._app_repo.get_by_slug(app_slug_vo)
    
    async def get_app_icon(self, app_slug: str) -> Optional[str]:
        from .domain.value_objects import AppSlug
        app_slug_vo = AppSlug(app_slug)
        return await self._app_repo.get_icon_url(app_slug_vo)

    async def get_popular_apps(self, category: Optional[str] = None, limit: int = 100) -> List[App]:
        from .domain.value_objects import Category
        category_vo = Category(category) if category else None
        return await self._app_repo.get_popular(category_vo, limit)

    async def get_enabled_tools_for_agent_profile(
        self,
        agent_id: str,
        profile_id: str,
        user_id: str
    ) -> List[str]:
        from services.supabase import DBConnection
        from agent.versioning.facade import VersionManagerFacade
        
        db = DBConnection()
        client = await db.client
        version_manager = VersionManagerFacade()
        
        agent_result = await client.table('agents').select('current_version_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            return []

        agent = agent_result.data[0]
        
        version_custom_mcps = []
        if agent.get('current_version_id'):
            try:
                version_dict = await version_manager.get_version(
                    agent_id=agent_id,
                    version_id=agent['current_version_id'],
                    user_id=user_id
                )
                version_custom_mcps = version_dict.get('custom_mcps', [])
            except Exception as e:
                pass
        
        pipedream_mcp = None
        
        print(f"[PROFILE {profile_id}] Searching for pipedream MCP. Version MCPs: {len(version_custom_mcps)}")
        print(f"[PROFILE {profile_id}] Version custom MCPs: {version_custom_mcps}")
        
        for mcp in version_custom_mcps:
            mcp_type = mcp.get('type')
            mcp_config = mcp.get('config', {})
            mcp_profile_id = mcp_config.get('profile_id')
            print(f"[PROFILE {profile_id}] Version MCP: type={mcp_type}, profile_id={mcp_profile_id}, target_profile_id={profile_id}")
            
            if mcp_type == 'pipedream' and mcp_profile_id == profile_id:
                pipedream_mcp = mcp
                print(f"[PROFILE {profile_id}] Found matching MCP in version data: {mcp}")
                break

        if not pipedream_mcp:
            print(f"[PROFILE {profile_id}] No matching pipedream MCP found!")
            return []
        
        enabled_tools = pipedream_mcp.get('enabledTools', pipedream_mcp.get('enabled_tools', []))
        print(f"[PROFILE {profile_id}] Found MCP in version data with {len(enabled_tools)} enabled tools: {enabled_tools}")
        return enabled_tools

    async def get_enabled_tools_for_agent_profile_version(
        self,
        agent_id: str,
        profile_id: str,
        user_id: str,
        version_id: str
    ) -> List[str]:
        from services.supabase import DBConnection
        from agent.versioning.facade import VersionManagerFacade
        
        db = DBConnection()
        client = await db.client
        version_manager = VersionManagerFacade()
        
        agent_result = await client.table('agents').select('agent_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            return []

        try:
            version_dict = await version_manager.get_version(
                agent_id=agent_id,
                version_id=version_id,
                user_id=user_id
            )
            version_custom_mcps = version_dict.get('custom_mcps', [])
        except Exception as e:
            return []
        
        pipedream_mcp = None
        
        print(f"[VERSION {version_id}] [PROFILE {profile_id}] Searching for pipedream MCP. Version MCPs: {len(version_custom_mcps)}")
        print(f"[VERSION {version_id}] [PROFILE {profile_id}] Version custom MCPs: {version_custom_mcps}")
        
        for mcp in version_custom_mcps:
            mcp_type = mcp.get('type')
            mcp_config = mcp.get('config', {})
            mcp_profile_id = mcp_config.get('profile_id')
            print(f"[VERSION {version_id}] [PROFILE {profile_id}] Version MCP: type={mcp_type}, profile_id={mcp_profile_id}, target_profile_id={profile_id}")
            
            if mcp_type == 'pipedream' and mcp_profile_id == profile_id:
                pipedream_mcp = mcp
                print(f"[VERSION {version_id}] [PROFILE {profile_id}] Found matching MCP in version data: {mcp}")
                break

        if not pipedream_mcp:
            print(f"[VERSION {version_id}] [PROFILE {profile_id}] No matching pipedream MCP found!")
            return []
        
        enabled_tools = pipedream_mcp.get('enabledTools', pipedream_mcp.get('enabled_tools', []))
        print(f"[VERSION {version_id}] [PROFILE {profile_id}] Found MCP with {len(enabled_tools)} enabled tools: {enabled_tools}")
        return enabled_tools

    async def update_agent_profile_tools(
        self,
        agent_id: str,
        profile_id: str,
        user_id: str,
        enabled_tools: List[str]
    ) -> Dict[str, Any]:
        from services.supabase import DBConnection
        from agent.versioning.facade import version_manager
        import copy
        
        db = DBConnection()

        from agent.versioning.infrastructure.dependencies import set_db_connection
        set_db_connection(db)
        client = await db.client
        
        agent_result = await client.table('agents').select('current_version_id').eq('agent_id', agent_id).eq('account_id', user_id).execute()
        if not agent_result.data:
            raise ValueError("Agent not found")
        
        agent = agent_result.data[0]
        
        current_version_data = None
        if agent.get('current_version_id'):
            try:
                current_version_data = await version_manager.get_version(
                    agent_id=agent_id,
                    version_id=agent['current_version_id'],
                    user_id=user_id
                )
            except Exception as e:
                pass
        

        profile = await self.get_profile(user_id, profile_id)
        if not profile:
            raise ValueError("Profile not found")
        
        if current_version_data:
            system_prompt = current_version_data.get('system_prompt', '')
            configured_mcps = current_version_data.get('configured_mcps', [])
            agentpress_tools = current_version_data.get('agentpress_tools', {})
            current_custom_mcps = current_version_data.get('custom_mcps', [])
        else:
            system_prompt = ''
            configured_mcps = []
            agentpress_tools = {}
            current_custom_mcps = []
        
        updated_custom_mcps = copy.deepcopy(current_custom_mcps)
        
        for mcp in updated_custom_mcps:
            if 'enabled_tools' in mcp and 'enabledTools' not in mcp:
                mcp['enabledTools'] = mcp['enabled_tools']
            elif 'enabledTools' not in mcp and 'enabled_tools' not in mcp:
                mcp['enabledTools'] = []

        found_match = False
        for mcp in updated_custom_mcps:
            if (mcp.get('type') == 'pipedream' and 
                mcp.get('config', {}).get('profile_id') == profile_id):                
                mcp['enabledTools'] = enabled_tools
                mcp['enabled_tools'] = enabled_tools
                found_match = True
                break
        
        if not found_match:
            new_mcp_config = {
                "name": profile.app_name,
                "type": "pipedream",
                "config": {
                    "url": "https://remote.mcp.pipedream.net",
                    "headers": {
                        "x-pd-app-slug": profile.app_slug.value
                    },
                    "profile_id": profile_id
                },
                "enabledTools": enabled_tools,
                "enabled_tools": enabled_tools
            }
            updated_custom_mcps.append(new_mcp_config)
        
        new_version = await version_manager.create_version(
            agent_id=agent_id,
            user_id=user_id,
            system_prompt=system_prompt,
            configured_mcps=configured_mcps,
            custom_mcps=updated_custom_mcps,
            agentpress_tools=agentpress_tools,
            change_description=f"Updated {profile.app_name} tools"
        )
        
        update_result = await client.table('agents').update({
            'current_version_id': new_version['version_id']
        }).eq('agent_id', agent_id).execute()
        
        if not update_result.data:
            raise ValueError("Failed to update agent configuration")
        
        return {
            'success': True,
            'enabled_tools': enabled_tools,
            'total_tools': len(enabled_tools),
            'version_id': new_version['version_id'],
            'version_name': new_version['version_name']
        }

    async def close(self):
        await self._http_client.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close() 