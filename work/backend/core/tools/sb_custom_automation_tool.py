import asyncio
import os
import json
import zipfile
import tempfile
from typing import Optional, Dict, Any, List
from uuid import uuid4
from core.agentpress.tool import ToolResult, openapi_schema, usage_example
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.services.supabase import DBConnection
from core.utils.logger import logger


class SandboxCustomAutomationTool(SandboxToolsBase):
    """Custom Browser Automation Tool - Upload Chrome profiles and run custom Playwright/Stagehand scripts.
    Allows agents to perform sophisticated browser automation with persistent login sessions."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.db = DBConnection()
        self.automation_dir = "/workspace/custom_automation"
        self.profiles_dir = f"{self.automation_dir}/profiles"
        self.scripts_dir = f"{self.automation_dir}/scripts"

    async def _ensure_automation_dirs(self):
        """Ensure automation directories exist in sandbox."""
        try:
            await self._ensure_sandbox()
            
            # Create directories
            dirs = [self.automation_dir, self.profiles_dir, self.scripts_dir]
            for directory in dirs:
                await self.sandbox.process.execute(
                    f"mkdir -p {directory}",
                    session_name="setup"
                )
            
            # Install playwright if not installed
            await self.sandbox.process.execute(
                "cd /workspace && npm install -g playwright @playwright/test",
                session_name="setup"
            )
            
        except Exception as e:
            logger.error(f"Failed to setup automation directories: {str(e)}")
            raise

    @openapi_schema({
        "type": "function", 
        "function": {
            "name": "configure_custom_automation",
            "description": "⚙️ Configure custom browser automation by uploading a Chrome profile zip and JavaScript automation script. This enables persistent browser sessions with saved logins and custom automation logic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "config_name": {
                        "type": "string",
                        "description": "Name for this automation configuration (e.g., 'arcadia_automation', 'coldchain_setup')"
                    },
                    "chrome_profile_base64": {
                        "type": "string", 
                        "description": "Base64 encoded Chrome profile zip file containing saved sessions and preferences"
                    },
                    "automation_script": {
                        "type": "string",
                        "description": "JavaScript automation script using Playwright syntax. Should include browser launch with profile path './profiles/[config_name]'"
                    },
                    "description": {
                        "type": "string",
                        "description": "Description of what this automation does"
                    }
                },
                "required": ["config_name", "chrome_profile_base64", "automation_script"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="configure_custom_automation">
        <parameter name="config_name">arcadia_inventory</parameter>
        <parameter name="chrome_profile_base64">[base64 encoded zip file data]</parameter>
        <parameter name="automation_script">import { chromium } from 'playwright';

async function runAutomation() {
  const context = await chromium.launchPersistentContext('./profiles/arcadia_inventory', {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  
  try {
    await page.goto('https://arcadiaone.com/dashboard');
    await page.waitForTimeout(2000);
    // Your custom automation logic here...
    
  } catch (error) {
    console.error('Automation error:', error);
  }
  
  await context.close();
}

runAutomation();</parameter>
        <parameter name="description">Arcadia inventory management automation with persistent login</parameter>
        </invoke>
        </function_calls>
        ''')
    async def configure_custom_automation(
        self,
        config_name: str,
        chrome_profile_base64: str,
        automation_script: str,
        description: Optional[str] = None
    ) -> ToolResult:
        """Configure a custom automation with Chrome profile and script."""
        
        try:
            # Get current user from thread manager
            account_id = self.thread_manager.account_id
            if not account_id:
                return self.fail_response("User account not found")

            await self._ensure_automation_dirs()

            # Decode and save Chrome profile
            import base64
            profile_data = base64.b64decode(chrome_profile_base64)
            profile_path = f"{self.profiles_dir}/{config_name}"
            
            # Save zip file temporarily  
            with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
                tmp_file.write(profile_data)
                tmp_zip_path = tmp_file.name

            # Extract profile to sandbox
            await self.sandbox.process.execute(
                f"cd {self.profiles_dir} && unzip -o {tmp_zip_path} -d {config_name}/",
                session_name="profile_setup"
            )

            # Clean up temp file
            os.unlink(tmp_zip_path)

            # Save automation script
            script_filename = f"{config_name}.js"
            script_path = f"{self.scripts_dir}/{script_filename}"
            
            # Write script to sandbox
            await self.sandbox.files.write(script_path, automation_script)

            # Save configuration to database
            client = await self.db.client
            config_data = {
                "account_id": account_id,
                "config_name": config_name,
                "description": description or f"Custom automation: {config_name}",
                "profile_path": profile_path,
                "script_path": script_path,
                "script_content": automation_script,
                "created_at": "NOW()"
            }

            # Check if config already exists
            existing = await client.table('custom_automations').select('*').eq('account_id', account_id).eq('config_name', config_name).execute()
            
            if existing.data:
                # Update existing
                result = await client.table('custom_automations').update({
                    "description": config_data["description"],
                    "script_content": automation_script,
                    "updated_at": "NOW()"
                }).eq('account_id', account_id).eq('config_name', config_name).execute()
                action = "Updated"
            else:
                # Create new
                result = await client.table('custom_automations').insert(config_data).execute()
                action = "Created"

            return self.success_response(
                f"✅ {action} custom automation configuration '{config_name}'\n\n"
                f"**Configuration Details:**\n"
                f"- Name: {config_name}\n"
                f"- Profile Path: {profile_path}\n"
                f"- Script Path: {script_path}\n"
                f"- Description: {description or 'N/A'}\n\n"
                f"🚀 You can now run this automation using the `run_custom_automation` function."
            )

        except Exception as e:
            logger.error(f"Failed to configure custom automation: {str(e)}")
            return self.fail_response(f"Failed to configure automation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "run_custom_automation", 
            "description": "▶️ Run a previously configured custom automation script with Chrome profile. The automation will execute with persistent browser sessions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "config_name": {
                        "type": "string",
                        "description": "Name of the automation configuration to run"
                    },
                    "headless": {
                        "type": "boolean",
                        "description": "Whether to run browser in headless mode (default: false for debugging)",
                        "default": False
                    },
                    "timeout_seconds": {
                        "type": "integer", 
                        "description": "Maximum time to wait for automation completion (default: 300 seconds)",
                        "default": 300
                    }
                },
                "required": ["config_name"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="run_custom_automation">
        <parameter name="config_name">arcadia_inventory</parameter>
        <parameter name="headless">false</parameter>
        <parameter name="timeout_seconds">600</parameter>
        </invoke>
        </function_calls>
        ''')
    async def run_custom_automation(
        self,
        config_name: str,
        headless: bool = False,
        timeout_seconds: int = 300
    ) -> ToolResult:
        """Run a custom automation configuration."""
        
        try:
            # Get current user
            account_id = self.thread_manager.account_id
            if not account_id:
                return self.fail_response("User account not found")

            # Load configuration from database
            client = await self.db.client
            config_result = await client.table('custom_automations').select('*').eq('account_id', account_id).eq('config_name', config_name).execute()

            if not config_result.data:
                return self.fail_response(f"Custom automation configuration '{config_name}' not found")

            config = config_result.data[0]
            script_path = config['script_path']

            await self._ensure_sandbox()

            # Run the automation script
            logger.info(f"Running custom automation: {config_name}")
            
            result = await self.sandbox.process.execute(
                f"cd {self.automation_dir} && node {script_path}",
                session_name="automation",
                timeout=timeout_seconds
            )

            if result.exit_code == 0:
                return self.success_response(
                    f"✅ Custom automation '{config_name}' completed successfully!\n\n"
                    f"**Execution Results:**\n"
                    f"```\n{result.output}\n```\n\n"
                    f"**Configuration Used:**\n"
                    f"- Profile: {config['profile_path']}\n"
                    f"- Script: {config['script_path']}\n"
                    f"- Headless: {headless}\n"
                    f"- Timeout: {timeout_seconds}s"
                )
            else:
                return self.fail_response(
                    f"❌ Custom automation '{config_name}' failed\n\n"
                    f"**Error Output:**\n"
                    f"```\n{result.output}\n```\n\n"
                    f"Exit code: {result.exit_code}"
                )

        except Exception as e:
            logger.error(f"Failed to run custom automation: {str(e)}")
            return self.fail_response(f"Failed to run automation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_custom_automations",
            "description": "📋 List all custom automation configurations available to the current user.",
            "parameters": {
                "type": "object", 
                "properties": {},
                "required": []
            }
        }
    })
    async def list_custom_automations(self) -> ToolResult:
        """List all custom automations for the current user."""
        
        try:
            account_id = self.thread_manager.account_id
            if not account_id:
                return self.fail_response("User account not found")

            client = await self.db.client
            result = await client.table('custom_automations').select('config_name, description, created_at, updated_at').eq('account_id', account_id).order('created_at', desc=True).execute()

            if not result.data:
                return self.success_response("📝 No custom automation configurations found. Use `configure_custom_automation` to create one.")

            configs_list = []
            for config in result.data:
                configs_list.append(
                    f"**{config['config_name']}**\n"
                    f"  Description: {config.get('description', 'N/A')}\n"
                    f"  Created: {config['created_at']}\n"
                    f"  Updated: {config.get('updated_at', 'N/A')}"
                )

            return self.success_response(
                f"📋 **Custom Automation Configurations** ({len(result.data)} found)\n\n" + 
                "\n\n".join(configs_list) + 
                f"\n\n💡 Use `run_custom_automation` with any config name to execute."
            )

        except Exception as e:
            logger.error(f"Failed to list custom automations: {str(e)}")
            return self.fail_response(f"Failed to list automations: {str(e)}")