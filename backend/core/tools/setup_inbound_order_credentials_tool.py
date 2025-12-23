"""
Setup Inbound Order Credentials Tool

Admin-only tool for Cold Chain Enterprise workspace to setup ERP credentials.
Launches SDK setup flow which handles browser automation via Stagehand.
"""
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.agentpress.thread_manager import ThreadManager
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger, structlog
from core.credentials.credential_service import get_credential_service, CredentialService
from core.services.supabase import DBConnection

log = structlog.get_logger()


@tool_metadata(
    display_name="Setup Inbound Order Credentials",
    description="Admin-only tool to setup ERP credentials for Cold Chain Enterprise workspace. Launches browser for Google SSO authentication.",
    icon="Key",
    color="bg-red-100 dark:bg-red-800/50",
    weight=100,
    visible=True
)
class SetupInboundOrderCredentialsTool(SandboxToolsBase):
    """
    Admin-only tool to setup credentials for the Cold Chain Enterprise ERP.
    Uses SDK to launch headed browser for admin to complete Google SSO.
    Persists authenticated browser profile for workspace reuse.
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

    async def _verify_workspace_access(self, account_id: str) -> bool:
        """Verify user belongs to workspace via account_id."""
        try:
            # Get workspace slug
            workspace_slug = await self._get_workspace_slug(account_id)
            
            # Allow both production (cold-chain-enterprise) and staging (varnica.dev/varnica) workspaces
            allowed_workspaces = ["cold-chain-enterprise", "varnica.dev", "varnica"]
            if workspace_slug not in allowed_workspaces:
                log.warning("Workspace mismatch", account_id=account_id, slug=workspace_slug, allowed=allowed_workspaces)
                return False
            
            return True
        except Exception as e:
            log.error("Failed to verify workspace access", account_id=account_id, error=str(e))
            return False

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "setup_inbound_order_credentials",
            "description": "Admin-only: Setup ERP credentials for Cold Chain Enterprise. Launches browser for Google SSO authentication. Persists browser profile for workspace reuse. Note: API key and other config should be set via admin panel first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "erp_url": {
                        "type": "string",
                        "description": "Optional: ERP login URL. If not provided, uses URL from stored credentials."
                    }
                },
                "required": []
            }
        }
    })
    async def setup_inbound_order_credentials(self, erp_url: Optional[str] = None) -> ToolResult:
        """
        Setup ERP credentials for Cold Chain Enterprise workspace.
        
        Flow:
        1. Verify workspace access
        2. Trigger SDK setup flow (handles browser automation)
        3. Persist browser profile to /app/data/browser_profiles/{account_id}/
        4. Store encrypted credentials via CredentialService
        """
        try:
            # Resolve account_id from thread_id
            db = DBConnection()
            client = await db.client
            thread_result = await client.table('threads').select('account_id').eq('thread_id', self.thread_id).limit(1).execute()
            
            if not thread_result.data:
                return self.fail_response("Could not find thread")
            
            account_id = thread_result.data[0]['account_id']
            if not account_id:
                return self.fail_response("Thread has no associated account_id")
            
            log.info("Starting credential setup", account_id=account_id, thread_id=self.thread_id)
            
            # Verify workspace access
            if not await self._verify_workspace_access(account_id):
                return self.fail_response("Access denied. This tool is only available for cold-chain-enterprise or varnica.dev workspace.")
            
            # Retrieve existing credentials to get API key and config
            cred_service = get_credential_service(db)
            existing_credential = await cred_service.get_credential(account_id, "nova_act.inbound_orders")
            
            if not existing_credential:
                return self.fail_response("Credentials not found. Please configure Nova ACT API key and other settings via the admin panel first.")
            
            # Extract credentials from stored config
            nova_act_api_key = existing_credential.config.get("nova_act_api_key")
            if not nova_act_api_key:
                return self.fail_response("Nova ACT API key not found in credentials. Please configure it via the admin panel first.")
            
            # Use provided erp_url or get from stored credentials
            stored_erp_url = existing_credential.config.get("erp_url")
            final_erp_url = erp_url or stored_erp_url or "https://erp.coldchain.com/login"
            
            # Prepare browser profile path
            browser_profile_path = f"/app/data/browser_profiles/{account_id}/"
            
            # Ensure directory exists
            os.makedirs(browser_profile_path, exist_ok=True)
            
            # Initialize SDK - SDK handles browser automation via Stagehand
            # The SDK will launch a headed browser, open ERP login page,
            # allow admin to complete Google SSO, and persist the profile
            try:
                # Import SDK client (assuming it's available)
                # Note: SDK is responsible for browser automation
                from nova_act.inbound_orders import InboundOrderClient
                
                # Initialize SDK client for setup
                # SDK will handle launching browser and authentication
                sdk_client = InboundOrderClient(
                    api_key=nova_act_api_key,
                    browser_profile_path=browser_profile_path,
                    erp_url=final_erp_url
                )
                
                # Trigger SDK setup flow
                # SDK handles: launching headed browser, opening ERP login,
                # waiting for Google SSO completion, detecting dashboard,
                # and persisting the Chrome profile
                setup_result = await sdk_client.setup_credentials()
                
                if not setup_result.get("success", False):
                    log.error("SDK setup failed", account_id=account_id, error=setup_result.get("error"))
                    return self.fail_response(f"SDK setup failed: {setup_result.get('error', 'Unknown error')}")
                
                log.info("SDK setup completed", account_id=account_id)
                
            except ImportError:
                # If SDK is not available, log error but don't fail completely
                # In production, SDK should be installed
                log.error("SDK not available", account_id=account_id)
                return self.fail_response("SDK not available. Please ensure nova_act SDK is installed.")
            except Exception as e:
                log.error("SDK setup error", account_id=account_id, error=str(e))
                return self.fail_response(f"SDK setup error: {str(e)}")
            
            # Calculate session expiration (e.g., 30 days from now)
            expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            
            # Update credentials with browser profile info (preserve existing config)
            existing_config = existing_credential.config.copy()
            existing_config["erp_session"] = {
                "browser_profile_path": browser_profile_path,
                "expires_at": expires_at
            }
            # Update erp_url if provided
            if erp_url:
                existing_config["erp_url"] = erp_url
            
            credential_id = await cred_service.store_credential(
                account_id=account_id,
                mcp_qualified_name="nova_act.inbound_orders",
                display_name="Nova ACT Inbound Orders",
                config=existing_config
            )
            
            log.info(
                "Credentials stored successfully",
                account_id=account_id,
                thread_id=self.thread_id,
                credential_id=credential_id
            )
            
            # Return success without exposing credentials
            return self.success_response({
                "message": "ERP credentials setup complete",
                "browser_profile_path": browser_profile_path,
                "expires_at": expires_at,
                "status": "active"
            })
            
        except Exception as e:
            log.error(
                "Credential setup failed",
                account_id=account_id if 'account_id' in locals() else None,
                thread_id=self.thread_id,
                error=str(e),
                exc_info=True
            )
            return self.fail_response(f"Setup failed: {str(e)}")
