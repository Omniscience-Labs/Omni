import json
import asyncio
from typing import Optional, List, Dict, Any
from pathlib import Path
import time
from uuid import uuid4

from agentpress.tool import ToolResult, openapi_schema, usage_example
from agentpress.thread_manager import ThreadManager
from sandbox.tool_base import SandboxToolsBase
from utils.logger import logger


class SandboxWebDevTool(SandboxToolsBase):
    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self._sessions: Dict[str, str] = {}
        self.workspace_path = "/workspace"
    
    async def _ensure_session(self, session_name: str = "default") -> str:
        if session_name not in self._sessions:
            session_id = str(uuid4())
            try:
                await self._ensure_sandbox()
                await self.sandbox.process.create_session(session_id)
                self._sessions[session_name] = session_id
            except Exception as e:
                raise RuntimeError(f"Failed to create session: {str(e)}")
        return self._sessions[session_name]
    
    async def _execute_command(self, command: str, timeout: int = 60) -> Dict[str, Any]:
        session_id = await self._ensure_session("web_dev_commands")
        from daytona_sdk import SessionExecuteRequest
        req = SessionExecuteRequest(
            command=command,
            var_async=False,
            cwd=self.workspace_path
        )
        
        response = await self.sandbox.process.execute_session_command(
            session_id=session_id,
            req=req,
            timeout=timeout
        )
        
        logs = await self.sandbox.process.get_session_command_logs(
            session_id=session_id,
            command_id=response.cmd_id
        )
        
        return {
            "output": logs,
            "exit_code": response.exit_code
        }
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_web_projects",
            "description": "List all web projects in the workspace directory. Shows Node.js/React/Next.js projects with their types.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    @usage_example('''
        <!-- List all web projects in the workspace -->
        <function_calls>
        <invoke name="list_web_projects">
        </invoke>
        </function_calls>
        ''')
    async def list_web_projects(self) -> ToolResult:
        try:
            await self._ensure_sandbox()
            
            list_cmd = f"ls -la {self.workspace_path} | grep ^d | awk '{{print $NF}}' | grep -v '^\\.$' | grep -v '^\\.\\.\\$'"
            result = await self._execute_command(list_cmd)
            
            output = result.get("output", "")
            if result.get("exit_code") != 0 or not output:
                list_cmd = f"ls -d {self.workspace_path}/*/ 2>/dev/null | xargs -n1 basename 2>/dev/null || echo 'No projects found'"
                result = await self._execute_command(list_cmd)
                output = result.get("output", "")
            
            projects = output.strip().split('\n') if output else []
            projects = [p for p in projects if p and p != 'No projects found']
            
            if not projects:
                return self.success_response("""
📁 No projects found in workspace.

To create a new project, use execute_command:
- Next.js: npx create-next-app@latest my-next-app --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
- React: npx create-react-app my-app --template typescript
- Vite: npm create vite@latest my-app -- --template react-ts
""")
            
            project_info = []
            for project in projects:
                package_check = f"test -f {self.workspace_path}/{project}/package.json && echo '__HAS_PACKAGE__' || echo '__NO_PACKAGE__'"
                package_result = await self._execute_command(package_check)
                
                if "__HAS_PACKAGE__" in package_result.get("output", ""):
                    cat_cmd = f"cat {self.workspace_path}/{project}/package.json 2>/dev/null | grep -E '\"(next|react|vite)\"' | head -1"
                    cat_result = await self._execute_command(cat_cmd)
                    
                    project_type = "Node.js project"
                    if "next" in cat_result.get("output", "").lower():
                        project_type = "Next.js project"
                    elif "react" in cat_result.get("output", "").lower():
                        project_type = "React project"
                    elif "vite" in cat_result.get("output", "").lower():
                        project_type = "Vite project"
                    
                    project_info.append(f"  📦 {project} ({project_type})")
                else:
                    project_info.append(f"  📁 {project} (Directory)")
            
            return self.success_response(f"""
📁 Projects found in workspace:

{chr(10).join(project_info)}

Total: {len(projects)} project(s)

Use 'get_project_structure' to view project files.
To run a project, use execute_command with: cd project-name && npm run dev
""")
            
        except Exception as e:
            logger.error(f"Error listing projects: {str(e)}", exc_info=True)
            return self.fail_response(f"Error listing projects: {str(e)}")
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_project_structure",
            "description": "Get the file structure of a web project, showing important files and directories.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {
                        "type": "string",
                        "description": "Name of the project directory to examine"
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "Maximum depth to traverse (default: 3)",
                        "default": 3
                    }
                },
                "required": ["project_name"]
            }
        }
    })
    @usage_example('''
        <!-- Get structure of a project -->
        <function_calls>
        <invoke name="get_project_structure">
        <parameter name="project_name">my-app</parameter>
        </invoke>
        </function_calls>
        ''')
    async def get_project_structure(self, project_name: str, max_depth: int = 3) -> ToolResult:
        try:
            await self._ensure_sandbox()
            
            project_path = f"{self.workspace_path}/{project_name}"
            
            check_cmd = f"test -d {project_path} && echo '__DIR_EXISTS__' || echo '__DIR_MISSING__'"
            check_result = await self._execute_command(check_cmd)
            if "__DIR_MISSING__" in check_result.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found.")
            
            tree_cmd = f"cd {project_path} && find . -maxdepth {max_depth} -type f -o -type d | grep -v node_modules | grep -v '\\.next' | grep -v '\\.git' | grep -v 'dist' | sort"
            tree_result = await self._execute_command(tree_cmd)
            
            if tree_result.get("exit_code") != 0:
                return self.fail_response(f"Failed to get project structure: {tree_result.get('output')}")
            
            structure = tree_result.get("output", "")
            
            package_info = ""
            package_cmd = f"test -f {project_path}/package.json && cat {project_path}/package.json | grep -E '\"(name|version|scripts)\"' -A 5 | head -20"
            package_result = await self._execute_command(package_cmd)
            if package_result.get("exit_code") == 0:
                package_info = f"\n\n📋 Package.json info:\n{package_result.get('output', '')}"
            
            return self.success_response(f"""
📁 Project structure for '{project_name}':

{structure}
{package_info}

To run this project:
1. Use execute_command: cd {project_name} && npm install (if needed)
2. Use execute_command: cd {project_name} && npm run dev
3. Use expose_port to make it publicly accessible
""")
            
        except Exception as e:
            logger.error(f"Error getting project structure: {str(e)}", exc_info=True)
            return self.fail_response(f"Error getting project structure: {str(e)}") 