from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt
from .client import get_pipedream_client

router = APIRouter(prefix="/pipedream", tags=["pipedream"])

class CreateConnectionTokenRequest(BaseModel):
    app: Optional[str] = None

class ConnectionTokenResponse(BaseModel):
    success: bool
    link: Optional[str] = None
    token: Optional[str] = None
    external_user_id: str
    app: Optional[str] = None
    expires_at: Optional[str] = None
    error: Optional[str] = None

class ConnectionResponse(BaseModel):
    success: bool
    connections: List[Dict[str, Any]]
    count: int
    error: Optional[str] = None

class HealthCheckResponse(BaseModel):
    status: str
    project_id: str
    environment: str
    has_access_token: bool
    error: Optional[str] = None

class TriggerWorkflowRequest(BaseModel):
    workflow_id: str
    payload: Dict[str, Any]

class TriggerWorkflowResponse(BaseModel):
    success: bool
    workflow_id: str
    run_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None

class MCPDiscoveryRequest(BaseModel):
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


@router.post("/connection-token", response_model=ConnectionTokenResponse)
async def create_connection_token(
    request: CreateConnectionTokenRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating Pipedream connection token for user: {user_id}, app: {request.app}")
    
    try:
        client = get_pipedream_client()
        result = await client.create_connection_token(user_id, request.app)
        
        logger.info(f"Successfully created connection token for user: {user_id}")
        return ConnectionTokenResponse(
            success=True,
            link=result.get("connect_link_url"),
            token=result.get("token"),
            external_user_id=user_id,
            app=request.app,
            expires_at=result.get("expires_at")
        )
        
    except Exception as e:
        logger.error(f"Failed to create connection token for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create connection token: {str(e)}"
        )

@router.get("/connections", response_model=ConnectionResponse)
async def get_user_connections(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting Pipedream connections for user: {user_id}")
    try:
        client = get_pipedream_client()
        connections = await client.get_connections(user_id)
        
        logger.info(f"Successfully retrieved {len(connections)} connections for user: {user_id}")
        return ConnectionResponse(
            success=True,
            connections=connections,
            count=len(connections)
        )
        
    except Exception as e:
        logger.error(f"Failed to get connections for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get connections: {str(e)}"
        )

@router.post("/mcp/discover", response_model=MCPDiscoveryResponse)
async def discover_mcp_servers(
    request: MCPDiscoveryRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Discovering MCP servers for user: {user_id}, app: {request.app_slug}")
    
    try:
        client = get_pipedream_client()
        mcp_servers = await client.discover_mcp_servers(
            external_user_id=user_id,
            app_slug=request.app_slug,
            oauth_app_id=request.oauth_app_id
        )
        
        logger.info(f"Successfully discovered {len(mcp_servers)} MCP servers for user: {user_id}")
        return MCPDiscoveryResponse(
            success=True,
            mcp_servers=mcp_servers,
            count=len(mcp_servers)
        )
        
    except Exception as e:
        logger.error(f"Failed to discover MCP servers for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to discover MCP servers: {str(e)}"
        )

@router.post("/mcp/connect", response_model=MCPConnectionResponse)
async def create_mcp_connection(
    request: MCPConnectionRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating MCP connection for user: {user_id}, app: {request.app_slug}")
    try:
        client = get_pipedream_client()
        mcp_config = await client.create_mcp_connection(
            external_user_id=user_id,
            app_slug=request.app_slug,
            oauth_app_id=request.oauth_app_id
        )
        logger.info(f"Successfully created MCP connection for user: {user_id}, app: {request.app_slug}")
        return MCPConnectionResponse(
            success=True,
            mcp_config=mcp_config
        )
    except Exception as e:
        logger.error(f"Failed to create MCP connection for user {user_id}, app {request.app_slug}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create MCP connection: {str(e)}"
        )
