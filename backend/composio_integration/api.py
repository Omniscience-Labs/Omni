from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from services.supabase import DBConnection
from datetime import datetime

from .composio_service import (
    get_integration_service,
    ComposioIntegrationService,
    ComposioIntegrationResult
)
from .toolkit_service import ToolkitInfo
from .composio_profile_service import ComposioProfileService, ComposioProfile

router = APIRouter(prefix="/composio", tags=["composio"])

# Global database connection
db: Optional[DBConnection] = None

def initialize(database: DBConnection):
    """Initialize the composio API with database connection"""
    global db
    db = database


class IntegrateToolkitRequest(BaseModel):
    toolkit_slug: str
    profile_name: Optional[str] = None
    display_name: Optional[str] = None
    user_id: Optional[str] = "default"
    mcp_server_name: Optional[str] = None
    save_as_profile: bool = True


class IntegrationStatusResponse(BaseModel):
    status: str
    toolkit: str
    auth_config_id: str
    connected_account_id: str
    mcp_server_id: str
    final_mcp_url: str
    profile_id: Optional[str] = None
    redirect_url: Optional[str] = None


class CreateProfileRequest(BaseModel):
    toolkit_slug: str
    profile_name: str
    display_name: Optional[str] = None
    user_id: Optional[str] = "default"
    mcp_server_name: Optional[str] = None
    is_default: bool = False


class ProfileResponse(BaseModel):
    profile_id: str
    profile_name: str
    display_name: str
    toolkit_slug: str
    toolkit_name: str
    mcp_url: str  # The complete MCP URL
    redirect_url: Optional[str] = None
    is_connected: bool
    is_default: bool
    created_at: str

    @classmethod
    def from_composio_profile(cls, profile: ComposioProfile) -> "ProfileResponse":
        return cls(
            profile_id=profile.profile_id,
            profile_name=profile.profile_name,
            display_name=profile.display_name,
            toolkit_slug=profile.toolkit_slug,
            toolkit_name=profile.toolkit_name,
            mcp_url=profile.mcp_url,  # Include the complete MCP URL
            redirect_url=profile.redirect_url,
            is_connected=profile.is_connected,
            is_default=profile.is_default,
            created_at=profile.created_at.isoformat() if profile.created_at else datetime.now().isoformat()
        )


