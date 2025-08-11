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

    async def _exec_sh(self, command: str, timeout: int = 60) -> Dict[str, Any]:
        await self._ensure_sandbox()
        resp = await self.sandbox.process.exec(f"/bin/sh -c \"{command}\"", timeout=timeout)
        output = getattr(resp, "result", None) or getattr(resp, "output", "") or ""
        return {"exit_code": getattr(resp, "exit_code", 1), "output": output}

    async def _run_in_tmux_background(self, session: str, command: str) -> None:
        await self._ensure_sandbox()
        await self._exec_sh(f"tmux has-session -t {session} 2>/dev/null || tmux new-session -d -s {session}")
        escaped = command.replace('"', '\\"')
        await self._exec_sh(f"tmux send-keys -t {session} \"cd {self.workspace_path} && {escaped}\" C-m")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_web_projects",
            "description": "List all web projects in the workspace directory. Shows Node.js/React/Next.js projects with their types.",
            "parameters": {"type": "object", "properties": {}, "required": []}
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

To create a new project, use create_web_project or execute_command:
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
To run a project, use start_server or execute_command with: cd project-name && npm run dev
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
                    "project_name": {"type": "string", "description": "Name of the project directory to examine"},
                    "max_depth": {"type": "integer", "description": "Maximum depth to traverse (default: 3)", "default": 3}
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
            tree_cmd = (
                f"cd {project_path} && find . -maxdepth {max_depth} -type f -o -type d | "
                "grep -v node_modules | grep -v '\\.next' | grep -v '\\.git' | grep -v 'dist' | sort"
            )
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
1. Use install_dependencies if needed
2. Use start_server (mode='dev' or 'prod')
3. Use expose_port to make it publicly accessible (start_server returns the preview URL)
""")
        except Exception as e:
            logger.error(f"Error getting project structure: {str(e)}", exc_info=True)
            return self.fail_response(f"Error getting project structure: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_web_project",
            "description": "Scaffold a new web project. Supports Next.js (default). Uses cached templates when available for speed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string", "description": "Project directory name to create"},
                    "template": {"type": "string", "description": "Template key (e.g., 'next14-shadcn' or 'next')", "default": "next14-shadcn"},
                    "package_manager": {"type": "string", "description": "Package manager: pnpm|npm", "default": "pnpm"}
                },
                "required": ["project_name"]
            }
        }
    })
    async def create_web_project(self, project_name: str, template: str = "next14-shadcn", package_manager: str = "pnpm") -> ToolResult:
        try:
            await self._ensure_sandbox()
            template_dir = "/opt/templates/next14-shadcn"
            use_template = template.lower() in ["next14-shadcn", "next"]
            exists_check = await self._exec_sh(f"test -d {template_dir} && echo __TEMPLATE__ || echo __NO_TEMPLATE__")
            has_template = "__TEMPLATE__" in exists_check.get("output", "")

            proj_dir = f"{self.workspace_path}/{project_name}"
            already = await self._exec_sh(f"test -e {proj_dir} && echo __EXISTS__ || echo __NEW__")
            if "__EXISTS__" in already.get("output", ""):
                return self.fail_response(f"Path '{project_name}' already exists")

            if use_template and has_template:
                copy = await self._exec_sh(f"cp -R {template_dir} {proj_dir}")
                if copy["exit_code"] != 0:
                    return self.fail_response(f"Failed to copy template: {copy['output']}")
            else:
                if package_manager == "pnpm":
                    scaffold_cmd = (
                        f"cd {self.workspace_path} && "
                        f"pnpm dlx create-next-app@14 {project_name} --ts --eslint --tailwind --app --src-dir --import-alias '@/*' --use-pnpm"
                    )
                else:
                    scaffold_cmd = (
                        f"cd {self.workspace_path} && "
                        f"npx create-next-app@14 {project_name} --ts --eslint --tailwind --app --src-dir --import-alias '@/*' --use-npm"
                    )
                res = await self._exec_sh(scaffold_cmd, timeout=900)
                if res["exit_code"] != 0:
                    return self.fail_response(f"Scaffold failed: {res['output']}")

            if package_manager == "pnpm":
                install = await self._exec_sh(f"cd {proj_dir} && pnpm install --prefer-offline", timeout=900)
            else:
                install = await self._exec_sh(f"cd {proj_dir} && npm install --no-audit --no-fund --progress=false", timeout=900)
            if install["exit_code"] != 0:
                return self.fail_response(f"Dependency install failed: {install['output']}")

            return self.success_response({
                "message": f"Project '{project_name}' created successfully.",
                "project": project_name
            })
        except Exception as e:
            logger.error(f"Error creating web project: {e}", exc_info=True)
            return self.fail_response(f"Error creating web project: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "init_shadcn",
            "description": "Initialize shadcn/ui in a Next.js project (non-interactive).",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string", "description": "Project directory name"}
                },
                "required": ["project_name"]
            }
        }
    })
    async def init_shadcn(self, project_name: str) -> ToolResult:
        try:
            await self._ensure_sandbox()
            proj_dir = f"{self.workspace_path}/{project_name}"
            check = await self._exec_sh(f"test -f {proj_dir}/package.json && echo OK || echo MISS")
            if "MISS" in check.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found")

            src_check = await self._exec_sh(f"test -d {proj_dir}/src && echo YES || echo NO")
            has_src = "YES" in src_check.get("output", "")
            css_rel = "src/app/globals.css" if has_src else "app/globals.css"

            tailwind_cfg_key = ""
            tw_ts = await self._exec_sh(f"test -f {proj_dir}/tailwind.config.ts && echo OK || echo NO")
            if "OK" in tw_ts.get("output", ""):
                tailwind_cfg_key = "  \"config\": \"tailwind.config.ts\",\n"
            else:
                tw_js = await self._exec_sh(f"test -f {proj_dir}/tailwind.config.js && echo OK || echo NO")
                if "OK" in tw_js.get("output", ""):
                    tailwind_cfg_key = "  \"config\": \"tailwind.config.js\",\n"
            heredoc = (
                "cat > components.json << 'JSON'\n" +
                "{\n" +
                "  \"$schema\": \"https://ui.shadcn.com/schema.json\",\n" +
                "  \"style\": \"new-york\",\n" +
                "  \"tailwind\": {\n" +
                (tailwind_cfg_key if tailwind_cfg_key else "") +
                f"    \"css\": \"{css_rel}\",\n" +
                "    \"baseColor\": \"neutral\",\n" +
                "    \"cssVariables\": true\n" +
                "  },\n" +
                "  \"aliases\": {\n" +
                "    \"components\": \"@/components\",\n" +
                "    \"utils\": \"@/lib/utils\"\n" +
                "  }\n" +
                "}\n" +
                "JSON\n"
            )
            write_cfg = await self._exec_sh(f"cd {proj_dir} && {heredoc}")
            if write_cfg.get("exit_code", 1) != 0:
                return self.fail_response(f"Failed to write components.json: {write_cfg.get('output','')}")

            verify = await self._exec_sh(f"test -f {proj_dir}/components.json && echo OK || echo MISS")
            if "OK" in verify.get("output", ""):
                return self.success_response(f"shadcn configured (components.json created) in '{project_name}'.")
            return self.fail_response("components.json was not created as expected")
        except Exception as e:
            logger.error(f"Error initializing shadcn: {e}", exc_info=True)
            return self.fail_response(f"Error initializing shadcn: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_shadcn_components",
            "description": "Add shadcn/ui components to a Next.js project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "components": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Component names, e.g., button, card, form, input, dialog, dropdown-menu"
                    }
                },
                "required": ["project_name", "components"]
            }
        }
    })
    async def add_shadcn_components(self, project_name: str, components: List[str]) -> ToolResult:
        try:
            await self._ensure_sandbox()
            proj_dir = f"{self.workspace_path}/{project_name}"
            check = await self._exec_sh(f"test -f {proj_dir}/package.json && echo OK || echo MISS")
            if "MISS" in check.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found")

            verify = await self._exec_sh(f"test -f {proj_dir}/components.json && echo OK || echo MISS")
            if "MISS" in verify.get("output", ""):
                init_res = await self.init_shadcn(project_name)
                if not init_res.success:
                    return init_res

            comps = " ".join(components)
            attempts = [
                f"cd {proj_dir} && pnpm dlx shadcn@latest add {comps}",
                f"cd {proj_dir} && npx shadcn@latest add {comps}"
            ]
            last = None
            for cmd in attempts:
                res = await self._exec_sh(cmd, timeout=900)
                last = res
                if res["exit_code"] == 0:
                    return self.success_response(f"Added shadcn components to '{project_name}': {', '.join(components)}")

            return self.fail_response(f"Failed to add components: {last.get('output','') if last else ''}")
        except Exception as e:
            logger.error(f"Error adding shadcn components: {e}", exc_info=True)
            return self.fail_response(f"Error adding shadcn components: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "install_dependencies",
            "description": "Install npm packages in a project using pnpm or npm.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "packages": {"type": "array", "items": {"type": "string"}},
                    "dev": {"type": "boolean", "default": False},
                    "package_manager": {"type": "string", "default": "pnpm"}
                },
                "required": ["project_name", "packages"]
            }
        }
    })
    async def install_dependencies(self, project_name: str, packages: List[str], dev: bool = False, package_manager: str = "pnpm") -> ToolResult:
        try:
            await self._ensure_sandbox()
            proj_dir = f"{self.workspace_path}/{project_name}"
            check = await self._exec_sh(f"test -f {proj_dir}/package.json && echo OK || echo MISS")
            if "MISS" in check.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found")
            pkg_list = " ".join(packages)
            if package_manager == "pnpm":
                flag = "-D" if dev else ""
                cmd = f"cd {proj_dir} && pnpm add {flag} {pkg_list} --prefer-offline"
            else:
                flag = "--save-dev" if dev else "--save"
                cmd = f"cd {proj_dir} && npm install {flag} {pkg_list} --no-audit --no-fund --progress=false"
            res = await self._exec_sh(cmd, timeout=900)
            if res["exit_code"] != 0:
                return self.fail_response(f"Package install failed: {res['output']}")
            return self.success_response(f"Installed packages in '{project_name}': {', '.join(packages)}")
        except Exception as e:
            logger.error(f"Error installing dependencies: {e}", exc_info=True)
            return self.fail_response(f"Error installing dependencies: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "build_project",
            "description": "Run production build for the project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "package_manager": {"type": "string", "default": "pnpm"}
                },
                "required": ["project_name"]
            }
        }
    })
    async def build_project(self, project_name: str, package_manager: str = "pnpm") -> ToolResult:
        try:
            await self._ensure_sandbox()
            proj_dir = f"{self.workspace_path}/{project_name}"
            check = await self._exec_sh(f"test -f {proj_dir}/package.json && echo OK || echo MISS")
            if "MISS" in check.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found")
            cmd = f"cd {proj_dir} && {'pnpm' if package_manager=='pnpm' else 'npm'} run build"
            res = await self._exec_sh(cmd, timeout=1800)
            if res["exit_code"] != 0:
                return self.fail_response(f"Build failed: {res['output']}")
            return self.success_response(f"Build completed for '{project_name}'.")
        except Exception as e:
            logger.error(f"Error building project: {e}", exc_info=True)
            return self.fail_response(f"Error building project: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "start_server",
            "description": "Start a server for the project. mode='prod' runs next start after build; mode='dev' runs dev server. Returns exposed preview URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "mode": {"type": "string", "default": "prod", "description": "prod|dev"},
                    "port": {"type": "integer", "default": 3000},
                    "package_manager": {"type": "string", "default": "pnpm"}
                },
                "required": ["project_name"]
            }
        }
    })
    async def start_server(self, project_name: str, mode: str = "prod", port: int = 3000, package_manager: str = "pnpm") -> ToolResult:
        try:
            await self._ensure_sandbox()
            proj_dir = f"{self.workspace_path}/{project_name}"
            check = await self._exec_sh(f"test -f {proj_dir}/package.json && echo OK || echo MISS")
            if "MISS" in check.get("output", ""):
                return self.fail_response(f"Project '{project_name}' not found")

            pm = "pnpm" if package_manager == "pnpm" else "npm"
            if mode == "prod":
                build_check = await self._exec_sh(f"test -d {proj_dir}/.next && echo BUILT || echo NOBUILD")
                if "NOBUILD" in build_check.get("output", ""):
                    build_res = await self._exec_sh(f"cd {proj_dir} && {pm} run build", timeout=1800)
                    if build_res["exit_code"] != 0:
                        return self.fail_response(f"Build failed before start: {build_res['output']}")
                cmd = f"cd {proj_dir} && PORT={port} {pm} run start"
            else:
                cmd = f"cd {proj_dir} && PORT={port} {pm} run dev"
            session_name = f"web_{project_name}_{mode}"
            await self._run_in_tmux_background(session_name, cmd)

            link = await self.sandbox.get_preview_link(port)
            url = link.url if hasattr(link, 'url') else str(link)
            return self.success_response({
                "message": f"Started {mode} server for '{project_name}' on port {port}",
                "url": url,
                "port": port,
                "session": session_name
            })
        except Exception as e:
            logger.error(f"Error starting server: {e}", exc_info=True)
            return self.fail_response(f"Error starting server: {e}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "start_dev_server",
            "description": "Start a development server for the project (alias for start_server with mode=dev). Returns exposed preview URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {"type": "string"},
                    "port": {"type": "integer", "default": 3000},
                    "package_manager": {"type": "string", "default": "pnpm"}
                },
                "required": ["project_name"]
            }
        }
    })
    async def start_dev_server(self, project_name: str, port: int = 3000, package_manager: str = "pnpm") -> ToolResult:
        return await self.start_server(project_name=project_name, mode="dev", port=port, package_manager=package_manager) 