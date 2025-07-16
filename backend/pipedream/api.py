from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt
from .facade import PipedreamManager
from .domain.entities import Profile, ConnectionStatus
from .domain.exceptions import (
    ProfileNotFoundError, ProfileAlreadyExistsError, 
    ConnectionNotFoundError, AppNotFoundError, MCPConnectionError,
    ValidationException, PipedreamException
)

router = APIRouter(prefix="/pipedream", tags=["pipedream"])
pipedream_manager: Optional[PipedreamManager] = None


def initialize(database):
    global pipedream_manager
    if pipedream_manager is None:
        pipedream_manager = PipedreamManager(db=database, logger=logger)


class CreateConnectionTokenRequest(BaseModel):
    app: Optional[str] = None


class ConnectionTokenResponse(BaseModel):
    success: bool
    link: Optional[str] = None
    token: Optional[str] = None
    external_user_id: str = ""
    app: Optional[str] = None
    expires_at: Optional[str] = None
    error: Optional[str] = None


class ConnectionResponse(BaseModel):
    success: bool
    connections: List[Dict[str, Any]]
    count: int
    error: Optional[str] = None


class MCPDiscoveryRequest(BaseModel):
    app_slug: Optional[str] = None
    oauth_app_id: Optional[str] = None


class MCPProfileDiscoveryRequest(BaseModel):
    external_user_id: str
    app_slug: Optional[str] = None
    oauth_app_id: Optional[str] = None


class MCPDiscoveryResponse(BaseModel):
    success: bool
    mcp_servers: List[Dict[str, Any]]
    count: int
    error: Optional[str] = None


class MCPConnectionRequest(BaseModel):
    app_slug: str
    oauth_app_id: Optional[str] = None


class MCPConnectionResponse(BaseModel):
    success: bool
    mcp_config: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class ProfileRequest(BaseModel):
    profile_name: str
    app_slug: str
    app_name: str
    description: Optional[str] = None
    is_default: bool = False
    oauth_app_id: Optional[str] = None
    enabled_tools: List[str] = []
    external_user_id: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    profile_name: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    enabled_tools: Optional[List[str]] = None


class ProfileResponse(BaseModel):
    profile_id: UUID
    account_id: UUID
    mcp_qualified_name: str
    profile_name: str
    display_name: str
    app_slug: str
    app_name: str
    external_user_id: str
    enabled_tools: List[str]
    is_active: bool
    is_default: bool
    is_connected: bool
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None

    @classmethod
    def from_domain(cls, profile: Profile) -> 'ProfileResponse':
        return cls(
            profile_id=profile.profile_id,
            account_id=profile.account_id,
            mcp_qualified_name=profile.mcp_qualified_name,
            profile_name=profile.profile_name.value,
            display_name=profile.display_name,
            app_slug=profile.app_slug.value,
            app_name=profile.app_name,
            external_user_id=profile.external_user_id.value,
            enabled_tools=profile.enabled_tools,
            is_active=profile.is_active,
            is_default=profile.is_default,
            is_connected=profile.is_connected,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
            last_used_at=profile.last_used_at
        )


def _strip_pipedream_prefix(app_slug: Optional[str]) -> Optional[str]:
    if app_slug and app_slug.startswith("pipedream:"):
        return app_slug[len("pipedream:"):]
    return app_slug


