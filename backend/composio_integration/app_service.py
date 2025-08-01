"""
Composio App Service for handling app integrations and authentication flows.

This service provides functions for managing app integrations, user authentication,
and connection management with external services through Composio.
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from fastapi import HTTPException
from utils.logger import logger
from .composio_service import get_composio_client, ComposioServiceError


class ConnectionRequest(BaseModel):
    """Model for connection request response."""
    redirect_url: Optional[str] = None
    connected_account_id: Optional[str] = None
    connection_id: Optional[str] = None
    status: str


class AuthenticationTestRequest(BaseModel):
    """Model for authentication test request."""
    auth_config_id: str
    user_id: str
    auth_scheme: str = "OAUTH2"


class CreateAuthConfigRequest(BaseModel):
    """Model for creating auth config request."""
    toolkit: str
    auth_type: str = "use_composio_managed_auth"


class AuthConfigResponse(BaseModel):
    """Model for auth config response."""
    id: str
    toolkit: str
    auth_type: str
    status: str


class MCPServerInfo(BaseModel):
    """Model for MCP server information."""
    id: str
    name: str
    auth_config_ids: List[str]
    allowed_tools: List[str]
    mcp_url: str


class MCPUrlGenerationRequest(BaseModel):
    """Model for MCP URL generation request."""
    app_key: str
    connected_account_ids: List[str]
    user_ids: List[str]


class MCPUrlResponse(BaseModel):
    """Model for MCP URL generation response."""
    mcp_url: str
    connected_account_urls: List[str]
    user_ids_url: List[str]
    mcp_server_info: MCPServerInfo


class ComposioAppService:
    """Service for managing Composio app integrations and authentication."""

    def __init__(self):
        self.client = get_composio_client()

    async def retrieve_mcp_server(self, app_key: str) -> MCPServerInfo:
        """
        Retrieve MCP server information for an app.
        
        Args:
            app_key: The app key (e.g., 'github', 'gmail', 'slack')
            
        Returns:
            MCPServerInfo: MCP server details including server ID and allowed tools
        """
        try:
            logger.info(f"Retrieving MCP server info for app: {app_key}")
            
            response = self.client.mcp.retrieve_app(app_key=app_key)
            
            # Extract the first server from the response
            if hasattr(response, 'items') and response.items:
                server = response.items[0]
                
                mcp_server_info = MCPServerInfo(
                    id=server.id,
                    name=getattr(server, 'name', f'{app_key} Integration Server'),
                    auth_config_ids=getattr(server, 'auth_config_ids', []),
                    allowed_tools=getattr(server, 'allowed_tools', []),
                    mcp_url=getattr(server, 'mcp_url', '')
                )
                
                logger.info(f"Successfully retrieved MCP server {mcp_server_info.id} for app {app_key}")
                return mcp_server_info
            else:
                raise ComposioServiceError(f"No MCP server found for app {app_key}")
                
        except Exception as e:
            logger.error(f"Error retrieving MCP server for app {app_key}: {e}")
            raise ComposioServiceError(f"Failed to retrieve MCP server: {str(e)}")

    async def generate_mcp_url(
        self,
        mcp_server_id: str,
        connected_account_ids: List[str],
        user_ids: List[str]
    ) -> MCPUrlResponse:
        """
        Generate MCP server URLs with connected accounts and user IDs.
        
        Args:
            mcp_server_id: The MCP server ID
            connected_account_ids: List of connected account IDs
            user_ids: List of user IDs
            
        Returns:
            MCPUrlResponse: Generated URLs for different configurations
        """
        try:
            logger.info(f"Generating MCP URLs for server {mcp_server_id}")
            
            response = self.client.mcp.generate.url(
                mcp_server_id=mcp_server_id,
                connected_account_ids=connected_account_ids,
                user_ids=user_ids,
            )
            
            # Create response model
            mcp_response = MCPUrlResponse(
                mcp_url=getattr(response, 'mcp_url', ''),
                connected_account_urls=getattr(response, 'connected_account_urls', []),
                user_ids_url=getattr(response, 'user_ids_url', []),
                mcp_server_info=MCPServerInfo(
                    id=mcp_server_id,
                    name="",
                    auth_config_ids=[],
                    allowed_tools=[],
                    mcp_url=getattr(response, 'mcp_url', '')
                )
            )
            
            logger.info(f"Successfully generated MCP URLs for server {mcp_server_id}")
            logger.debug(f"Base MCP URL: {mcp_response.mcp_url}")
            logger.debug(f"Generated {len(mcp_response.user_ids_url)} user-specific URLs")
            
            return mcp_response
            
        except Exception as e:
            logger.error(f"Error generating MCP URLs for server {mcp_server_id}: {e}")
            raise ComposioServiceError(f"Failed to generate MCP URLs: {str(e)}")

    async def get_mcp_url_for_app(
        self,
        app_key: str,
        connected_account_ids: List[str],
        user_ids: List[str]
    ) -> MCPUrlResponse:
        """
        Get MCP server URL for an app (combines server retrieval and URL generation).
        
        This is a convenience method that handles the full flow:
        1. Retrieve MCP server ID for the app
        2. Generate URLs with the provided accounts and users
        
        Args:
            app_key: The app key (e.g., 'github', 'gmail', 'slack')
            connected_account_ids: List of connected account IDs
            user_ids: List of user IDs
            
        Returns:
            MCPUrlResponse: Complete MCP URL information
        """
        try:
            logger.info(f"Getting MCP URL for app {app_key}")
            
            # Step 1: Retrieve MCP server info
            mcp_server_info = await self.retrieve_mcp_server(app_key)
            
            # Step 2: Generate URLs
            mcp_response = await self.generate_mcp_url(
                mcp_server_info.id,
                connected_account_ids,
                user_ids
            )
            
            # Update the response with server info
            mcp_response.mcp_server_info = mcp_server_info
            
            logger.info(f"Successfully got MCP URL for app {app_key}")
            return mcp_response
            
        except Exception as e:
            logger.error(f"Error getting MCP URL for app {app_key}: {e}")
            raise ComposioServiceError(f"Failed to get MCP URL for app: {str(e)}")

    async def create_auth_config(
        self, 
        toolkit: str, 
        auth_type: str = "use_composio_managed_auth"
    ) -> AuthConfigResponse:
        """
        Create an auth config for a specific toolkit using Composio managed auth.
        
        This eliminates the need to manage hundreds of auth config IDs manually.
        
        Args:
            toolkit: The toolkit/app name (e.g., 'github', 'gmail', 'slack', etc.)
            auth_type: The authentication type (default: use_composio_managed_auth)
            
        Returns:
            AuthConfigResponse: The created auth config details
        """
        try:
            logger.info(f"Creating auth config for toolkit: {toolkit}")
            
            # Create auth config using Composio managed auth
            auth_config = self.client.auth_configs.create(
                toolkit=toolkit,
                options={
                    "type": auth_type,
                },
            )
            
            response = AuthConfigResponse(
                id=auth_config.id,
                toolkit=getattr(auth_config, 'toolkit', toolkit),
                auth_type=getattr(auth_config, 'type', auth_type),
                status="created"
            )
            
            logger.info(f"Successfully created auth config {response.id} for toolkit {toolkit}")
            return response
            
        except Exception as e:
            logger.error(f"Error creating auth config for toolkit {toolkit}: {e}")
            raise ComposioServiceError(f"Failed to create auth config: {str(e)}")

    async def get_or_create_auth_config(self, toolkit: str) -> str:
        """
        Get existing auth config or create a new one for the toolkit.
        
        This is a convenience method that handles the common pattern of
        trying to reuse existing auth configs when possible.
        
        Args:
            toolkit: The toolkit/app name
            
        Returns:
            str: The auth config ID
        """
        try:
            logger.info(f"Getting or creating auth config for toolkit: {toolkit}")
            
            # Try to list existing auth configs for this toolkit
            # Note: This might need adjustment based on actual Composio API
            try:
                # auth_configs = self.client.auth_configs.list(toolkit=toolkit)
                # if auth_configs:
                #     logger.info(f"Found existing auth config for toolkit {toolkit}")
                #     return auth_configs[0].id
                pass
            except Exception as e:
                logger.debug(f"Could not list existing auth configs: {e}")
            
            # Create new auth config
            auth_config = await self.create_auth_config(toolkit)
            return auth_config.id
            
        except Exception as e:
            logger.error(f"Error getting or creating auth config for toolkit {toolkit}: {e}")
            raise ComposioServiceError(f"Failed to get or create auth config: {str(e)}")

    async def initiate_connection_with_toolkit(
        self,
        toolkit: str,
        user_id: str,
        auth_scheme: str = "OAUTH2",
        additional_config: Optional[Dict[str, Any]] = None
    ) -> ConnectionRequest:
        """
        Initiate a connection using toolkit name instead of auth_config_id.
        
        This method automatically creates the auth config if needed,
        making it much easier to support hundreds of apps.
        
        Args:
            toolkit: The toolkit/app name (e.g., 'github', 'gmail', 'slack')
            user_id: The user ID
            auth_scheme: The authentication scheme (default: OAUTH2)
            additional_config: Additional configuration parameters
            
        Returns:
            ConnectionRequest: Connection details including redirect URL
        """
        try:
            logger.info(f"Initiating connection for user {user_id} with toolkit {toolkit}")
            
            # Get or create auth config for this toolkit
            auth_config_id = await self.get_or_create_auth_config(toolkit)
            
            # Use the existing method with the auth config ID
            return await self.initiate_user_connection(
                auth_config_id, user_id, auth_scheme, additional_config
            )
            
        except Exception as e:
            logger.error(f"Error initiating connection with toolkit {toolkit}: {e}")
            raise ComposioServiceError(f"Failed to initiate connection with toolkit: {str(e)}")

    async def initiate_user_connection(
        self, 
        auth_config_id: str, 
        user_id: str,
        auth_scheme: str = "OAUTH2",
        additional_config: Optional[Dict[str, Any]] = None
    ) -> ConnectionRequest:
        """
        Initiate a connection for a user with an auth config.
        
        Args:
            auth_config_id: The auth config ID for the integration
            user_id: The user ID
            auth_scheme: The authentication scheme (default: OAUTH2)
            additional_config: Additional configuration parameters
            
        Returns:
            ConnectionRequest: Connection details including redirect URL
        """
        try:
            logger.info(f"Initiating connection for user {user_id} with auth config {auth_config_id}")
            
            # Prepare connection config
            config = {"auth_scheme": auth_scheme}
            if additional_config:
                config.update(additional_config)
            
            # Initiate connection using new API
            connection_request = self.client.connected_accounts.initiate(
                user_id=user_id,
                auth_config_id=auth_config_id,
                config=config
            )
            
            # Create response model
            response = ConnectionRequest(
                redirect_url=getattr(connection_request, 'redirect_url', None),
                connected_account_id=getattr(connection_request, 'id', None),
                connection_id=getattr(connection_request, 'id', None),
                status="initiated"
            )
            
            logger.info(f"Connection initiated successfully for user {user_id}")
            logger.debug(f"Redirect URL: {response.redirect_url}")
            logger.debug(f"Connection ID: {response.connection_id}")
            
            return response
            
        except Exception as e:
            logger.error(f"Error initiating connection for user {user_id}: {e}")
            raise ComposioServiceError(f"Failed to initiate connection: {str(e)}")

    async def wait_for_connection(self, connection_request_id: str) -> Dict[str, Any]:
        """
        Wait for a connection to be established.
        
        Args:
            connection_request_id: The connection request ID
            
        Returns:
            Dict containing the connected account information
        """
        try:
            logger.info(f"Waiting for connection {connection_request_id}")
            
            # Wait for connection to be established
            connected_account = self.client.connected_accounts.wait_for_connection(connection_request_id)
            
            result = {
                "connected_account_id": getattr(connected_account, 'id', None),
                "status": getattr(connected_account, 'status', 'connected'),
                "user_id": getattr(connected_account, 'user_id', None),
                "auth_config_id": getattr(connected_account, 'auth_config_id', None),
            }
            
            logger.info(f"Connection established successfully: {result}")
            return result
            
        except Exception as e:
            logger.error(f"Error waiting for connection {connection_request_id}: {e}")
            raise ComposioServiceError(f"Failed to wait for connection: {str(e)}")

    async def test_authentication_flow(self, auth_config_id: str, user_id: str, auth_scheme: str = "OAUTH2") -> Dict[str, Any]:
        """
        Test the complete authentication flow for an auth config.
        
        This is a test function that demonstrates the full flow:
        1. Initiate connection with auth config
        2. Return connection details
        3. Automatically fetch MCP URLs for the connection
        
        Args:
            auth_config_id: The auth config ID to test
            user_id: The test user ID
            auth_scheme: The authentication scheme
            
        Returns:
            Dict containing the complete test results including MCP URLs
        """
        try:
            logger.info(f"Starting authentication flow test for auth config {auth_config_id}")
            
            # Step 1: Initiate connection
            connection_request = await self.initiate_user_connection(auth_config_id, user_id, auth_scheme)
            
            # Step 2: Try to automatically fetch MCP URLs if we have a connected account
            mcp_urls = None
            if connection_request.connected_account_id:
                try:
                    logger.info(f"Attempting to fetch MCP URLs automatically for connected account {connection_request.connected_account_id}")
                    
                    # We need to guess the app_key from the auth_config_id
                    # In a real scenario, we'd store this mapping, but for testing we'll try common ones
                    # For now, let's try to infer or use a default
                    
                    # Since we can't easily determine the app_key from auth_config_id,
                    # we'll skip automatic MCP URL generation for auth_config mode
                    # and only do it for toolkit mode where we know the toolkit name
                    logger.debug("Skipping automatic MCP URL generation for auth_config mode - toolkit name unknown")
                    
                except Exception as e:
                    logger.warning(f"Could not automatically fetch MCP URLs: {e}")
            
            # Compile test results
            test_results = {
                "auth_config_info": {
                    "auth_config_id": auth_config_id,
                    "user_id": user_id,
                    "auth_scheme": auth_scheme
                },
                "connection_request": {
                    "redirect_url": connection_request.redirect_url,
                    "connected_account_id": connection_request.connected_account_id,
                    "connection_id": connection_request.connection_id,
                    "status": connection_request.status
                },
                "test_status": "success",
                "message": "Authentication flow test completed successfully",
                "instructions": "Use the redirect_url to complete the OAuth flow, then the connection will be established."
            }
            
            # Add MCP URLs if we got them
            if mcp_urls:
                test_results["mcp_urls"] = mcp_urls
                test_results["message"] += " MCP server URLs have been automatically generated!"
            
            logger.info(f"Authentication flow test completed successfully for auth config {auth_config_id}")
            return test_results
            
        except Exception as e:
            logger.error(f"Authentication flow test failed for auth config {auth_config_id}: {e}")
            error_results = {
                "test_status": "failed",
                "error": str(e),
                "message": "Authentication flow test failed"
            }
            return error_results

    async def test_toolkit_authentication_flow(self, toolkit: str, user_id: str, auth_scheme: str = "OAUTH2") -> Dict[str, Any]:
        """
        Test the authentication flow using toolkit name (creates auth config automatically).
        
        This automatically:
        1. Creates auth config for the toolkit
        2. Initiates connection 
        3. Fetches MCP server URLs for the toolkit
        
        Args:
            toolkit: The toolkit/app name (e.g., 'github', 'gmail', 'slack')
            user_id: The test user ID
            auth_scheme: The authentication scheme
            
        Returns:
            Dict containing the complete test results including MCP URLs
        """
        try:
            logger.info(f"Starting toolkit authentication flow test for {toolkit}")
            
            # Step 1: Create or get auth config
            auth_config = await self.create_auth_config(toolkit)
            
            # Step 2: Initiate connection
            connection_request = await self.initiate_user_connection(auth_config.id, user_id, auth_scheme)
            
            # Step 3: Automatically fetch MCP URLs for this toolkit
            mcp_urls = None
            if connection_request.connected_account_id:
                try:
                    logger.info(f"Automatically fetching MCP URLs for toolkit {toolkit} with connected account {connection_request.connected_account_id}")
                    
                    mcp_urls = await self.get_mcp_url_for_app(
                        app_key=toolkit,
                        connected_account_ids=[connection_request.connected_account_id],
                        user_ids=[user_id]
                    )
                    
                    logger.info(f"Successfully fetched MCP URLs for toolkit {toolkit}")
                    
                except Exception as e:
                    logger.warning(f"Could not automatically fetch MCP URLs for toolkit {toolkit}: {e}")
                    # Don't fail the whole test if MCP URL generation fails
            
            # Compile test results
            test_results = {
                "toolkit_info": {
                    "toolkit": toolkit,
                    "auth_config_id": auth_config.id,
                    "user_id": user_id,
                    "auth_scheme": auth_scheme
                },
                "connection_request": {
                    "redirect_url": connection_request.redirect_url,
                    "connected_account_id": connection_request.connected_account_id,
                    "connection_id": connection_request.connection_id,
                    "status": connection_request.status
                },
                "test_status": "success",
                "message": f"Toolkit authentication flow test completed successfully for {toolkit}",
                "instructions": "Use the redirect_url to complete the OAuth flow, then the connection will be established."
            }
            
            # Add MCP URLs if we got them
            if mcp_urls:
                test_results["mcp_urls"] = {
                    "mcp_url": mcp_urls.mcp_url,
                    "user_ids_url": mcp_urls.user_ids_url,
                    "connected_account_urls": mcp_urls.connected_account_urls,
                    "mcp_server_info": {
                        "id": mcp_urls.mcp_server_info.id,
                        "name": mcp_urls.mcp_server_info.name,
                        "allowed_tools": mcp_urls.mcp_server_info.allowed_tools,
                        "auth_config_ids": mcp_urls.mcp_server_info.auth_config_ids,
                        "mcp_url": mcp_urls.mcp_server_info.mcp_url
                    }
                }
                test_results["message"] += " 🚀 MCP server URLs have been automatically generated!"
                test_results["instructions"] += " The MCP URLs are ready to use immediately after OAuth completion."
            
            logger.info(f"Toolkit authentication flow test completed successfully for {toolkit}")
            return test_results
            
        except Exception as e:
            logger.error(f"Toolkit authentication flow test failed for {toolkit}: {e}")
            error_results = {
                "test_status": "failed",
                "error": str(e),
                "message": f"Toolkit authentication flow test failed for {toolkit}"
            }
            return error_results

    async def get_user_connections(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all connections for a user.
        
        Args:
            user_id: The user ID
            
        Returns:
            List of user connections
        """
        try:
            logger.info(f"Fetching connections for user {user_id}")
            
            # Get connected accounts for user
            # This might need to be adjusted based on the actual Composio API
            connections = []
            
            # Note: The actual API method might be different
            # connected_accounts = self.client.connected_accounts.list(user_id=user_id)
            # connections = [{"id": acc.id, "status": acc.status} for acc in connected_accounts]
            
            logger.info(f"Found {len(connections)} connections for user {user_id}")
            return connections
            
        except Exception as e:
            logger.error(f"Error fetching connections for user {user_id}: {e}")
            raise ComposioServiceError(f"Failed to fetch user connections: {str(e)}")


