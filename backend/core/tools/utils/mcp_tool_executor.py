import json
import asyncio
import httpx
import uuid
from typing import Dict, Any, Optional
from core.agentpress.tool import ToolResult
from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamablehttp_client
from core.mcp_module import mcp_service, ToolExecutionResult
from core.utils.logger import logger


class MCPToolExecutor:
    def __init__(self, custom_tools: Dict[str, Dict[str, Any]], tool_wrapper=None):
        self.mcp_manager = mcp_service
        self.custom_tools = custom_tools
        self.tool_wrapper = tool_wrapper
        # Track the current request_id for cancellation purposes
        self._current_request_id: Optional[str] = None
        self._current_server_url: Optional[str] = None
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        logger.debug(f"Executing MCP tool {tool_name} with arguments {arguments}")

        try:
            if tool_name in self.custom_tools:
                return await self._execute_custom_tool(tool_name, arguments)
            else:
                return await self._execute_standard_tool(tool_name, arguments)
        except Exception as e:
            logger.error(f"Error executing MCP tool {tool_name}: {str(e)}")
            return self._create_error_result(f"Error executing tool: {str(e)}")
    
    async def _execute_standard_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        result = await self.mcp_manager.execute_tool(tool_name, arguments)
        
        # Handle ToolExecutionResult dataclass from mcp_service
        if isinstance(result, ToolExecutionResult):
            if result.success:
                return self._create_success_result(result.result)
            else:
                error_msg = result.error or "Tool execution failed"
                return self._create_error_result(error_msg)
        
        # Legacy dict handling
        if isinstance(result, dict):
            if result.get('isError', False):
                return self._create_error_result(result.get('content', 'Tool execution failed'))
            else:
                return self._create_success_result(result.get('content', result))
        else:
            return self._create_success_result(result)
    
    async def _execute_custom_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        tool_info = self.custom_tools[tool_name]
        custom_type = tool_info['custom_type']
        
        if custom_type == 'composio':
            custom_config = tool_info['custom_config']
            profile_id = custom_config.get('profile_id')
            
            if not profile_id:
                return self._create_error_result("Missing profile_id for Composio tool")
            
            try:
                from core.composio_integration.composio_profile_service import ComposioProfileService
                from core.services.supabase import DBConnection
                
                db = DBConnection()
                profile_service = ComposioProfileService(db)
                mcp_url = await profile_service.get_mcp_url_for_runtime(profile_id)
                modified_tool_info = tool_info.copy()
                modified_tool_info['custom_config'] = {
                    **custom_config,
                    'url': mcp_url
                }
                return await self._execute_http_tool(tool_name, arguments, modified_tool_info)
                
            except Exception as e:
                logger.error(f"Failed to resolve Composio profile {profile_id}: {str(e)}")
                return self._create_error_result(f"Failed to resolve Composio profile: {str(e)}")
                
        elif custom_type == 'pipedream':
            return await self._execute_pipedream_tool(tool_name, arguments, tool_info)
        elif custom_type == 'sse':
            return await self._execute_sse_tool(tool_name, arguments, tool_info)
        elif custom_type == 'http':
            return await self._execute_http_tool(tool_name, arguments, tool_info)
        elif custom_type == 'json':
            return await self._execute_json_tool(tool_name, arguments, tool_info)
        else:
            return self._create_error_result(f"Unsupported custom MCP type: {custom_type}")
    
    async def _execute_pipedream_tool(self, tool_name: str, arguments: Dict[str, Any], tool_info: Dict[str, Any]) -> ToolResult:
        custom_config = tool_info['custom_config']
        original_tool_name = tool_info['original_name']
        
        external_user_id = await self._resolve_external_user_id(custom_config)
        if not external_user_id:
            return self._create_error_result("No external_user_id available")
        
        app_slug = custom_config.get('app_slug')
        oauth_app_id = custom_config.get('oauth_app_id')
        
        try:
            import os
            from pipedream import connection_service
            
            access_token = await connection_service._ensure_access_token()
            
            project_id = os.getenv("PIPEDREAM_PROJECT_ID")
            environment = os.getenv("PIPEDREAM_X_PD_ENVIRONMENT", "development")
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "x-pd-project-id": project_id,
                "x-pd-environment": environment,
                "x-pd-external-user-id": external_user_id,
                "x-pd-app-slug": app_slug,
            }
            
            if hasattr(connection_service, 'rate_limit_token') and connection_service.rate_limit_token:
                headers["x-pd-rate-limit"] = connection_service.rate_limit_token
            
            if oauth_app_id:
                headers["x-pd-oauth-app-id"] = oauth_app_id
            
            url = "https://remote.mcp.pipedream.net"
            
            async with asyncio.timeout(30):
                async with streamablehttp_client(url, headers=headers) as (read_stream, write_stream, _):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        result = await session.call_tool(original_tool_name, arguments)
                        return self._create_success_result(self._extract_content(result))
                        
        except Exception as e:
            logger.error(f"Error executing Pipedream MCP tool: {str(e)}")
            return self._create_error_result(f"Error executing Pipedream tool: {str(e)}")
    
    async def _execute_sse_tool(self, tool_name: str, arguments: Dict[str, Any], tool_info: Dict[str, Any]) -> ToolResult:
        custom_config = tool_info['custom_config']
        original_tool_name = tool_info['original_name']
        
        url = custom_config['url']
        headers = custom_config.get('headers', {})
        
        # Check if this server supports our cancellation protocol
        # Only inject _request_id for servers we control to maintain backward compatibility
        supports_cancellation = self._server_supports_cancellation(url, custom_config)
        
        request_id = None
        call_arguments = arguments
        
        if supports_cancellation:
            # Generate a unique request ID for this specific tool call
            request_id = str(uuid.uuid4())
            self._current_request_id = request_id
            self._current_server_url = url
            
            # Inject request_id into arguments so server can track it
            call_arguments = {
                **arguments,
                '_request_id': request_id
            }
        
        try:
            async with asyncio.timeout(360):  # 6 minutes
                try:
                    async with sse_client(url, headers=headers) as (read, write):
                        async with ClientSession(read, write) as session:
                            await session.initialize()
                            result = await session.call_tool(original_tool_name, call_arguments)
                            content = self._extract_content(result)
                            return self._parse_tool_response(content)
                            
                except TypeError as e:
                    if "unexpected keyword argument" in str(e):
                        async with sse_client(url) as (read, write):
                            async with ClientSession(read, write) as session:
                                await session.initialize()
                                result = await session.call_tool(original_tool_name, call_arguments)
                                content = self._extract_content(result)
                                return self._parse_tool_response(content)
                    else:
                        raise
        
        except asyncio.CancelledError:
            # User cancelled the operation (clicked Stop)
            logger.warning(f"SSE MCP tool {tool_name} was cancelled by user")
            # Try to cancel this specific job on the server (only if supported)
            if supports_cancellation and request_id:
                await self._cancel_server_job_by_request_id(url, request_id)
            # Re-raise to propagate cancellation
            raise
        
        except asyncio.TimeoutError:
            logger.error(f"SSE MCP tool {tool_name} timed out after 360 seconds")
            # Try to cancel this specific job on timeout (only if supported)
            if supports_cancellation and request_id:
                await self._cancel_server_job_by_request_id(url, request_id)
            return self._create_error_result(
                f"Tool execution timed out after 6 minutes. The operation may still be running on the server."
            )
        except Exception as e:
            logger.error(f"Error executing SSE MCP tool {tool_name}: {str(e)}")
            return self._create_error_result(f"Error executing SSE tool: {str(e)}")
        finally:
            # Clear tracking after execution completes
            self._current_request_id = None
            self._current_server_url = None
    
    async def _execute_http_tool(self, tool_name: str, arguments: Dict[str, Any], tool_info: Dict[str, Any]) -> ToolResult:
        custom_config = tool_info['custom_config']
        original_tool_name = tool_info['original_name']
        
        url = custom_config['url']
        
        # Check if this server supports our cancellation protocol
        # Only inject _request_id for servers we control to maintain backward compatibility
        supports_cancellation = self._server_supports_cancellation(url, custom_config)
        
        request_id = None
        call_arguments = arguments
        
        if supports_cancellation:
            # Generate a unique request ID for this specific tool call
            # This allows us to cancel just this job if the user clicks Stop
            request_id = str(uuid.uuid4())
            self._current_request_id = request_id
            self._current_server_url = url
            
            # Inject request_id into arguments so server can track it
            call_arguments = {
                **arguments,
                '_request_id': request_id
            }
        
        try:
            async with asyncio.timeout(360):  # 6 minutes - aligned with server timeout
                async with streamablehttp_client(url) as (read, write, _):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        result = await session.call_tool(original_tool_name, call_arguments)
                        content = self._extract_content(result)
                        # Parse response to detect tool-level errors
                        return self._parse_tool_response(content)
        
        except asyncio.CancelledError:
            # User cancelled the operation (clicked Stop)
            logger.warning(f"HTTP MCP tool {tool_name} was cancelled by user")
            # Try to cancel this specific job on the server (only if supported)
            if supports_cancellation and request_id:
                await self._cancel_server_job_by_request_id(url, request_id)
            # Re-raise to propagate cancellation
            raise
        
        except asyncio.TimeoutError:
            logger.error(f"HTTP MCP tool {tool_name} timed out after 360 seconds")
            # Try to cancel this specific job on timeout (only if supported)
            if supports_cancellation and request_id:
                await self._cancel_server_job_by_request_id(url, request_id)
            return self._create_error_result(
                f"Tool execution timed out after 6 minutes. The operation may still be running on the server."
            )
        except Exception as e:
            logger.error(f"Error executing HTTP MCP tool {tool_name}: {str(e)}")
            return self._create_error_result(f"Error executing HTTP tool: {str(e)}")
        finally:
            # Clear tracking after execution completes
            self._current_request_id = None
            self._current_server_url = None
    
    async def _execute_json_tool(self, tool_name: str, arguments: Dict[str, Any], tool_info: Dict[str, Any]) -> ToolResult:
        custom_config = tool_info['custom_config']
        original_tool_name = tool_info['original_name']
        
        server_params = StdioServerParameters(
            command=custom_config["command"],
            args=custom_config.get("args", []),
            env=custom_config.get("env", {})
        )
        
        async with asyncio.timeout(30):
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(original_tool_name, arguments)
                    return self._create_success_result(self._extract_content(result))
    
    def _server_supports_cancellation(self, url: str, custom_config: Dict[str, Any]) -> bool:
        """
        Check if the MCP server supports our cancellation protocol.
        
        This is used to maintain backward compatibility - we only inject
        _request_id and attempt cancellation for servers that support it.
        
        A server supports cancellation if:
        1. The custom_config explicitly sets 'supports_cancellation': True
        2. OR the URL matches known servers we control (bihi/aptean automation)
        
        Args:
            url: The MCP server URL
            custom_config: The tool's custom configuration
            
        Returns:
            True if the server supports our cancellation protocol
        """
        # Check explicit config flag first
        if custom_config.get('supports_cancellation', False):
            return True
        
        # Check for known servers we control
        # These are the automation servers that implement our cancellation endpoint
        known_cancellation_servers = [
            'bihi-aptean-ross-automation',
            'aptean-ross-automation',
            'bihi-automation',
            # Add more known servers here as needed
        ]
        
        url_lower = url.lower()
        for server_pattern in known_cancellation_servers:
            if server_pattern in url_lower:
                return True
        
        return False
    
    async def _cancel_server_job_by_request_id(self, mcp_url: str, request_id: str) -> None:
        """
        Cancel a specific job on the MCP server by its request_id.
        Called when user cancels the operation or on timeout.
        
        This is a best-effort cleanup - failures are logged but don't raise.
        
        Args:
            mcp_url: The MCP server URL (e.g., https://server.onrender.com/mcp)
            request_id: The unique request ID that was passed to the server
        """
        try:
            # Extract base URL from MCP URL (remove /mcp suffix if present)
            base_url = mcp_url.rstrip('/')
            if base_url.endswith('/mcp'):
                base_url = base_url[:-4]
            
            cancel_url = f"{base_url}/jobs/cancel"
            
            logger.info(f"Attempting to cancel job with request_id={request_id} at {cancel_url}")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    cancel_url,
                    params={"request_id": request_id}
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('cancelled'):
                        logger.info(f"Successfully cancelled job {result.get('job_id')} (request_id: {request_id})")
                    else:
                        logger.info(f"No job found to cancel for request_id: {request_id}")
                else:
                    logger.warning(f"Failed to cancel job: HTTP {response.status_code}")
                    
        except Exception as e:
            # Best-effort cleanup - don't fail if server is unreachable
            logger.warning(f"Could not cancel server job (best-effort cleanup): {e}")
    
    async def _resolve_external_user_id(self, custom_config: Dict[str, Any]) -> str:
        profile_id = custom_config.get('profile_id')
        external_user_id = custom_config.get('external_user_id')
        
        if not profile_id:
            return external_user_id
        
        try:
            from core.services.supabase import DBConnection
            from core.utils.encryption import decrypt_data
            
            db = DBConnection()
            supabase = await db.client
            
            result = await supabase.table('user_mcp_credential_profiles').select(
                'encrypted_config'
            ).eq('profile_id', profile_id).single().execute()
            
            if result.data:
                decrypted_config = decrypt_data(result.data['encrypted_config'])
                config_data = json.loads(decrypted_config)
                return config_data.get('external_user_id', external_user_id)
            
        except Exception as e:
            logger.error(f"Failed to resolve profile {profile_id}: {str(e)}")
        
        return external_user_id
    
    def _extract_content(self, result) -> str:
        if hasattr(result, 'content'):
            content = result.content
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if hasattr(item, 'text'):
                        text_parts.append(item.text)
                    else:
                        text_parts.append(str(item))
                return "\n".join(text_parts)
            elif hasattr(content, 'text'):
                return content.text
            else:
                return str(content)
        else:
            return str(result)
    
    def _parse_tool_response(self, content: str) -> ToolResult:
        """
        Parse tool response content and detect tool-level errors.
        
        This handles the case where the MCP protocol succeeded but the tool itself
        returned an error response (e.g., {"success": false, "error_type": "tool_error"}).
        
        Args:
            content: The raw string content from the MCP tool call
            
        Returns:
            ToolResult with success=True if tool succeeded, success=False if tool failed
        """
        try:
            parsed = json.loads(content)
            
            if isinstance(parsed, dict):
                # Check for explicit success=False flag (new structured format)
                if parsed.get("success") == False:
                    error_type = parsed.get("error_type", "unknown")
                    error = parsed.get("error", "Tool execution failed")
                    error_class = parsed.get("error_class", "")
                    recoverable = parsed.get("recoverable", True)
                    
                    # Format error message with type information
                    if error_class:
                        error_msg = f"[{error_type}:{error_class}] {error}"
                    else:
                        error_msg = f"[{error_type}] {error}"
                    
                    logger.warning(f"Tool returned error: {error_msg}")
                    return self._create_error_result(error_msg)
                
                # Check for legacy status="error" format
                if parsed.get("status") == "error":
                    error = parsed.get("error") or parsed.get("message", "Tool failed")
                    error_type = parsed.get("error_type", "tool_error")
                    
                    error_msg = f"[{error_type}] {error}"
                    logger.warning(f"Tool returned error (legacy format): {error_msg}")
                    return self._create_error_result(error_msg)
            
            # Success case - return the content as-is
            return self._create_success_result(content)
            
        except json.JSONDecodeError:
            # Not JSON, return as-is (probably plain text result)
            return self._create_success_result(content)
    
    def _create_success_result(self, content: Any) -> ToolResult:
        if self.tool_wrapper and hasattr(self.tool_wrapper, 'success_response'):
            return self.tool_wrapper.success_response(content)
        return ToolResult(
            success=True,
            content=str(content),
            metadata={}
        )
    
    def _create_error_result(self, error_message: str) -> ToolResult:
        if self.tool_wrapper and hasattr(self.tool_wrapper, 'fail_response'):
            return self.tool_wrapper.fail_response(error_message)
        return ToolResult(
            success=False,
            content=error_message,
            metadata={}
        ) 