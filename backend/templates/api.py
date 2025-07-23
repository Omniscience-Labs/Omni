from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt
from .facade import TemplateManager
from .domain.exceptions import (
    TemplateNotFoundError,
    TemplateAccessDeniedError,
    TemplateInstallationError,
    InvalidCredentialError,
    SunaDefaultAgentTemplateError
)

template_manager = None

router = APIRouter()

class CreateTemplateRequest(BaseModel):
    agent_id: str
    make_public: bool = False
    tags: Optional[List[str]] = None


class InstallTemplateRequest(BaseModel):
    template_id: str
    instance_name: Optional[str] = None
    custom_system_prompt: Optional[str] = None
    profile_mappings: Optional[Dict[str, str]] = None
    custom_mcp_configs: Optional[Dict[str, Dict[str, Any]]] = None


class PublishTemplateRequest(BaseModel):
    tags: Optional[List[str]] = None


class TemplateResponse(BaseModel):
    template_id: str
    name: str
    description: Optional[str]
    mcp_requirements: List[Dict[str, Any]]
    agentpress_tools: Dict[str, Any]
    tags: List[str]
    is_public: bool
    download_count: int
    marketplace_published_at: Optional[str]
    created_at: str
    creator_name: Optional[str] = None
    avatar: Optional[str]
    avatar_color: Optional[str]
    is_kortix_team: Optional[bool] = False


class InstallationResponse(BaseModel):
    status: str
    instance_id: Optional[str] = None
    name: Optional[str] = None
    missing_regular_credentials: Optional[List[Dict[str, Any]]] = None
    missing_custom_configs: Optional[List[Dict[str, Any]]] = None
    template: Optional[Dict[str, Any]] = None


@router.post("", response_model=Dict[str, str])
async def create_agent_template(
    request: CreateTemplateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Creating template from agent {request.agent_id} for user {user_id}")
    
    try:
        template_id = await template_manager.create_template_from_agent(
            agent_id=request.agent_id,
            creator_id=user_id,
            make_public=request.make_public,
            tags=request.tags
        )
        
        return {
            "template_id": template_id,
            "message": "Template created successfully"
        }
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidCredentialError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SunaDefaultAgentTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")


@router.post("/{template_id}/publish")
async def publish_template(
    template_id: str,
    request: PublishTemplateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Publishing template {template_id} for user {user_id}")
    
    try:
        success = await template_manager.publish_template(
            template_id=template_id,
            creator_id=user_id,
            tags=request.tags
        )
        
        return {"message": "Template published to marketplace successfully"}
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidCredentialError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SunaDefaultAgentTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error publishing template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to publish template: {str(e)}")


@router.post("/{template_id}/unpublish")
async def unpublish_template(
    template_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Unpublishing template {template_id} for user {user_id}")
    
    try:
        success = await template_manager.unpublish_template(
            template_id=template_id,
            creator_id=user_id
        )
        
        return {"message": "Template unpublished from marketplace successfully"}
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except SunaDefaultAgentTemplateError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error unpublishing template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to unpublish template: {str(e)}")


@router.post("/install", response_model=InstallationResponse)
async def install_template(
    request: InstallTemplateRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Installing template {request.template_id} for user {user_id}")
    
    try:
        result = await template_manager.install_template(
            template_id=request.template_id,
            account_id=user_id,
            instance_name=request.instance_name,
            custom_system_prompt=request.custom_system_prompt,
            profile_mappings=request.profile_mappings,
            custom_mcp_configs=request.custom_mcp_configs
        )
        
        return InstallationResponse(**result)
    except TemplateNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TemplateAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except InvalidCredentialError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TemplateInstallationError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error installing template: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to install template: {str(e)}")


@router.get("/marketplace", response_model=List[TemplateResponse])
async def get_marketplace_templates(
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting marketplace templates for user {user_id}")
    
    try:
        tag_list = None
        if tags:
            tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
        
        templates = await template_manager.get_marketplace_templates(
            limit=limit,
            offset=offset,
            search=search,
            tags=tag_list
        )
        
        return [TemplateResponse(**template) for template in templates]
    except Exception as e:
        logger.error(f"Error getting marketplace templates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get marketplace templates: {str(e)}")


@router.get("/my", response_model=List[TemplateResponse])
async def get_my_templates(
    limit: int = 50,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting user templates for user {user_id}")
    
    try:
        templates = await template_manager.get_user_templates(
            creator_id=user_id,
            limit=limit,
            offset=offset
        )
        
        return [TemplateResponse(**template) for template in templates]
    except Exception as e:
        logger.error(f"Error getting user templates: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user templates: {str(e)}")


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template_details(
    template_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    logger.info(f"Getting template {template_id} details for user {user_id}")
    
    try:
        template = await template_manager.get_template(template_id)
        
        if not template:
            raise TemplateNotFoundError("Template not found")
        
        if not template.is_public and template.creator_id != user_id:
            raise TemplateAccessDeniedError("Access denied to private template")
        
        return TemplateResponse(
            template_id=template.template_id,
            name=template.name,
            description=template.description,
            mcp_requirements=[
                {
                    'qualified_name': req.qualified_name,
                    'display_name': req.display_name,
                    'enabled_tools': req.enabled_tools,
                    'required_config': req.required_config,
                    'custom_type': req.custom_type
                }
                for req in template.mcp_requirements
            ],
            agentpress_tools=template.agentpress_tools,
            tags=template.tags,
            is_public=template.is_public,
            download_count=template.download_count,
            marketplace_published_at=template.marketplace_published_at.isoformat() if template.marketplace_published_at else None,
            created_at=template.created_at.isoformat() if template.created_at else "",
            avatar=template.avatar,
            avatar_color=template.avatar_color
        )
    except (TemplateNotFoundError, TemplateAccessDeniedError) as e:
        if isinstance(e, TemplateNotFoundError):
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting template details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get template details: {str(e)}") 