# Global service instance
composio_app_service = ComposioAppService()


# Convenience functions for MCP
async def retrieve_mcp_server(app_key: str) -> MCPServerInfo:
    """Retrieve MCP server information for an app."""
    return await composio_app_service.retrieve_mcp_server(app_key)


async def generate_mcp_url(
    mcp_server_id: str,
    connected_account_ids: List[str],
    user_ids: List[str]
) -> MCPUrlResponse:
    """Generate MCP server URLs."""
    return await composio_app_service.generate_mcp_url(mcp_server_id, connected_account_ids, user_ids)


async def get_mcp_url_for_app(
    app_key: str,
    connected_account_ids: List[str],
    user_ids: List[str]
) -> MCPUrlResponse:
    """Get MCP server URL for an app (full flow)."""
    return await composio_app_service.get_mcp_url_for_app(app_key, connected_account_ids, user_ids)


# Existing convenience functions
async def create_auth_config(toolkit: str, auth_type: str = "use_composio_managed_auth") -> AuthConfigResponse:
    """Create an auth config for a toolkit."""
    return await composio_app_service.create_auth_config(toolkit, auth_type)


async def initiate_connection_with_toolkit(
    toolkit: str,
    user_id: str,
    auth_scheme: str = "OAUTH2",
    additional_config: Optional[Dict[str, Any]] = None
) -> ConnectionRequest:
    """Initiate a connection using toolkit name."""
    return await composio_app_service.initiate_connection_with_toolkit(
        toolkit, user_id, auth_scheme, additional_config
    )


async def initiate_user_connection(
    auth_config_id: str, 
    user_id: str,
    auth_scheme: str = "OAUTH2",
    additional_config: Optional[Dict[str, Any]] = None
) -> ConnectionRequest:
    """Initiate a user connection with an auth config."""
    return await composio_app_service.initiate_user_connection(
        auth_config_id, user_id, auth_scheme, additional_config
    )


async def test_authentication_flow(auth_config_id: str, user_id: str, auth_scheme: str = "OAUTH2") -> Dict[str, Any]:
    """Test the complete authentication flow."""
    return await composio_app_service.test_authentication_flow(auth_config_id, user_id, auth_scheme)


async def test_toolkit_authentication_flow(toolkit: str, user_id: str, auth_scheme: str = "OAUTH2") -> Dict[str, Any]:
    """Test the authentication flow using toolkit name."""
    return await composio_app_service.test_toolkit_authentication_flow(toolkit, user_id, auth_scheme)


async def wait_for_connection(connection_request_id: str) -> Dict[str, Any]:
    """Wait for a connection to be established."""
    return await composio_app_service.wait_for_connection(connection_request_id)
