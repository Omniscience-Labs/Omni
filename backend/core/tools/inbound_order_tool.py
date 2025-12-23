"""
Inbound Order Tool

Workspace-scoped tool for Cold Chain Enterprise to run inbound ERP automations.
Uses SDK client initialized with stored credentials and browser profile.
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.agentpress.thread_manager import ThreadManager
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger, structlog
from core.credentials.credential_service import get_credential_service, CredentialService, MCPCredential
from core.services.supabase import DBConnection

log = structlog.get_logger()


@tool_metadata(
    display_name="Inbound Order Processor",
    description="Automated tool to process inbound orders from Cold Chain ERP. Runs orders, extraction, and pipeline automations.",
    icon="Truck",
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
            "name": "process_inbound_orders",
            "description": "Process inbound orders from ERP. Retrieves latest orders, extracts data, and runs automation pipeline.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "Action to perform: 'orders', 'extraction', or 'pipeline'",
                        "enum": ["orders", "extraction", "pipeline"]
                    }
                },
                "required": ["action"]
            }
        }
    })
    async def process_inbound_orders(self, action: str) -> ToolResult:
        """
        Execute inbound ERP automations (orders, extraction, pipeline).
        
        Flow:
        1. Resolve account_id from thread_id
        2. Retrieve credential via CredentialService
        3. Validate ERP session expiration
        4. Initialize SDK client with credentials
        5. Execute requested action
        """
        account_id = None
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
            
            log.info(
                "Processing inbound orders",
                account_id=account_id,
                thread_id=self.thread_id,
                action=action
            )
            
            # Verify workspace slug
            workspace_slug = await self._get_workspace_slug(account_id)
            allowed_workspaces = ["cold-chain-enterprise", "varnica.dev"]
            if workspace_slug not in allowed_workspaces:
                log.warning("Workspace mismatch", account_id=account_id, slug=workspace_slug, allowed=allowed_workspaces)
                return self.fail_response("This tool is only available for cold-chain-enterprise or varnica.dev workspace.")
            
            # Retrieve credential via CredentialService
            cred_service = get_credential_service(db)
            credential = await cred_service.get_credential(account_id, "nova_act.inbound_orders")
            
            if not credential:
                log.warning("Credentials not found", account_id=account_id)
                return self.fail_response("ERP credentials not found. Admin must setup credentials first.")
            
            # Validate ERP session
            is_valid, error_msg = await self._validate_erp_session(credential)
            if not is_valid:
                log.warning("Session validation failed", account_id=account_id, error=error_msg)
                return self.fail_response(error_msg or "ERP session expired. Admin must re-authenticate.")
            
            # Extract credentials from config
            nova_act_api_key = credential.config.get("nova_act_api_key")
            erp_session = credential.config.get("erp_session", {})
            browser_profile_path = erp_session.get("browser_profile_path")
            
            if not nova_act_api_key:
                return self.fail_response("Nova ACT API key not found in credentials.")
            
            if not browser_profile_path:
                return self.fail_response("Browser profile path not found in credentials.")
            
            # Initialize SDK client
            # SDK handles browser automation and Stagehand lifecycle
            try:
                from nova_act.inbound_orders import InboundOrderClient
                
                sdk_client = InboundOrderClient(
                    api_key=nova_act_api_key,
                    browser_profile_path=browser_profile_path
                )
                
                # Execute requested action
                # SDK must NOT re-login if profile exists
                if action == "orders":
                    result = await sdk_client.get_orders()
                elif action == "extraction":
                    result = await sdk_client.extract_orders()
                elif action == "pipeline":
                    result = await sdk_client.run_pipeline()
                else:
                    return self.fail_response(f"Unknown action: {action}")
                
                log.info(
                    "Action completed successfully",
                    account_id=account_id,
                    thread_id=self.thread_id,
                    action=action,
                    success=True
                )
                
                # Return result without exposing secrets
                return self.success_response({
                    "message": f"Inbound order {action} completed",
                    "action": action,
                    "result": result
                })
                
            except ImportError:
                log.error("SDK not available", account_id=account_id)
                return self.fail_response("SDK not available. Please ensure nova_act SDK is installed.")
            except Exception as e:
                log.error(
                    "Action execution failed",
                    account_id=account_id,
                    thread_id=self.thread_id,
                    action=action,
                    error=str(e),
                    exc_info=True
                )
                return self.fail_response(f"Action execution failed: {str(e)}")
                
        except Exception as e:
            log.error(
                "Inbound order processing failed",
                account_id=account_id,
                thread_id=self.thread_id,
                action=action if 'action' in locals() else None,
                error=str(e),
                exc_info=True
            )
            return self.fail_response(f"Processing failed: {str(e)}")