@router.get("/toolkits")
async def list_toolkits(
    limit: int = Query(100, le=500),
    search: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        logger.info(f"Fetching Composio toolkits with limit: {limit}, search: {search}")
        
        service = get_integration_service()
        
        if search:
            toolkits = await service.search_toolkits(search)
        else:
            toolkits = await service.list_available_toolkits(limit)
        
        logger.info(f"Successfully fetched {len(toolkits)} Composio toolkits")
        
        return {
            "success": True,
            "toolkits": [toolkit.dict() for toolkit in toolkits],
            "total": len(toolkits)
        }
        
    except ValueError as e:
        logger.error(f"Configuration error fetching toolkits: {e}")
        raise HTTPException(status_code=400, detail=f"Configuration error: {str(e)}")
    except Exception as e:
        logger.error(f"Failed to list toolkits: {e}", exc_info=True)
        return {
            "success": False,
            "toolkits": [],
            "error": str(e)
        }


@router.post("/integrate", response_model=IntegrationStatusResponse)
async def integrate_toolkit(
    request: IntegrateToolkitRequest,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> IntegrationStatusResponse:
    try:
        service = get_integration_service(db_connection=db)
        result = await service.integrate_toolkit(
            toolkit_slug=request.toolkit_slug,
            account_id=current_user_id,
            profile_name=request.profile_name,
            display_name=request.display_name,
            user_id=request.user_id or current_user_id,
            mcp_server_name=request.mcp_server_name,
            save_as_profile=request.save_as_profile
        )
        
        return IntegrationStatusResponse(
            status="integrated",
            toolkit=result.toolkit.name,
            auth_config_id=result.auth_config.id,
            connected_account_id=result.connected_account.id,
            mcp_server_id=result.mcp_server.id,
            final_mcp_url=result.final_mcp_url,
            profile_id=result.profile_id,
            redirect_url=result.connected_account.redirect_url
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Integration failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profiles", response_model=ProfileResponse)
async def create_profile(
    request: CreateProfileRequest,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> ProfileResponse:
    try:
        # First, perform the Composio integration
        service = get_integration_service(db_connection=db)
        result = await service.integrate_toolkit(
            toolkit_slug=request.toolkit_slug,
            account_id=current_user_id,
            profile_name=request.profile_name,
            display_name=request.display_name,
            user_id=request.user_id or current_user_id,
            mcp_server_name=request.mcp_server_name,
            save_as_profile=True
        )
        
        logger.info(f"Integration result for {request.toolkit_slug}: redirect_url = {result.connected_account.redirect_url}")
        
        # Get the created profile
        profile_service = ComposioProfileService(db)
        profiles = await profile_service.get_profiles(current_user_id, request.toolkit_slug)
        
        # Find the profile we just created
        created_profile = None
        for profile in profiles:
            if profile.profile_name == request.profile_name:
                created_profile = profile
                break
        
        if not created_profile:
            raise HTTPException(status_code=500, detail="Profile created but not found")
        
        logger.info(f"Returning profile response with redirect_url: {created_profile.redirect_url}")
        
        return ProfileResponse.from_composio_profile(created_profile)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profiles")
async def get_profiles(
    toolkit_slug: Optional[str] = Query(None),
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        profiles = await profile_service.get_profiles(current_user_id, toolkit_slug)
        
        profile_responses = [ProfileResponse.from_composio_profile(profile) for profile in profiles]
        
        return {
            "success": True,
            "profiles": profile_responses
        }
        
    except Exception as e:
        logger.error(f"Failed to get profiles: {e}", exc_info=True)
        return {
            "success": False,
            "profiles": [],
            "error": str(e)
        }


@router.get("/profiles/{profile_id}/mcp-config")
async def get_profile_mcp_config(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        mcp_config = await profile_service.get_mcp_config_for_agent(profile_id)
        
        return {
            "success": True,
            "mcp_config": mcp_config,
            "profile_id": profile_id
        }
        
    except Exception as e:
        logger.error(f"Failed to get MCP config for profile {profile_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/integration/{connected_account_id}/status")
async def get_integration_status(
    connected_account_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        service = get_integration_service()
        status = await service.get_integration_status(connected_account_id)
        return {"connected_account_id": connected_account_id, **status}
    except Exception as e:
        logger.error(f"Failed to get status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profiles/{profile_id}/discover-tools")
async def discover_composio_tools(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        config = await profile_service.get_profile_config(profile_id)
        
        if config.get('type') != 'composio':
            raise HTTPException(status_code=400, detail="Not a Composio profile")
        
        mcp_url = config.get('mcp_url')
        if not mcp_url:
            raise HTTPException(status_code=400, detail="Profile has no MCP URL")
        
        from mcp_module.mcp_service import mcp_service
        
        result = await mcp_service.discover_custom_tools(
            request_type="http",
            config={"url": mcp_url}
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=f"Failed to discover tools: {result.message}")
        
        logger.info(f"Discovered {len(result.tools)} tools from Composio profile {profile_id}")
        
        return {
            "success": True,
            "profile_id": profile_id,
            "toolkit_name": config.get('toolkit_name', 'Unknown'),
            "tools": result.tools,
            "total_tools": len(result.tools)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to discover tools for profile {profile_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover-tools/{profile_id}")
async def discover_tools_post(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    return await discover_composio_tools(profile_id, current_user_id)


@router.get("/health")
async def health_check() -> Dict[str, str]:
    try:
        from .client import ComposioClient
        ComposioClient.get_client()
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))