def _handle_pipedream_exception(e: Exception) -> HTTPException:
    if isinstance(e, ProfileNotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    elif isinstance(e, ProfileAlreadyExistsError):
        return HTTPException(status_code=409, detail=str(e))
    elif isinstance(e, ValidationException):
        return HTTPException(status_code=400, detail=str(e))
    elif isinstance(e, ConnectionNotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    elif isinstance(e, AppNotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    elif isinstance(e, MCPConnectionError):
        return HTTPException(status_code=502, detail=str(e))
    elif isinstance(e, PipedreamException):
        return HTTPException(status_code=500, detail=str(e))
    else:
        return HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/connection-token", response_model=ConnectionTokenResponse)
async def create_connection_token(
    request: CreateConnectionTokenRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating Pipedream connection token for user: {user_id}, app: {request.app}")
    
    actual_app = _strip_pipedream_prefix(request.app)
    
    try:
        result = await pipedream_manager.create_connection_token(user_id, actual_app)
        
        return ConnectionTokenResponse(
            success=True,
            link=result.get("connect_link_url"),
            token=result.get("token"),
            external_user_id=user_id,
            app=actual_app,
            expires_at=result.get("expires_at")
        )
        
    except Exception as e:
        logger.error(f"Failed to create connection token: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/connections", response_model=ConnectionResponse)
async def get_user_connections(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting connections for user: {user_id}")
    
    try:
        connections = await pipedream_manager.get_connections(user_id)
        
        connection_data = []
        for connection in connections:
            connection_data.append({
                "name": connection.app.name,
                "name_slug": connection.app.slug.value,
                "description": connection.app.description,
                "category": connection.app.category,
                "img_src": connection.app.logo_url,
                "auth_type": connection.app.auth_type.value,
                "verified": connection.app.is_verified,
                "url": connection.app.url,
                "tags": connection.app.tags,
                "is_active": connection.is_active
            })
        
        return ConnectionResponse(
            success=True,
            connections=connection_data,
            count=len(connection_data)
        )
        
    except Exception as e:
        logger.error(f"Failed to get connections: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.post("/mcp/discover", response_model=MCPDiscoveryResponse)
async def discover_mcp_servers(
    request: MCPDiscoveryRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Discovering MCP servers for user: {user_id}, app: {request.app_slug}")
    
    actual_app_slug = _strip_pipedream_prefix(request.app_slug)
    
    try:
        servers = await pipedream_manager.discover_mcp_servers(user_id, actual_app_slug)
        
        server_data = []
        for server in servers:
            tools_data = []
            for tool in server.available_tools:
                tools_data.append({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.input_schema
                })
            
            server_data.append({
                "app_slug": server.app_slug.value,
                "app_name": server.app_name,
                "server_url": server.server_url.value,
                "project_id": server.project_id,
                "environment": server.environment,
                "external_user_id": server.external_user_id.value,
                "oauth_app_id": server.oauth_app_id,
                "status": server.status.value,
                "available_tools": tools_data,
                "error": server.error_message
            })
        
        return MCPDiscoveryResponse(
            success=True,
            mcp_servers=server_data,
            count=len(server_data)
        )
        
    except Exception as e:
        logger.error(f"Failed to discover MCP servers: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.post("/mcp/discover-profile", response_model=MCPDiscoveryResponse)
async def discover_mcp_servers_for_profile(
    request: MCPProfileDiscoveryRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Discovering MCP servers for profile: {request.external_user_id}")
    
    actual_app_slug = _strip_pipedream_prefix(request.app_slug)
    
    try:
        servers = await pipedream_manager.discover_mcp_servers(request.external_user_id, actual_app_slug)
        
        server_data = []
        for server in servers:
            tools_data = []
            for tool in server.available_tools:
                tools_data.append({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.input_schema
                })
            
            server_data.append({
                "app_slug": server.app_slug.value,
                "app_name": server.app_name,
                "server_url": server.server_url.value,
                "project_id": server.project_id,
                "environment": server.environment,
                "external_user_id": server.external_user_id.value,
                "oauth_app_id": server.oauth_app_id,
                "status": server.status.value,
                "available_tools": tools_data,
                "error": server.error_message
            })
        
        return MCPDiscoveryResponse(
            success=True,
            mcp_servers=server_data,
            count=len(server_data)
        )
        
    except Exception as e:
        logger.error(f"Failed to discover MCP servers for profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.post("/mcp/connect", response_model=MCPConnectionResponse)
async def create_mcp_connection(
    request: MCPConnectionRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating MCP connection for user: {user_id}, app: {request.app_slug}")
    
    actual_app_slug = _strip_pipedream_prefix(request.app_slug)
    
    try:
        server = await pipedream_manager.create_mcp_connection(
            user_id, 
            actual_app_slug, 
            request.oauth_app_id
        )
        
        tools_data = []
        for tool in server.available_tools:
            tools_data.append({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema
            })
        
        mcp_config = {
            "app_slug": server.app_slug.value,
            "app_name": server.app_name,
            "server_url": server.server_url.value,
            "project_id": server.project_id,
            "environment": server.environment,
            "external_user_id": server.external_user_id.value,
            "oauth_app_id": server.oauth_app_id,
            "status": server.status.value,
            "available_tools": tools_data
        }
        
        return MCPConnectionResponse(
            success=True,
            mcp_config=mcp_config
        )
        
    except Exception as e:
        logger.error(f"Failed to create MCP connection: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/apps", response_model=Dict[str, Any])
async def get_pipedream_apps(
    after: Optional[str] = Query(None, description="Cursor for pagination"),
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None)
):
    logger.info(f"Fetching Pipedream apps: query='{q}', category='{category}'")
    
    try:
        result = await pipedream_manager.search_apps(
            query=q,
            category=category,
            cursor=after
        )
        
        apps_data = []
        for app in result.get("apps", []):
            categories = []
            if app.category and app.category != "Other":
                categories.append(app.category)
            if app.tags:
                for tag in app.tags:
                    if tag and tag not in categories:
                        categories.append(tag)
            if not categories and app.category:
                categories.append(app.category)
                
            apps_data.append({
                "name": app.name,
                "name_slug": app.slug.value,
                "description": app.description,
                "category": app.category,
                "categories": categories,
                "img_src": app.logo_url,
                "auth_type": app.auth_type.value,
                "verified": app.is_verified,
                "url": app.url,
                "tags": app.tags,
                "featured_weight": app.featured_weight
            })
        
        return {
            "success": True,
            "apps": apps_data,
            "page_info": result.get("page_info", {}),
            "total_count": result.get("total_count", 0)
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch Pipedream apps: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/apps/popular", response_model=Dict[str, Any])
async def get_popular_pipedream_apps():
    logger.info("Fetching popular Pipedream apps")
    
    try:
        apps = await pipedream_manager.get_popular_apps(limit=100)
        
        apps_data = []
        for app in apps:
            categories = []
            if app.category and app.category != "Other":
                categories.append(app.category)
            if app.tags:
                for tag in app.tags:
                    if tag and tag not in categories:
                        categories.append(tag)

            if not categories and app.category:
                categories.append(app.category)
                
            apps_data.append({
                "name": app.name,
                "name_slug": app.slug.value,
                "description": app.description,
                "category": app.category,
                "categories": categories,
                "img_src": app.logo_url,
                "auth_type": app.auth_type.value,
                "verified": app.is_verified,
                "url": app.url,
                "tags": app.tags,
                "featured_weight": app.featured_weight
            })
        
        return {
            "success": True,
            "apps": apps_data,
            "page_info": {
                "total_count": len(apps_data),
                "count": len(apps_data),
                "has_more": False
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch popular Pipedream apps: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/apps/{app_slug}/icon")
async def get_app_icon(app_slug: str):
    logger.info(f"Fetching icon for app: {app_slug}")
    try:
        icon_url = await pipedream_manager.get_app_icon(app_slug)
        if icon_url:
            return {
                "success": True,
                "app_slug": app_slug,
                "icon_url": icon_url
            }
        else:
            raise HTTPException(
                status_code=404, 
                detail=f"Icon not found for app: {app_slug}"
            )
            
    except Exception as e:
        logger.error(f"Failed to fetch icon for app {app_slug}: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.post("/profiles", response_model=ProfileResponse)
async def create_credential_profile(
    request: ProfileRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating credential profile for user: {user_id}, app: {request.app_slug}")
    
    try:
        profile = await pipedream_manager.create_profile(
            account_id=user_id,
            profile_name=request.profile_name,
            app_slug=request.app_slug,
            app_name=request.app_name,
            description=request.description,
            is_default=request.is_default,
            oauth_app_id=request.oauth_app_id,
            enabled_tools=request.enabled_tools,
            external_user_id=request.external_user_id
        )
        
        return ProfileResponse.from_domain(profile)
        
    except Exception as e:
        logger.error(f"Failed to create credential profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/profiles", response_model=List[ProfileResponse])
async def get_credential_profiles(
    app_slug: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting credential profiles for user: {user_id}, app: {app_slug}")
    
    actual_app_slug = _strip_pipedream_prefix(app_slug)
    
    try:
        profiles = await pipedream_manager.get_profiles(user_id, actual_app_slug, is_active)
        
        return [ProfileResponse.from_domain(profile) for profile in profiles]
        
    except Exception as e:
        logger.error(f"Failed to get credential profiles: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/profiles/{profile_id}", response_model=ProfileResponse)
async def get_credential_profile(
    profile_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting credential profile: {profile_id} for user: {user_id}")
    
    try:
        profile = await pipedream_manager.get_profile(user_id, profile_id)
        
        if not profile:
            raise ProfileNotFoundError(profile_id)
        
        return ProfileResponse.from_domain(profile)
        
    except Exception as e:
        logger.error(f"Failed to get credential profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.put("/profiles/{profile_id}", response_model=ProfileResponse)
async def update_credential_profile(
    profile_id: str,
    request: UpdateProfileRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Updating credential profile: {profile_id} for user: {user_id}")
    
    try:
        profile = await pipedream_manager.update_profile(
            account_id=user_id,
            profile_id=profile_id,
            profile_name=request.profile_name,
            display_name=request.display_name,
            is_active=request.is_active,
            is_default=request.is_default,
            enabled_tools=request.enabled_tools
        )
        
        return ProfileResponse.from_domain(profile)
        
    except Exception as e:
        logger.error(f"Failed to update credential profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.delete("/profiles/{profile_id}")
async def delete_credential_profile(
    profile_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Deleting credential profile: {profile_id} for user: {user_id}")
    
    try:
        success = await pipedream_manager.delete_profile(user_id, profile_id)
        
        if not success:
            raise ProfileNotFoundError(profile_id)
        
        return {"success": True, "message": "Profile deleted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to delete credential profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.post("/profiles/{profile_id}/connect")
async def connect_credential_profile(
    profile_id: str,
    app: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Connecting credential profile: {profile_id} for user: {user_id}")
    
    actual_app = _strip_pipedream_prefix(app)
    
    try:
        profile = await pipedream_manager.get_profile(user_id, profile_id)
        if not profile:
            raise ProfileNotFoundError(profile_id)
        
        result = await pipedream_manager.create_connection_token(
            profile.external_user_id.value,
            actual_app or profile.app_slug.value
        )
        
        return {
            "success": True,
            "link": result.get("connect_link_url"),
            "token": result.get("token"),
            "expires_at": result.get("expires_at"),
            "profile_id": profile_id,
            "external_user_id": profile.external_user_id.value,
            "app": actual_app or profile.app_slug.value
        }
        
    except Exception as e:
        logger.error(f"Failed to connect credential profile: {str(e)}")
        raise _handle_pipedream_exception(e)


@router.get("/profiles/{profile_id}/connections")
async def get_profile_connections(
    profile_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting connections for profile: {profile_id}, user: {user_id}")
    
    try:
        profile = await pipedream_manager.get_profile(user_id, profile_id)
        if not profile:
            raise ProfileNotFoundError(profile_id)
        
        connections = await pipedream_manager.get_connections(profile.external_user_id.value)
        
        connection_data = []
        for connection in connections:
            connection_data.append({
                "name": connection.app.name,
                "name_slug": connection.app.slug.value,
                "description": connection.app.description,
                "category": connection.app.category,
                "img_src": connection.app.logo_url,
                "auth_type": connection.app.auth_type.value,
                "verified": connection.app.is_verified,
                "url": connection.app.url,
                "tags": connection.app.tags,
                "is_active": connection.is_active
            })
        
        return {
            "success": True,
            "connections": connection_data,
            "count": len(connection_data)
        }
        
    except Exception as e:
        logger.error(f"Failed to get profile connections: {str(e)}")
        raise _handle_pipedream_exception(e)
