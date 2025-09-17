import asyncio
import json
import os
import zipfile
import tempfile
from typing import Optional, Dict, Any
from pathlib import Path

from core.agentpress.tool import ToolResult, openapi_schema, usage_example
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.services.supabase import DBConnection


class CustomAutomationTool(SandboxToolsBase):
    """
    Custom Automation Tool for running user-provided Playwright scripts
    with custom Chrome profiles in the sandbox environment.
    
    This tool allows agents to execute custom browser automation scripts
    that take over the VNC display temporarily during execution.
    """

    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self.automation_dir = "/workspace/custom_automation"
        self.script_path = f"{self.automation_dir}/script.js"
        self.profile_path = f"{self.automation_dir}/chrome_profile"
        self.db = DBConnection()

    async def _ensure_automation_directory(self):
        """Ensure the automation directory structure exists."""
        await self._ensure_sandbox()
        
        # Create automation directory
        create_cmd = f"mkdir -p {self.automation_dir} {self.profile_path}"
        await self.sandbox.process.exec(create_cmd)
        logger.debug(f"Created automation directories: {self.automation_dir}")

    async def _get_agent_automation_config(self) -> Dict[str, Any]:
        """Get the current agent's automation configuration."""
        try:
            # Get current agent from thread
            client = await self.db.client
            thread_result = await client.table('threads').select('agent_id').eq('thread_id', self.thread_id).execute()
            
            if not thread_result.data:
                return {}
                
            agent_id = thread_result.data[0]['agent_id']
            
            # Get agent config
            agent_result = await client.table('agents').select('config').eq('agent_id', agent_id).execute()
            
            if not agent_result.data:
                return {}
                
            config = agent_result.data[0].get('config', {})
            return config.get('custom_automation', {})
            
        except Exception as e:
            logger.error(f"Error getting automation config: {e}")
            return {}

    async def _save_agent_automation_config(self, automation_config: Dict[str, Any]):
        """Save automation configuration to agent config."""
        try:
            # Get current agent from thread
            client = await self.db.client
            thread_result = await client.table('threads').select('agent_id').eq('thread_id', self.thread_id).execute()
            
            if not thread_result.data:
                return False
                
            agent_id = thread_result.data[0]['agent_id']
            
            # Get current agent config
            agent_result = await client.table('agents').select('config').eq('agent_id', agent_id).execute()
            
            if not agent_result.data:
                return False
                
            current_config = agent_result.data[0].get('config', {})
            current_config['custom_automation'] = automation_config
            
            # Update agent config
            await client.table('agents').update({'config': current_config}).eq('agent_id', agent_id).execute()
            
            logger.debug(f"Saved automation config for agent {agent_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving automation config: {e}")
            return False

    async def _stop_stagehand_browser(self):
        """Stop the current Stagehand browser to allow automation takeover."""
        try:
            await self._ensure_sandbox()
            
            # Kill any existing browser processes
            kill_cmd = "pkill -f 'chromium|chrome' || true"
            await self.sandbox.process.exec(kill_cmd)
            
            # Stop browser API server temporarily
            stop_cmd = "pkill -f 'browserApi' || true"
            await self.sandbox.process.exec(stop_cmd)
            
            logger.debug("Stopped Stagehand browser for automation takeover")
            await asyncio.sleep(2)  # Give processes time to stop
            
        except Exception as e:
            logger.warning(f"Error stopping Stagehand browser: {e}")

    async def _restart_stagehand_browser(self):
        """Restart the Stagehand browser after automation completes."""
        try:
            await self._ensure_sandbox()
            
            # Restart browser API server
            restart_cmd = "cd /app && npm run start:browser-api &"
            await self.sandbox.process.exec(restart_cmd)
            
            logger.debug("Restarted Stagehand browser after automation")
            await asyncio.sleep(3)  # Give browser time to start
            
        except Exception as e:
            logger.warning(f"Error restarting Stagehand browser: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "configure_automation",
            "description": "Configure custom browser automation by uploading a Playwright script and Chrome profile. The script should be a .js file and the profile should be a .zip file containing a Chrome user data directory. Once configured, the automation can be triggered automatically when the agent is asked to perform related tasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "script_content": {
                        "type": "string",
                        "description": "The JavaScript content of the Playwright automation script"
                    },
                    "profile_zip_path": {
                        "type": "string", 
                        "description": "Path to the Chrome profile zip file in the workspace (e.g., '/workspace/chrome_profile.zip')"
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional description of what this automation does"
                    }
                },
                "required": ["script_content", "profile_zip_path"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="configure_automation">
        <parameter name="script_content">
import { chromium } from 'playwright';

async function automateTask() {
  const context = await chromium.launchPersistentContext('/workspace/custom_automation/chrome_profile', {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://example.com');
  // ... automation steps ...
  await context.close();
}

automateTask();
        </parameter>
        <parameter name="profile_zip_path">/workspace/chrome_profile.zip</parameter>
        <parameter name="description">Automates login and data extraction from example.com</parameter>
        </invoke>
        </function_calls>
        ''')
    async def configure_automation(
        self, 
        script_content: str, 
        profile_zip_path: str,
        description: Optional[str] = None
    ) -> ToolResult:
        """Configure custom automation script and Chrome profile."""
        try:
            await self._ensure_automation_directory()
            
            # Save the script content
            script_content_modified = script_content.replace(
                './contexts/arcadia_profile',
                '/workspace/custom_automation/chrome_profile'
            ).replace(
                'contexts/arcadia_profile',
                '/workspace/custom_automation/chrome_profile'
            )
            
            # Write script to file
            write_script_cmd = f"cat > {self.script_path} << 'EOF'\n{script_content_modified}\nEOF"
            result = await self.sandbox.process.exec(write_script_cmd)
            
            if result.exit_code != 0:
                return self.fail_response(f"Failed to save automation script: {result.result}")
            
            # Extract Chrome profile if zip file exists
            if profile_zip_path:
                # Check if zip file exists
                check_cmd = f"test -f {profile_zip_path} && echo 'exists' || echo 'missing'"
                check_result = await self.sandbox.process.exec(check_cmd)
                
                if 'exists' in check_result.result:
                    # Extract zip to profile directory
                    extract_cmd = f"cd {self.automation_dir} && rm -rf chrome_profile && unzip -q {profile_zip_path} -d chrome_profile"
                    extract_result = await self.sandbox.process.exec(extract_cmd)
                    
                    if extract_result.exit_code != 0:
                        return self.fail_response(f"Failed to extract Chrome profile: {extract_result.result}")
                else:
                    return self.fail_response(f"Chrome profile zip file not found: {profile_zip_path}")
            
            # Save configuration to agent config
            automation_config = {
                'enabled': True,
                'script_configured': True,
                'profile_configured': bool(profile_zip_path),
                'description': description or 'Custom browser automation',
                'configured_at': str(asyncio.get_event_loop().time())
            }
            
            await self._save_agent_automation_config(automation_config)
            
            return self.success_response({
                'message': 'Custom automation configured successfully',
                'script_path': self.script_path,
                'profile_path': self.profile_path if profile_zip_path else None,
                'description': description
            })
            
        except Exception as e:
            logger.error(f"Error configuring automation: {e}")
            return self.fail_response(f"Failed to configure automation: {str(e)}")

    @openapi_schema({
        "type": "function", 
        "function": {
            "name": "run_automation",
            "description": "Execute the configured custom browser automation. This will temporarily take over the browser display and run the custom Playwright script. The automation will be visible in the VNC display and provide real-time progress updates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "wait_for_completion": {
                        "type": "boolean",
                        "description": "Whether to wait for the automation to complete before returning. Defaults to true.",
                        "default": True
                    }
                }
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="run_automation">
        <parameter name="wait_for_completion">true</parameter>
        </invoke>
        </function_calls>
        ''')
    async def run_automation(self, wait_for_completion: bool = True) -> ToolResult:
        """Execute the configured custom automation."""
        try:
            # Check if automation is configured
            config = await self._get_agent_automation_config()
            if not config.get('enabled') or not config.get('script_configured'):
                return self.fail_response("Custom automation is not configured. Please configure it first using configure_automation.")
            
            # Check if script file exists
            check_cmd = f"test -f {self.script_path} && echo 'exists' || echo 'missing'"
            check_result = await self.sandbox.process.exec(check_cmd)
            
            if 'missing' in check_result.result:
                return self.fail_response("Automation script file not found. Please reconfigure the automation.")
            
            await self._ensure_automation_directory()
            
            # Stop Stagehand browser for takeover
            await self._stop_stagehand_browser()
            
            # Execute the automation script
            logger.info("Starting custom browser automation...")
            
            if wait_for_completion:
                # Blocking execution with real-time output
                exec_cmd = f"cd {self.automation_dir} && timeout 300 node script.js"
                result = await self.sandbox.process.exec(exec_cmd, timeout=300)
                
                # Restart Stagehand browser
                await self._restart_stagehand_browser()
                
                if result.exit_code == 0:
                    return self.success_response({
                        'message': 'Custom automation completed successfully',
                        'output': result.result,
                        'execution_time': 'completed'
                    })
                else:
                    return self.fail_response(f"Automation failed with exit code {result.exit_code}: {result.result}")
            else:
                # Non-blocking execution
                exec_cmd = f"cd {self.automation_dir} && nohup node script.js > automation.log 2>&1 &"
                await self.sandbox.process.exec(exec_cmd)
                
                return self.success_response({
                    'message': 'Custom automation started in background',
                    'note': 'Automation is running. Browser display has been taken over temporarily.'
                })
                
        except Exception as e:
            logger.error(f"Error running automation: {e}")
            # Always try to restart Stagehand browser on error
            await self._restart_stagehand_browser()
            return self.fail_response(f"Failed to run automation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_automation_status",
            "description": "Check the status of the custom automation configuration and any running automation processes.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="get_automation_status">
        </invoke>
        </function_calls>
        ''')
    async def get_automation_status(self) -> ToolResult:
        """Get the current automation configuration and execution status."""
        try:
            # Get automation config
            config = await self._get_agent_automation_config()
            
            # Check if files exist
            script_exists = False
            profile_exists = False
            
            if config.get('script_configured'):
                check_script = await self.sandbox.process.exec(f"test -f {self.script_path} && echo 'exists' || echo 'missing'")
                script_exists = 'exists' in check_script.result
                
            if config.get('profile_configured'):
                check_profile = await self.sandbox.process.exec(f"test -d {self.profile_path} && echo 'exists' || echo 'missing'")
                profile_exists = 'exists' in check_profile.result
            
            # Check if automation is currently running
            check_running = await self.sandbox.process.exec("pgrep -f 'node.*script.js' || echo 'not_running'")
            is_running = 'not_running' not in check_running.result
            
            status = {
                'configured': config.get('enabled', False),
                'script_exists': script_exists,
                'profile_exists': profile_exists,
                'currently_running': is_running,
                'description': config.get('description', 'No description'),
                'configured_at': config.get('configured_at', 'Unknown')
            }
            
            return self.success_response(status)
            
        except Exception as e:
            logger.error(f"Error getting automation status: {e}")
            return self.fail_response(f"Failed to get automation status: {str(e)}")
