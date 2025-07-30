from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from .mcp_service import mcp_service, MCPException, MCPServerNotFoundError

router = APIRouter()

class MCPServerResponse(BaseModel):
    qualified_name: str
    display_name: str
    description: str
    created_at: str
    use_count: int
    homepage: str
    icon_url: Optional[str] = None
    is_deployed: Optional[bool] = None
    tools: Optional[List[Dict[str, Any]]] = None
    security: Optional[Dict[str, Any]] = None


class MCPServerListResponse(BaseModel):
    servers: List[MCPServerResponse]
    pagination: Dict[str, int]


class MCPServerDetailResponse(BaseModel):
    qualified_name: str
    display_name: str
    icon_url: Optional[str] = None
    deployment_url: Optional[str] = None
    connections: List[Dict[str, Any]]
    security: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None


class PopularServersResponse(BaseModel):
    success: bool
    servers: List[Dict[str, Any]]
    categorized: Dict[str, List[Dict[str, Any]]]
    total: int
    category_count: int
    pagination: Dict[str, int]


class CustomMCPConnectionRequest(BaseModel):
    url: str
    config: Optional[Dict[str, Any]] = {}


class CustomMCPConnectionResponse(BaseModel):
    success: bool
    qualified_name: str
    display_name: str
    tools: List[Dict[str, Any]]
    config: Dict[str, Any]
    url: str
    message: str


class CustomMCPDiscoverRequest(BaseModel):
    type: str
    config: Dict[str, Any]


@router.get("/mcp/servers/{qualified_name:path}", response_model=MCPServerDetailResponse)
async def get_mcp_server_details(
    qualified_name: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        server_detail = await mcp_service.get_server_details(qualified_name)
        
        return MCPServerDetailResponse(
            qualified_name=server_detail.qualified_name,
            display_name=server_detail.display_name,
            icon_url=server_detail.icon_url,
            deployment_url=server_detail.deployment_url,
            connections=server_detail.connections,
            security=server_detail.security,
            tools=server_detail.tools
        )
        
    except MCPServerNotFoundError:
        raise HTTPException(status_code=404, detail="MCP server not found")
    except MCPException as e:
        logger.error(f"Error getting MCP server details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mcp/discover-custom-tools")
async def discover_custom_mcp_tools(request: CustomMCPDiscoverRequest):
    try:
        result = await mcp_service.discover_custom_tools(request.type, request.config)
        
        return CustomMCPConnectionResponse(
            success=result.success,
            qualified_name=result.qualified_name,
            display_name=result.display_name,
            tools=result.tools,
            config=result.config,
            url=result.url,
            message=result.message
        )
        
    except MCPException as e:
        logger.error(f"Error discovering custom MCP tools: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 