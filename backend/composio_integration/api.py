"""
FastAPI routes for Composio app integration and authentication testing.

This module provides REST API endpoints for testing Composio integrations,
managing user connections, and handling authentication flows using the new Composio API.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional, List
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger

from .app_service import (
    AuthenticationTestRequest,
    CreateAuthConfigRequest,
    AuthConfigResponse,
    ConnectionRequest,
    MCPServerInfo,
    MCPUrlGenerationRequest,
    MCPUrlResponse,
    test_authentication_flow,
    test_toolkit_authentication_flow,
    create_auth_config,
    initiate_user_connection,
    initiate_connection_with_toolkit,
    wait_for_connection,
    retrieve_mcp_server,
    generate_mcp_url,
    get_mcp_url_for_app,
    composio_app_service,
    ComposioServiceError
)

router = APIRouter(prefix="/composio", tags=["composio"])


# MCP Server Endpoints
@router.get("/mcp/server/{app_key}", response_model=MCPServerInfo)
async def get_mcp_server_info(
    app_key: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> MCPServerInfo:
    """
    Retrieve MCP server information for an app.
    
    Args:
        app_key: The app key (e.g., 'github', 'gmail', 'slack')
        user_id: Current user ID from JWT token
        
    Returns:
        MCPServerInfo: MCP server details including server ID and allowed tools
    """
    try:
        logger.info(f"User {user_id} retrieving MCP server info for app {app_key}")
        return await retrieve_mcp_server(app_key)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error retrieving MCP server for app {app_key}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/mcp/generate-url", response_model=MCPUrlResponse)
async def generate_mcp_server_url(
    mcp_server_id: str,
    connected_account_ids: List[str] = Query(..., description="List of connected account IDs"),
    user_ids: List[str] = Query(..., description="List of user IDs"),
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> MCPUrlResponse:
    """
    Generate MCP server URLs with connected accounts and user IDs.
    
    Args:
        mcp_server_id: The MCP server ID
        connected_account_ids: List of connected account IDs
        user_ids: List of user IDs
        user_id: Current user ID from JWT token
        
    Returns:
        MCPUrlResponse: Generated URLs for different configurations
    """
    try:
        logger.info(f"User {user_id} generating MCP URLs for server {mcp_server_id}")
        return await generate_mcp_url(mcp_server_id, connected_account_ids, user_ids)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error generating MCP URLs for server {mcp_server_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/mcp/app-url", response_model=MCPUrlResponse)
async def get_mcp_url_for_app_endpoint(
    app_key: str,
    connected_account_ids: List[str] = Query(..., description="List of connected account IDs"),
    user_ids: List[str] = Query(..., description="List of user IDs"),
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> MCPUrlResponse:
    """
    Get MCP server URL for an app (combines server retrieval and URL generation).
    
    This is the complete flow: retrieve MCP server info + generate URLs.
    
    Args:
        app_key: The app key (e.g., 'github', 'gmail', 'slack')
        connected_account_ids: List of connected account IDs
        user_ids: List of user IDs
        user_id: Current user ID from JWT token
        
    Returns:
        MCPUrlResponse: Complete MCP URL information with server details
    """
    try:
        logger.info(f"User {user_id} getting MCP URL for app {app_key}")
        return await get_mcp_url_for_app(app_key, connected_account_ids, user_ids)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error getting MCP URL for app {app_key}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Auth Config Endpoints
@router.post("/auth-config", response_model=AuthConfigResponse)
async def create_auth_config_endpoint(
    request: CreateAuthConfigRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> AuthConfigResponse:
    """
    Create an auth config for a toolkit using Composio managed auth.
    
    This eliminates the need to manage hundreds of auth config IDs manually.
    
    Args:
        request: Auth config creation request with toolkit name
        user_id: Current user ID from JWT token
        
    Returns:
        AuthConfigResponse: The created auth config details
    """
    try:
        logger.info(f"User {user_id} creating auth config for toolkit {request.toolkit}")
        return await create_auth_config(request.toolkit, request.auth_type)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error creating auth config for toolkit {request.toolkit}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Connection Endpoints
@router.post("/connect", response_model=ConnectionRequest)
async def connect_to_auth_config(
    auth_config_id: str,
    auth_scheme: str = "OAUTH2",
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> ConnectionRequest:
    """
    Initiate a connection to a Composio auth config.
    
    Args:
        auth_config_id: The auth config ID to connect to
        auth_scheme: The authentication scheme (default: OAUTH2)
        user_id: Current user ID from JWT token
        
    Returns:
        ConnectionRequest: Connection details including redirect URL
    """
    try:
        logger.info(f"User {user_id} initiating connection to auth config {auth_config_id}")
        return await initiate_user_connection(auth_config_id, user_id, auth_scheme)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error connecting to auth config {auth_config_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/connect-toolkit", response_model=ConnectionRequest)
async def connect_to_toolkit(
    toolkit: str,
    auth_scheme: str = "OAUTH2",
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> ConnectionRequest:
    """
    Initiate a connection using toolkit name (creates auth config automatically).
    
    This is much easier than managing hundreds of auth config IDs manually.
    
    Args:
        toolkit: The toolkit/app name (e.g., 'github', 'gmail', 'slack')
        auth_scheme: The authentication scheme (default: OAUTH2)
        user_id: Current user ID from JWT token
        
    Returns:
        ConnectionRequest: Connection details including redirect URL
    """
    try:
        logger.info(f"User {user_id} initiating connection to toolkit {toolkit}")
        return await initiate_connection_with_toolkit(toolkit, user_id, auth_scheme)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error connecting to toolkit {toolkit}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/wait-connection/{connection_request_id}")
async def wait_for_connection_endpoint(
    connection_request_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Wait for a connection to be established.
    
    Args:
        connection_request_id: The connection request ID to wait for
        user_id: Current user ID from JWT token
        
    Returns:
        Dict containing the connected account information
    """
    try:
        logger.info(f"User {user_id} waiting for connection {connection_request_id}")
        return await wait_for_connection(connection_request_id)
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error waiting for connection {connection_request_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Testing Endpoints
@router.post("/test-authentication")
async def test_composio_authentication(
    request: AuthenticationTestRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Test the complete Composio authentication flow using auth config ID.
    
    This endpoint demonstrates the full authentication process:
    1. Initiate connection with auth config
    2. Return connection details and redirect URL
    
    Args:
        request: Authentication test request with auth_config_id and user_id
        user_id: Current user ID from JWT token
        
    Returns:
        Dict containing test results including connection details
    """
    try:
        logger.info(f"User {user_id} testing authentication for auth config {request.auth_config_id}")
        return await test_authentication_flow(
            request.auth_config_id, 
            request.user_id, 
            request.auth_scheme
        )
    except Exception as e:
        logger.error(f"Error in authentication test for user {user_id}: {e}")
        return {
            "test_status": "failed",
            "error": str(e),
            "message": "Authentication flow test failed"
        }


@router.post("/test-toolkit-authentication")
async def test_toolkit_authentication(
    toolkit: str,
    test_user_id: str,
    auth_scheme: str = "OAUTH2",
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Test the complete Composio authentication flow using toolkit name.
    
    This automatically creates an auth config and tests the flow.
    Much easier than managing auth config IDs manually!
    
    Args:
        toolkit: The toolkit/app name (e.g., 'github', 'gmail', 'slack')
        test_user_id: The test user ID for the connection
        auth_scheme: The authentication scheme (default: OAUTH2)
        user_id: Current user ID from JWT token
        
    Returns:
        Dict containing test results including connection details
    """
    try:
        logger.info(f"User {user_id} testing toolkit authentication for {toolkit}")
        return await test_toolkit_authentication_flow(toolkit, test_user_id, auth_scheme)
    except Exception as e:
        logger.error(f"Error in toolkit authentication test for user {user_id}: {e}")
        return {
            "test_status": "failed",
            "error": str(e),
            "message": f"Toolkit authentication flow test failed for {toolkit}"
        }


# User Management Endpoints
@router.get("/connections")
async def get_user_connections_endpoint(
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get all Composio connections for the current user.
    
    Args:
        user_id: Current user ID from JWT token
        
    Returns:
        Dict containing user connections
    """
    try:
        logger.info(f"User {user_id} requesting their connections")
        connections = await composio_app_service.get_user_connections(user_id)
        return {
            "user_id": user_id,
            "connections": connections,
            "count": len(connections)
        }
    except ComposioServiceError as e:
        logger.error(f"Composio service error for user {user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error getting connections for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# Health Check
@router.get("/health")
async def composio_health_check() -> Dict[str, str]:
    """
    Health check endpoint for Composio service.
    
    Returns:
        Dict with service status
    """
    try:
        from .composio_service import get_composio_service
        service = get_composio_service()
        
        if service.is_initialized():
            return {"status": "healthy", "message": "Composio service is running"}
        else:
            # Try to initialize
            service.initialize()
            return {"status": "healthy", "message": "Composio service initialized"}
    except Exception as e:
        logger.error(f"Composio health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Service unavailable: {str(e)}")


# Demo endpoints for quick testing (no auth required)
@router.post("/demo/test-auth")
async def demo_test_authentication(request: AuthenticationTestRequest) -> Dict[str, Any]:
    """
    Demo endpoint for testing authentication without authentication.
    
    This is useful for development and testing purposes.
    
    Args:
        request: Authentication test request
        
    Returns:
        Dict containing test results
    """
    try:
        logger.info(f"Demo authentication test for auth config {request.auth_config_id}")
        return await test_authentication_flow(
            request.auth_config_id, 
            request.user_id, 
            request.auth_scheme
        )
    except Exception as e:
        logger.error(f"Error in demo authentication test: {e}")
        return {
            "test_status": "failed",
            "error": str(e),
            "message": "Demo authentication flow test failed"
        }


@router.post("/demo/test-toolkit")
async def demo_test_toolkit_authentication(
    toolkit: str,
    test_user_id: str,
    auth_scheme: str = "OAUTH2"
) -> Dict[str, Any]:
    """
    Demo endpoint for testing toolkit authentication without authentication.
    
    This automatically creates auth configs - perfect for testing 500+ apps!
    
    Args:
        toolkit: The toolkit/app name
        test_user_id: The test user ID
        auth_scheme: The authentication scheme
        
    Returns:
        Dict containing test results
    """
    try:
        logger.info(f"Demo toolkit authentication test for {toolkit}")
        return await test_toolkit_authentication_flow(toolkit, test_user_id, auth_scheme)
    except Exception as e:
        logger.error(f"Error in demo toolkit authentication test: {e}")
        return {
            "test_status": "failed",
            "error": str(e),
            "message": f"Demo toolkit authentication flow test failed for {toolkit}"
        }


@router.get("/demo/mcp/server/{app_key}")
async def demo_get_mcp_server_info(app_key: str) -> MCPServerInfo:
    """
    Demo endpoint for retrieving MCP server info without authentication.
    
    Args:
        app_key: The app key (e.g., 'github', 'gmail', 'slack')
        
    Returns:
        MCPServerInfo: MCP server details
    """
    try:
        logger.info(f"Demo MCP server info retrieval for app {app_key}")
        return await retrieve_mcp_server(app_key)
    except Exception as e:
        logger.error(f"Error in demo MCP server retrieval: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/demo/mcp/app-url")
async def demo_get_mcp_url_for_app(
    app_key: str,
    connected_account_ids: List[str] = Query(..., description="List of connected account IDs"),
    user_ids: List[str] = Query(..., description="List of user IDs")
) -> MCPUrlResponse:
    """
    Demo endpoint for getting MCP URLs without authentication.
    
    Args:
        app_key: The app key
        connected_account_ids: List of connected account IDs
        user_ids: List of user IDs
        
    Returns:
        MCPUrlResponse: Complete MCP URL information
    """
    try:
        logger.info(f"Demo MCP URL generation for app {app_key}")
        return await get_mcp_url_for_app(app_key, connected_account_ids, user_ids)
    except Exception as e:
        logger.error(f"Error in demo MCP URL generation: {e}")
        raise HTTPException(status_code=400, detail=str(e))
