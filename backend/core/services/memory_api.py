"""
Memory API endpoints for managing AI memories.

This module provides FastAPI endpoints for memory operations including
adding, searching, and managing memories associated with user conversations.
"""

from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.memory import memory_service
from core.utils.logger import logger
from core.utils.config import config, EnvMode

router = APIRouter(prefix="/memory", tags=["memory"])


async def get_memory_user_id(request: Request) -> str:
    """
    Resolve user_id for memory endpoints.
    In local mode, accepts X-Test-User-Id header to bypass JWT for testing.
    Otherwise requires valid JWT.
    """
    if config.ENV_MODE == EnvMode.LOCAL:
        test_user_id = request.headers.get("X-Test-User-Id", "").strip()
        if test_user_id:
            logger.debug(f"Using X-Test-User-Id for memory API (local only): {test_user_id[:8]}...")
            return test_user_id
    return await verify_and_get_user_id_from_jwt(request)


class AddMemoryRequest(BaseModel):
    """Request model for adding a memory."""

    text: str = Field(..., description="Memory content to store")
    thread_id: Optional[str] = Field(
        None, description="Thread identifier for conversation context"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Additional metadata"
    )


class SearchMemoriesRequest(BaseModel):
    """Request model for searching memories."""

    query: str = Field(..., description="Search query text")
    thread_id: Optional[str] = Field(
        None, description="Optional thread identifier to scope search"
    )
    limit: int = Field(
        10,
        description="Maximum number of memories to return",
        ge=1,
        le=100,
    )
    version: str = Field(
        "v2",
        description="API version to use (v1 or v2)",
    )
    filters: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional filters for v2 API",
    )


class AddMemoryResponse(BaseModel):
    """Response model for adding a memory."""

    success: bool
    message: str


class SearchMemoriesResponse(BaseModel):
    """Response model for memory search."""

    memories: List[Dict[str, Any]]
    count: int


class DeleteMemoryResponse(BaseModel):
    """Response model for memory deletion."""

    success: bool
    message: str


class HealthResponse(BaseModel):
    """Response model for service health check."""

    available: bool
    message: str


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the memory service is available."""
    try:
        available = memory_service.is_available()
        message = (
            "Memory service is available"
            if available
            else "Memory service is not configured"
        )
        return HealthResponse(available=available, message=message)
    except Exception as e:
        logger.error(f"Memory service health check failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Memory service health check failed",
        )


@router.post("/add", response_model=AddMemoryResponse)
async def add_memory(
    request: AddMemoryRequest,
    user_id: str = Depends(get_memory_user_id),
):
    """
    Add a memory for the current user.

    Memories can be optionally associated with a specific thread.
    """
    try:
        if not memory_service.is_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Memory service is not available",
            )
        success = await memory_service.add_memory(
            content=request.text,
            user_id=user_id,
            thread_id=request.thread_id,
            metadata=request.metadata,
        )
        if success:
            return AddMemoryResponse(
                success=True,
                message="Memory added successfully",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add memory",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding memory: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while adding the memory",
        )


@router.post("/search", response_model=SearchMemoriesResponse)
async def search_memories(
    request: SearchMemoriesRequest,
    user_id: str = Depends(get_memory_user_id),
):
    """
    Search memories for the current user.

    Results can be optionally filtered by thread ID.
    """
    try:
        if not memory_service.is_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Memory service is not available",
            )
        memories = await memory_service.search_memories(
            query=request.query,
            user_id=user_id,
            thread_id=request.thread_id,
            limit=request.limit,
            version=request.version,
            filters=request.filters,
        )
        return SearchMemoriesResponse(memories=memories, count=len(memories))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching memories: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while searching memories",
        )


@router.get("/thread/{thread_id}", response_model=SearchMemoriesResponse)
async def get_thread_memories(
    thread_id: str,
    limit: int = 50,
    user_id: str = Depends(get_memory_user_id),
):
    """
    Get all memories for a specific thread.
    """
    try:
        if not memory_service.is_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Memory service is not available",
            )
        memories = await memory_service.get_thread_memories(
            user_id=user_id,
            thread_id=thread_id,
            limit=min(limit, 100),
        )
        return SearchMemoriesResponse(memories=memories, count=len(memories))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting thread memories: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while retrieving thread memories",
        )


@router.delete("/memory/{memory_id}", response_model=DeleteMemoryResponse)
async def delete_memory(
    memory_id: str,
    user_id: str = Depends(get_memory_user_id),
):
    """
    Delete a specific memory.
    """
    try:
        if not memory_service.is_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Memory service is not available",
            )
        success = await memory_service.delete_memory(
            memory_id=memory_id,
            user_id=user_id,
        )
        if success:
            return DeleteMemoryResponse(
                success=True,
                message="Memory deleted successfully",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found or could not be deleted",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting memory: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while deleting the memory",
        )


@router.delete("/thread/{thread_id}", response_model=DeleteMemoryResponse)
async def clear_thread_memories(
    thread_id: str,
    user_id: str = Depends(get_memory_user_id),
):
    """
    Clear all memories for a specific thread.

    Use with caution as this operation cannot be undone.
    """
    try:
        if not memory_service.is_available():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Memory service is not available",
            )
        success = await memory_service.clear_thread_memories(
            user_id=user_id,
            thread_id=thread_id,
        )
        if success:
            return DeleteMemoryResponse(
                success=True,
                message="Thread memories cleared successfully",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear thread memories",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing thread memories: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while clearing thread memories",
        )
