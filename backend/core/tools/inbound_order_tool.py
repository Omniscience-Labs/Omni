"""
Cold Chain Enterprise Inbound Order Tool

Unified workspace-scoped tool for Cold Chain Enterprise to handle:
- Credential setup (admin-only, one-time browser authentication)
- Order processing (get orders, extract data, run pipeline)

Uses SDK client initialized with stored credentials and browser profile.

This tool is only registered for workspaces: cold-chain-enterprise, operator
Credentials are stored encrypted via CredentialService and never exposed in logs.
Credentials and browser profiles are PER-USER (not shared across workspace).
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from pathlib import Path
import os
import shutil
import sys

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.agentpress.thread_manager import ThreadManager
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger, structlog
from core.credentials.credential_service import get_credential_service
from core.credentials.profile_service import get_profile_service, CredentialService, MCPCredential
from core.services.supabase import DBConnection

log = structlog.get_logger()


@tool_metadata(
    display_name="Cold Chain Inbound Orders",
    description="Unified tool for Cold Chain Enterprise: setup credentials (admin-only) and process inbound orders from ERP.",
    icon="📦",
    color="bg-blue-100 dark:bg-blue-800/50",
    weight=90,
    visible=True
)
class InboundOrderTool(SandboxToolsBase):
    """
    Automated tool to retrieve and process inbound orders.
    Uses persistent browser profile for authentication via SDK.
    """

    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id

    async def _get_workspace_slug(self, account_id: str) -> str:
        """Get workspace slug from account_id."""
        try:
            db = DBConnection()
            client = await db.client
            result = await client.schema("basejump").table("accounts").select("slug").eq("id", account_id).single().execute()
            
            if not result.data:
                raise ValueError(f"Account {account_id} not found")
            
            return result.data.get("slug", "")
        except Exception as e:
            log.error("Failed to get workspace slug", account_id=account_id, error=str(e))
            raise

    async def _validate_erp_session(self, credential: MCPCredential) -> tuple[bool, Optional[str]]:
        """
        Validate ERP session expiration.
        
        Returns:
            (is_valid, error_message)
        """
        try:
            erp_session = credential.config.get("erp_session", {})
            expires_at_str = erp_session.get("expires_at")
            
            if not expires_at_str:
                return False, "ERP session expiration not found"
            
            expires_at = datetime.fromisoformat(expires_at_str.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            
            if expires_at < now:
                return False, "ERP session expired. Admin must re-authenticate."
            
            return True, None
            
        except Exception as e:
            log.error("Session validation error", error=str(e))
            return False, f"Session validation error: {str(e)}"

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "cold_chain_inbound_orders",
            "description": "Unified Cold Chain Enterprise inbound order tool. Handles credential setup and order processing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "Action to perform: 'setup' (admin-only, one-time browser auth), 'orders' (get orders), 'extraction' (extract data), or 'pipeline' (full automation)",
                        "enum": ["setup", "orders", "extraction", "pipeline"]
                    },
                    "browser_data_source": {
                        "type": "string",
                        "description": "Optional: Path to existing browser data folder to copy history from (e.g., '/path/to/Chrome/User Data/Default')"
                    }
                },
                "required": ["action"]
            }
        }
    })
    async def _get_authenticated_user_id(self) -> Optional[str]:
        """Get authenticated user_id from context vars or thread metadata."""
        try:
            # Try to get user_id from context vars (set during request processing)
            context_vars = structlog.contextvars.get_contextvars()
            user_id = context_vars.get('user_id')
            if user_id:
                return user_id
            
            # Fallback: get from thread metadata if available
            db = DBConnection()
            client = await db.client
            thread_result = await client.table('threads').select('metadata').eq('thread_id', self.thread_id).limit(1).execute()
            if thread_result.data and thread_result.data[0].get('metadata'):
                metadata = thread_result.data[0]['metadata']
                if isinstance(metadata, dict):
                    user_id = metadata.get('user_id')
                    if user_id:
                        return user_id
            
            return None
        except Exception as e:
            log.warning("Failed to get user_id from context", error=str(e))
            return None

    async def cold_chain_inbound_orders(self, action: str, browser_data_source: Optional[str] = None) -> ToolResult:
        """
        Unified Cold Chain Enterprise tool for setup and order processing.
        
        Actions:
        - 'setup': Admin-only one-time browser authentication setup
        - 'orders': Get latest orders from ERP
        - 'extraction': Extract order data
        - 'pipeline': Run full automation pipeline
        """
        account_id = None
        user_id = None
        try:
            # Resolve account_id (workspace) from thread_id for workspace verification
            db = DBConnection()
            client = await db.client
            thread_result = await client.table('threads').select('account_id').eq('thread_id', self.thread_id).limit(1).execute()
            
            if not thread_result.data:
                return self.fail_response("Could not find thread")
            
            account_id = thread_result.data[0]['account_id']
            if not account_id:
                return self.fail_response("Thread has no associated account_id")
            
            # Verify workspace slug
            workspace_slug = await self._get_workspace_slug(account_id)
            # operator = staging workspace (varnica.operator.becomeomni.net)
            allowed_workspaces = ["cold-chain-enterprise", "operator"]
            if workspace_slug not in allowed_workspaces:
                log.warning("Workspace mismatch", account_id=account_id, slug=workspace_slug, allowed=allowed_workspaces)
                return self.fail_response("This tool is only available for Cold Chain Enterprise workspaces.")
            
            # Get authenticated user_id for user-specific credentials
            user_id = await self._get_authenticated_user_id()
            if not user_id:
                # Fallback: use account_id if user_id not available (backwards compatibility)
                # But log a warning
                log.warning("user_id not found in context, using account_id as fallback", thread_id=self.thread_id)
                user_id = account_id
            
            # Handle setup action separately
            if action == "setup":
                return await self._handle_setup(user_id, account_id, browser_data_source)
            
            # For processing actions, retrieve and validate credentials using user_id (not account_id)
            # Try ProfileService first (uses user_mcp_credential_profiles), fallback to CredentialService
            credential = None
            try:
                profile_service = get_profile_service(db)
                profile = await profile_service.get_default_profile(user_id, "nova_act.inbound_orders")
                if profile:
                    # Convert profile to credential-like object for compatibility
                    from types import SimpleNamespace
                    credential = SimpleNamespace(
                        config=profile.config,
                        credential_id=profile.profile_id
                    )
            except Exception as e:
                log.debug(f"ProfileService failed, trying CredentialService: {e}")
                # Fallback to CredentialService
                try:
                    cred_service = get_credential_service(db)
                    credential = await cred_service.get_credential(user_id, "nova_act.inbound_orders")
                except Exception as cred_error:
                    log.warning(f"Both ProfileService and CredentialService failed: {cred_error}")
            
            if not credential:
                log.warning("Credentials not found", user_id=user_id, account_id=account_id)
                return self.fail_response("ERP credentials not found. Please configure credentials via admin panel or tool settings, then run 'setup' action.")
            
            # Validate ERP session (skip for setup)
            is_valid, error_msg = await self._validate_erp_session(credential)
            if not is_valid:
                log.warning("Session validation failed", user_id=user_id, account_id=account_id, error=error_msg)
                return self.fail_response(f"{error_msg} Run 'setup' action to re-authenticate.")
            
            # Extract credentials from config
            nova_act_api_key = credential.config.get("nova_act_api_key")
            erp_session = credential.config.get("erp_session", {})
            browser_profile_path = erp_session.get("browser_profile_path")
            arcadia_link = credential.config.get("arcadia_link")
            
            if not nova_act_api_key:
                return self.fail_response("Nova ACT API key not found in credentials.")
            
            if not arcadia_link:
                return self.fail_response("Arcadia link not found in credentials. Please configure it via admin panel.")
            
            if not browser_profile_path:
                return self.fail_response("Browser profile path not found. Run 'setup' action first.")
            
            # Set SDK path and environment variables
            sdk_path = "/workspace/omni_inbound_mcp_sdk/inbound_mcp"
            scripts_path = "/workspace/omni_inbound_mcp_sdk/stagehand-test"
            
            # Add SDK to Python path
            import sys
            if sdk_path not in sys.path:
                sys.path.insert(0, sdk_path)
            
            # Set environment variable for API key
            os.environ['NOVA_ACT_API_KEY'] = nova_act_api_key
            
            # Initialize SDK client and execute action
            try:
                from inbound_mcp.sdk import InboundOrderClient
                
                sdk_kwargs = {
                    "api_key": nova_act_api_key,
                    "browser_profile_path": browser_profile_path,
                    "arcadia_link": arcadia_link,
                    "headless": False,  # Run browser in visible mode so user can see automation
                }
                
                sdk_client = InboundOrderClient(**sdk_kwargs)
                
                # Execute requested action
                if action == "orders":
                    result = await sdk_client.get_orders()
                elif action == "extraction":
                    result = await sdk_client.extract_orders()
                elif action == "pipeline":
                    result = await sdk_client.run_pipeline()
                else:
                    return self.fail_response(f"Unknown action: {action}. Use 'setup', 'orders', 'extraction', or 'pipeline'.")
                
                log.info("Action completed", user_id=user_id, account_id=account_id, thread_id=self.thread_id, action=action, success=True)
                
                return self.success_response({
                    "message": f"Inbound order {action} completed",
                    "action": action,
                    "result": result
                })
                
            except ImportError:
                log.error("SDK not available", user_id=user_id, account_id=account_id)
                return self.fail_response("SDK not available. Please ensure nova_act SDK is installed.")
            except Exception as e:
                log.error("Action execution failed", user_id=user_id, account_id=account_id, thread_id=self.thread_id, action=action, error=str(e), exc_info=True)
                return self.fail_response(f"Action execution failed: {str(e)}")
                
        except Exception as e:
            log.error("Cold chain tool failed", user_id=user_id if 'user_id' in locals() else None, account_id=account_id if 'account_id' in locals() else None, thread_id=self.thread_id, action=action if 'action' in locals() else None, error=str(e), exc_info=True)
            return self.fail_response(f"Processing failed: {str(e)}")
    
    async def _handle_setup(self, user_id: str, account_id: str, browser_data_source: Optional[str] = None) -> ToolResult:
        """Handle credential setup action (admin-only)."""
        try:
            log.info("Starting credential setup", user_id=user_id, account_id=account_id, thread_id=self.thread_id)
            
            db = DBConnection()
            # Try ProfileService first (uses user_mcp_credential_profiles), fallback to CredentialService
            existing_credential = None
            try:
                profile_service = get_profile_service(db)
                profile = await profile_service.get_default_profile(user_id, "nova_act.inbound_orders")
                if profile:
                    # Convert profile to credential-like object for compatibility
                    from types import SimpleNamespace
                    existing_credential = SimpleNamespace(
                        config=profile.config,
                        credential_id=profile.profile_id
                    )
            except Exception as e:
                log.debug(f"ProfileService failed, trying CredentialService: {e}")
                # Fallback to CredentialService
                try:
                    cred_service = get_credential_service(db)
                    existing_credential = await cred_service.get_credential(user_id, "nova_act.inbound_orders")
                except Exception as cred_error:
                    log.warning(f"Both ProfileService and CredentialService failed: {cred_error}")
            
            if not existing_credential:
                return self.fail_response("Credentials not found. Please configure Nova ACT API key via admin panel or tool settings first.")
            
            nova_act_api_key = existing_credential.config.get("nova_act_api_key")
            if not nova_act_api_key:
                return self.fail_response("Nova ACT API key not found. Please configure it via admin panel or tool settings first.")
            
            # Arcadia URL is required for login
            arcadia_link = existing_credential.config.get("arcadia_link")
            if not arcadia_link:
                return self.fail_response("Arcadia link not found. Please configure it via admin panel or tool settings first.")
            
            # Verify SDK folder exists
            sdk_path = Path("/workspace/omni_inbound_mcp_sdk/inbound_mcp")
            scripts_path = Path("/workspace/omni_inbound_mcp_sdk/stagehand-test")
            contexts_path = scripts_path / "contexts"
            
            if not sdk_path.exists():
                return self.fail_response(f"SDK folder not found at {sdk_path}. Please upload SDK folder via admin panel.")
            
            if not scripts_path.exists():
                return self.fail_response(f"Scripts folder not found at {scripts_path}. Please upload SDK folder via admin panel.")
            
            if not contexts_path.exists():
                return self.fail_response(f"Browser profiles folder not found at {contexts_path}. Please upload SDK folder with browser profiles via admin panel.")
            
            # Browser profile path is per-user, not per-workspace
            browser_profile_path = f"/app/data/browser_profiles/{user_id}/"
            os.makedirs(browser_profile_path, exist_ok=True)
            
            # Ensure browser history directory exists (Chrome stores history in Default/History)
            history_dir = os.path.join(browser_profile_path, "Default")
            os.makedirs(history_dir, exist_ok=True)
            
            # Copy browser history from source if provided
            if browser_data_source:
                try:
                    source_history_path = os.path.join(browser_data_source, "History")
                    source_history_journal = os.path.join(browser_data_source, "History-journal")
                    dest_history_path = os.path.join(history_dir, "History")
                    dest_history_journal = os.path.join(history_dir, "History-journal")
                    
                    if os.path.exists(source_history_path):
                        shutil.copy2(source_history_path, dest_history_path)
                        log.info("Copied browser history", source=source_history_path, dest=dest_history_path)
                    
                    if os.path.exists(source_history_journal):
                        shutil.copy2(source_history_journal, dest_history_journal)
                        log.info("Copied browser history journal", source=source_history_journal, dest=dest_history_journal)
                    
                    # Also copy other important browser data files
                    browser_data_files = ["Cookies", "Login Data", "Preferences", "Web Data"]
                    for filename in browser_data_files:
                        source_file = os.path.join(browser_data_source, filename)
                        dest_file = os.path.join(history_dir, filename)
                        if os.path.exists(source_file):
                            shutil.copy2(source_file, dest_file)
                            log.info("Copied browser data file", file=filename)
                    
                except Exception as e:
                    log.warning("Failed to copy browser history from source", source=browser_data_source, error=str(e))
                    # Don't fail setup if history copy fails - continue with fresh profile
            
            # Set SDK path and environment variables
            sdk_path_str = str(sdk_path)
            if sdk_path_str not in sys.path:
                sys.path.insert(0, sdk_path_str)
            
            os.environ['NOVA_ACT_API_KEY'] = nova_act_api_key
            
            # Ensure DISPLAY is set for visible browser (if running in container/server environment)
            if 'DISPLAY' not in os.environ:
                log.debug("DISPLAY not set, browser may not be visible in headless server environment")
            
            try:
                from inbound_mcp.sdk import InboundOrderClient
                
                # Initialize SDK client with visible browser
                sdk_client = InboundOrderClient(
                    api_key=nova_act_api_key,
                    browser_profile_path=browser_profile_path,
                    arcadia_link=arcadia_link,
                    headless=False,  # Run browser in visible mode so user can see automation
                )
                
                setup_result = await sdk_client.setup_credentials()
                
                if not setup_result.get("success", False):
                    log.error("SDK setup failed", user_id=user_id, account_id=account_id, error=setup_result.get("error"))
                    return self.fail_response(f"SDK setup failed: {setup_result.get('error', 'Unknown error')}")
                
                log.info("SDK setup completed", user_id=user_id, account_id=account_id)
                
                # After SDK setup, ensure browser history is preserved
                # Chrome will have created/updated history during authentication
                # The history is now saved in browser_profile_path/Default/History
                history_file = os.path.join(history_dir, "History")
                if os.path.exists(history_file):
                    log.info("Browser history saved", history_path=history_file, user_id=user_id)
                else:
                    log.warning("Browser history file not found after setup", history_path=history_file)
                
            except ImportError:
                log.error("SDK not available", user_id=user_id, account_id=account_id)
                return self.fail_response("SDK not available. Please ensure nova_act SDK is installed.")
            except Exception as e:
                log.error("SDK setup error", user_id=user_id, account_id=account_id, error=str(e))
                return self.fail_response(f"SDK setup error: {str(e)}")
            
            # Update credentials with browser profile info
            expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            existing_config = existing_credential.config.copy()
            existing_config["erp_session"] = {
                "browser_profile_path": browser_profile_path,
                "expires_at": expires_at
            }
            
            # Store credentials using user_id (not account_id) for user-specific storage
            credential_id = await cred_service.store_credential(
                account_id=user_id,  # API uses user_id as account_id parameter
                mcp_qualified_name="nova_act.inbound_orders",
                display_name="Nova ACT Inbound Orders",
                config=existing_config
            )
            
            log.info("Credentials stored", user_id=user_id, account_id=account_id, thread_id=self.thread_id, credential_id=credential_id)
            
            return self.success_response({
                "message": "ERP credentials setup complete",
                "browser_profile_path": browser_profile_path,
                "expires_at": expires_at,
                "status": "active"
            })
            
        except Exception as e:
            log.error("Setup failed", user_id=user_id if 'user_id' in locals() else None, account_id=account_id if 'account_id' in locals() else None, thread_id=self.thread_id, error=str(e), exc_info=True)
            return self.fail_response(f"Setup failed: {str(e)}")
