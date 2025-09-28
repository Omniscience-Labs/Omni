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
                await self.sandbox.process.exec(
                    f"mkdir -p {directory}",
                    timeout=30
                )
            
            # Install playwright if not installed
            await self.sandbox.process.exec(
                "cd /workspace && npm install -g playwright @playwright/test",
                timeout=300
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
        <parameter name="config_name">arcadia_automation</parameter>
        <parameter name="chrome_profile_base64">[base64 encoded Chrome profile zip]</parameter>
        <parameter name="automation_script">// VNC-Compatible Automation Script
// This script will be visible in the Browser tab of the side panel

const { chromium } = require('playwright');

async function runAutomation() {
  console.log('🚀 Starting automation - visible in VNC display');
  
  // Don't launch browser here - the wrapper handles this
  // Your automation logic will run in the context provided
  
  console.log('🌐 Navigating to target website');
  await page.goto('https://example.com/login');
  
  // Wait for page load and take screenshot
  await page.waitForLoadState('networkidle');
  console.log('📸 Taking screenshot');
  
  // Your automation steps
  await page.fill('#username', 'your_username');
  await page.fill('#password', 'your_password');
  await page.click('#login-button');
  
  // Wait and verify
  await page.waitForTimeout(3000);
  console.log('✅ Login completed');
  
  // More automation logic here...
}

// Note: Don't call runAutomation() - the wrapper will execute this code
// in the proper context with VNC display</parameter>
        <parameter name="description">Example automation with VNC display integration</parameter>
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
                return ToolResult(success=False, output="User account not found")

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
            await self.sandbox.process.exec(
                f"cd {self.profiles_dir} && unzip -o {tmp_zip_path} -d {config_name}/",
                timeout=60
            )

            # Clean up temp file
            os.unlink(tmp_zip_path)

            # Save automation script
            script_filename = f"{config_name}.js"
            script_path = f"{self.scripts_dir}/{script_filename}"
            
            # Write script to sandbox
            await self.sandbox.files.write_text(script_path, automation_script)

            # Save configuration to database
            client = await self.db.get_client()
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

            return ToolResult(
                success=True,
                output=f"✅ {action} custom automation configuration '{config_name}'\n\n"
                f"**Configuration Details:**\n"
                f"- Name: {config_name}\n"
                f"- Profile Path: {profile_path}\n"
                f"- Script Path: {script_path}\n"
                f"- Description: {description or 'N/A'}\n\n"
                f"📺 **VNC Display Integration:**\n"
                f"- Browser automation will be visible in VNC display\n"
                f"- Switch to 'Browser' tab in side panel to watch automation\n"
                f"- Chrome profile will provide persistent login sessions\n\n"
                f"🚀 **Next Steps:**\n"
                f"1. Use `run_custom_automation` to execute the automation\n"
                f"2. Use `show_browser_display` to test VNC display first\n\n"
                f"💡 **Script Tips:**\n"
                f"- Your script runs in a wrapper that handles browser launch\n"
                f"- Use 'page' variable directly (context and browser are provided)\n"
                f"- Console.log messages will appear in execution results"
            )

        except Exception as e:
            logger.error(f"Failed to configure custom automation: {str(e)}")
            return ToolResult(success=False, output=f"Failed to configure automation: {str(e)}")

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
        """Run a custom automation configuration with VNC display for visual monitoring."""
        
        try:
            # Get current user
            account_id = self.thread_manager.account_id
            if not account_id:
                return ToolResult(success=False, output="User account not found")

            # Load configuration from database
            client = await self.db.get_client()
            config_result = await client.table('custom_automations').select('*').eq('account_id', account_id).eq('config_name', config_name).execute()

            if not config_result.data:
                return ToolResult(success=False, output=f"Custom automation configuration '{config_name}' not found")

            config = config_result.data[0]
            script_path = config['script_path']

            await self._ensure_sandbox()

            # Set up environment for VNC display and browser visibility
            env_setup = [
                "export DISPLAY=:99",
                "export CHROME_PATH=/usr/bin/google-chrome",
                "export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
                # Install your Stagehand fork if needed
                "cd /workspace && npm install @browserbasehq/stagehand@^2.5.0",
            ]
            
            # Run environment setup
            for cmd in env_setup:
                setup_result = await self.sandbox.process.exec(cmd, timeout=30)
                if setup_result.exit_code != 0:
                    logger.warning(f"Environment setup command failed: {cmd}")

            # Run the automation script with VNC display
            logger.info(f"Running custom automation: {config_name} (headless={headless})")
            
            # Create a wrapper script that ensures proper browser configuration
            # Escape the script content outside of the f-string to avoid backslash issues
            escaped_script_content = config['script_content'].replace('"', '\\"')
            
            wrapper_script = f"""
const {{ chromium }} = require('playwright');
const fs = require('fs');

async function runWithVncDisplay() {{
    console.log('🚀 Starting custom automation: {config_name}');
    console.log('📺 Browser will be visible in VNC display on port 6080');
    
    // Set up browser args for VNC display
    const browserArgs = [
        '--display=:99',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--start-maximized',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
    ];
    
    // Override headless setting for VNC visibility (force visible unless explicitly headless)
    const context = await chromium.launchPersistentContext('{config['profile_path']}', {{
        headless: {str(headless).lower()},
        viewport: {{ width: 1280, height: 720 }},
        args: browserArgs
    }});
    
    const page = context.pages()[0] || await context.newPage();
    
    try {{
        console.log('🌐 Browser launched and visible in VNC display');
        console.log('👁️  Switch to Browser view in the side panel to see the automation');
        
        // Load and run the user's custom script
        {escaped_script_content}
        
    }} catch (error) {{
        console.error('❌ Automation error:', error);
        throw error;
    }} finally {{
        console.log('🏁 Automation completed, browser context will close in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        await context.close();
    }}
}}

runWithVncDisplay().catch(console.error);
"""
            
            # Write the wrapper script
            wrapper_path = f"{self.scripts_dir}/wrapper_{config_name}.js"
            await self.sandbox.files.write_text(wrapper_path, wrapper_script)
            
            # Run the wrapper script with proper environment
            result = await self.sandbox.process.exec(
                f"cd {self.automation_dir} && DISPLAY=:99 node {wrapper_path}",
                timeout=timeout_seconds
            )

            if result.exit_code == 0:
                return ToolResult(
                    success=True,
                    output=f"✅ Custom automation '{config_name}' completed successfully!\n\n"
                    f"🖥️ **Browser Display**: The automation was visible in the VNC display\n"
                    f"👁️ **View**: Switch to 'Browser' tab in the side panel to see the automation\n\n"
                    f"**Execution Results:**\n"
                    f"```\n{result.output}\n```\n\n"
                    f"**Configuration Used:**\n"
                    f"- Profile: {config['profile_path']}\n"
                    f"- Script: {config['script_path']}\n"
                    f"- Headless: {headless}\n"
                    f"- Timeout: {timeout_seconds}s\n"
                    f"- VNC Display: :99 (accessible via port 6080)"
                )
            else:
                return ToolResult(
                    success=False,
                    output=f"❌ Custom automation '{config_name}' failed\n\n"
                    f"**Error Output:**\n"
                    f"```\n{result.output}\n```\n\n"
                    f"Exit code: {result.exit_code}"
                )

        except Exception as e:
            logger.error(f"Failed to run custom automation: {str(e)}")
            return ToolResult(success=False, output=f"Failed to run automation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "show_browser_display",
            "description": "📺 Launch a browser in the VNC display for testing and configuration. This helps you see the browser automation environment before running custom scripts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Optional URL to navigate to (default: about:blank)",
                        "default": "about:blank"
                    },
                    "duration_seconds": {
                        "type": "integer",
                        "description": "How long to keep the browser open in seconds (default: 60)",
                        "default": 60
                    }
                },
                "required": []
            }
        }
    })
    async def show_browser_display(self, url: str = "about:blank", duration_seconds: int = 60) -> ToolResult:
        """Show browser in VNC display for testing the visual setup."""
        
        try:
            await self._ensure_sandbox()
            
            # Set up environment for VNC display
            env_setup = [
                "export DISPLAY=:99",
                "export CHROME_PATH=/usr/bin/google-chrome",
                "export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
            ]
            
            for cmd in env_setup:
                setup_result = await self.sandbox.process.exec(cmd, timeout=30)
                if setup_result.exit_code != 0:
                    logger.warning(f"Environment setup command failed: {cmd}")
            
            # Create a test browser script
            test_script = f"""
const {{ chromium }} = require('playwright');

async function showBrowser() {{
    console.log('📺 Starting browser display test');
    console.log('👁️  Switch to Browser tab in side panel to see the browser');
    
    const browserArgs = [
        '--display=:99',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--start-maximized'
    ];
    
    const browser = await chromium.launch({{
        headless: false,
        args: browserArgs
    }});
    
    const page = await browser.newPage();
    await page.setViewportSize({{ width: 1280, height: 720 }});
    
    console.log('🌐 Navigating to: {url}');
    await page.goto('{url}');
    
    console.log('⏰ Browser will remain open for {duration_seconds} seconds...');
    console.log('🔄 You can interact with it through the VNC display');
    
    await new Promise(resolve => setTimeout(resolve, {duration_seconds * 1000}));
    
    console.log('🏁 Closing browser');
    await browser.close();
}}

showBrowser().catch(console.error);
"""
            
            # Write and run the test script
            test_path = f"{self.automation_dir}/browser_test.js"
            await self.sandbox.files.write_text(test_path, test_script)
            
            result = await self.sandbox.process.exec(
                f"cd {self.automation_dir} && DISPLAY=:99 node browser_test.js",
                timeout=duration_seconds + 30
            )
            
            if result.exit_code == 0:
                return ToolResult(
                    success=True,
                    output=f"📺 Browser display test completed!\n\n"
                    f"**What happened:**\n"
                    f"- Browser opened at: {url}\n"
                    f"- Displayed for: {duration_seconds} seconds\n"
                    f"- VNC Display: :99 (port 6080)\n\n"
                    f"👁️ **To see browser automation**: Switch to 'Browser' tab in the side panel\n\n"
                    f"**Console output:**\n```\n{result.output}\n```"
                )
            else:
                return ToolResult(
                    success=False,
                    output=f"❌ Browser display test failed\n\n"
                    f"**Error:**\n```\n{result.output}\n```"
                )
            
        except Exception as e:
            logger.error(f"Failed to show browser display: {str(e)}")
            return ToolResult(success=False, output=f"Failed to show browser: {str(e)}")

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
                return ToolResult(success=False, output="User account not found")

            client = await self.db.get_client()
            result = await client.table('custom_automations').select('config_name, description, created_at, updated_at').eq('account_id', account_id).order('created_at', desc=True).execute()

            if not result.data:
                return ToolResult(success=True, output="📝 No custom automation configurations found. Use `configure_custom_automation` to create one.")

            configs_list = []
            for config in result.data:
                configs_list.append(
                    f"**{config['config_name']}**\n"
                    f"  Description: {config.get('description', 'N/A')}\n"
                    f"  Created: {config['created_at']}\n"
                    f"  Updated: {config.get('updated_at', 'N/A')}"
                )

            return ToolResult(
                success=True,
                output=f"📋 **Custom Automation Configurations** ({len(result.data)} found)\n\n" + 
                "\n\n".join(configs_list) + 
                f"\n\n💡 Use `run_custom_automation` with any config name to execute."
            )

        except Exception as e:
            logger.error(f"Failed to list custom automations: {str(e)}")
            return ToolResult(success=False, output=f"Failed to list automations: {str(e)}")
