"""
API for agent default files.
"""

from pathlib import Path
from typing import List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel

from core.utils.auth_utils import require_agent_access, AuthorizedAgentAccess
from core.utils.logger import logger

from .agent_default_files_service import AgentDefaultFilesService
from .validator import UploadedFileValidator

router = APIRouter(prefix="/agent", tags=["agent-default-files"])

service = AgentDefaultFilesService()


class DefaultFileResponse(BaseModel):
    """Response for a single default file (list item)."""
    id: str
    name: str
    size: int
    mime_type: str | None
    updated_at: str


class DefaultFileUploadResponse(BaseModel):
    """Response after uploading a default file."""
    id: str
    name: str


class DefaultFileDeleteResponse(BaseModel):
    """Response after deleting a default file."""
    success: bool = True


@router.get("/{agent_id}/default-files", response_model=List[DefaultFileResponse])
async def list_default_files(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
) -> List[DefaultFileResponse]:
    """List all default files for an agent."""
    try:
        files = await service.list_default_files(agent_id)
        return [DefaultFileResponse(**f) for f in files]
    except Exception as e:
        logger.error(f"Error listing default files for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to list default files")


@router.post("/{agent_id}/default-files", response_model=DefaultFileUploadResponse)
async def upload_default_file(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
    file: UploadFile = File(...),
):
    """Upload a default file for an agent."""
    if not file.filename or not file.filename.strip():
        raise HTTPException(status_code=400, detail="Filename is required")
    if not file.content_type and not file.filename:
        raise HTTPException(status_code=400, detail="File is required")

    try:
        file_id = await service.upload_default_file(
            file=file,
            account_id=auth.agent_data["account_id"],
            agent_id=agent_id,
            user_id=auth.user_id,
        )
        name = UploadedFileValidator.sanitize_filename(Path(file.filename).name)
        return DefaultFileUploadResponse(id=file_id, name=name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error uploading default file for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file")


@router.delete("/{agent_id}/default-files/{file_id}", response_model=DefaultFileDeleteResponse)
async def delete_default_file(
    agent_id: str,
    file_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access),
) -> DefaultFileDeleteResponse:
    """Delete a default file from an agent."""
    success = await service.delete_default_file(file_id, agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return DefaultFileDeleteResponse()
