from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from services.supabase import DBConnection

from .composio_service import (
    get_integration_service,
    ComposioIntegrationService,
    ComposioIntegrationResult
)
from .toolkit_service import ToolkitInfo

router = APIRouter(prefix="/composio", tags=["composio"])

db: Optional[DBConnection] = None

def initialize(database: DBConnection):
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


@router.get("/toolkits", response_model=List[ToolkitInfo])
async def list_toolkits(
    limit: int = Query(100, le=500),
    search: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> List[ToolkitInfo]:
    try:
        service = get_integration_service()
        if search:
            return await service.search_toolkits(search)
        return await service.list_available_toolkits(limit)
    except Exception as e:
        logger.error(f"Failed to list toolkits: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/health")
async def health_check() -> Dict[str, str]:
    try:
        from .client import ComposioClient
        ComposioClient.get_client()
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))
