from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from ..domain.entities import AgentId, VersionId, UserId
from ..services.version_service import VersionService
from ..services.exceptions import (
    VersionNotFoundError, AgentNotFoundError, UnauthorizedError,
    InvalidVersionError
)
from ..infrastructure.dependencies import get_version_service
from utils.auth_utils import get_current_user_id_from_jwt


router = APIRouter(prefix="/agents/{agent_id}/versions", tags=["versions"])


class VersionResponse(BaseModel):
    version_id: str
    agent_id: str
    version_number: int
    version_name: str
    system_prompt: str
    configured_mcps: List[dict] = Field(default_factory=list)
    custom_mcps: List[dict] = Field(default_factory=list)
    agentpress_tools: dict = Field(default_factory=dict)
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: str
    change_description: Optional[str] = None


class CreateVersionRequest(BaseModel):
    system_prompt: str
    configured_mcps: List[dict] = Field(default_factory=list)
    custom_mcps: List[dict] = Field(default_factory=list)
    agentpress_tools: dict = Field(default_factory=dict)
    version_name: Optional[str] = None
    description: Optional[str] = None


class UpdateVersionDetailsRequest(BaseModel):
    version_name: Optional[str] = None
    change_description: Optional[str] = None


class CompareVersionsResponse(BaseModel):
    version1: VersionResponse
    version2: VersionResponse
    differences: List[dict]


@router.get("", response_model=List[VersionResponse])
async def get_versions(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        agent_id_obj = AgentId.from_string(agent_id)
        user_id_obj = UserId.from_string(user_id)
        
        versions = await version_service.get_all_versions(agent_id_obj, user_id_obj)
        
        return [
            VersionResponse(**version.to_dict())
            for version in versions
        ]
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except AgentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch versions")


@router.post("", response_model=VersionResponse)
async def create_version(
    agent_id: str,
    request: CreateVersionRequest,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        from services.supabase import DBConnection
        from utils.logger import logger
        from agent.config_helper import extract_agent_config
        
        db = DBConnection()
        client = await db.client
        
        agent_result = await client.table('agents').select('*').eq('agent_id', agent_id).eq('account_id', user_id).maybe_single().execute()
        
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_id_obj = AgentId.from_string(agent_id)
        user_id_obj = UserId.from_string(user_id)
        
        version = await version_service.create_version(
            agent_id=agent_id_obj,
            user_id=user_id_obj,
            system_prompt=request.system_prompt,
            configured_mcps=request.configured_mcps,
            custom_mcps=request.custom_mcps,
            agentpress_tools=request.agentpress_tools,
            version_name=request.version_name,
            change_description=request.description
        )
        
        return VersionResponse(**version.to_dict())
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except AgentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        from utils.logger import logger
        logger.error(f"Failed to create version: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create version: {str(e)}")


@router.get("/{version_id}", response_model=VersionResponse)
async def get_version(
    agent_id: str,
    version_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        agent_id_obj = AgentId.from_string(agent_id)
        version_id_obj = VersionId.from_string(version_id)
        user_id_obj = UserId.from_string(user_id)
        
        version = await version_service.get_version(
            agent_id_obj, version_id_obj, user_id_obj
        )
        
        return VersionResponse(**version.to_dict())
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except VersionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch version")


@router.put("/{version_id}/activate")
async def activate_version(
    agent_id: str,
    version_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        from services.supabase import DBConnection
        from utils.logger import logger
        
        db = DBConnection()
        client = await db.client
        
        agent_result = await client.table('agents').select('metadata').eq('agent_id', agent_id).eq('account_id', user_id).maybe_single().execute()
        
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_metadata = agent_result.data.get('metadata', {})
        is_suna_agent = agent_metadata.get('is_suna_default', False)
        restrictions = agent_metadata.get('restrictions', {})
        
        if is_suna_agent:
            logger.warning(f"Version activation attempt on Suna default agent {agent_id} by user {user_id} for version {version_id}")
            logger.info(f"Allowing version activation for Suna agent {agent_id} - monitoring for security compliance")
            
        
        agent_id_obj = AgentId.from_string(agent_id)
        version_id_obj = VersionId.from_string(version_id)
        user_id_obj = UserId.from_string(user_id)
        
        await version_service.activate_version(
            agent_id_obj, version_id_obj, user_id_obj
        )
        
        if is_suna_agent:
            logger.info(f"Successfully activated version {version_id} for Suna agent {agent_id} by user {user_id}")
        
        return {"message": "Version activated successfully"}
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except VersionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidVersionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to activate version")


@router.get("/compare/{version1_id}/{version2_id}", response_model=CompareVersionsResponse)
async def compare_versions(
    agent_id: str,
    version1_id: str,
    version2_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        agent_id_obj = AgentId.from_string(agent_id)
        version1_id_obj = VersionId.from_string(version1_id)
        version2_id_obj = VersionId.from_string(version2_id)
        user_id_obj = UserId.from_string(user_id)
        
        result = await version_service.compare_versions(
            agent_id_obj, version1_id_obj, version2_id_obj, user_id_obj
        )
        
        return CompareVersionsResponse(**result)
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except VersionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to compare versions")


@router.post("/{version_id}/rollback", response_model=VersionResponse)
async def rollback_to_version(
    agent_id: str,
    version_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        agent_id_obj = AgentId.from_string(agent_id)
        version_id_obj = VersionId.from_string(version_id)
        user_id_obj = UserId.from_string(user_id)
        
        new_version = await version_service.rollback_to_version(
            agent_id_obj, version_id_obj, user_id_obj
        )
        
        return VersionResponse(**new_version.to_dict())
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except VersionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to rollback version")


@router.put("/{version_id}/details", response_model=VersionResponse)
async def update_version_details(
    agent_id: str,
    version_id: str,
    request: UpdateVersionDetailsRequest,
    user_id: str = Depends(get_current_user_id_from_jwt),
    version_service: VersionService = Depends(get_version_service)
):
    try:
        agent_id_obj = AgentId.from_string(agent_id)
        version_id_obj = VersionId.from_string(version_id)
        user_id_obj = UserId.from_string(user_id)
        
        updated_version = await version_service.update_version_details(
            agent_id=agent_id_obj,
            version_id=version_id_obj,
            user_id=user_id_obj,
            version_name=request.version_name,
            change_description=request.change_description
        )
        
        return VersionResponse(**updated_version.to_dict())
    except UnauthorizedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except VersionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        from utils.logger import logger
        logger.error(f"Failed to update version details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update version details") 