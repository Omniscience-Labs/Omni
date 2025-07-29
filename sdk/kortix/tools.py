from typing import Union
from enum import Enum
from fastmcp import FastMCP


class KortixMCP:
    async def create(self, endpoint: str, mcp: FastMCP):
        self._fastmcp = mcp
        self.url = endpoint
        self.name = mcp.name
        self.type = "http"
        self.enabled_tools: list[str] = []
        tools = await mcp.get_tools()
        for tool in tools.values():
            if tool.enabled:
                self.enabled_tools.append(tool.name)
        return self


_AgentPressTools_descriptions = {
    "sb_files_tool": "Read, write, and edit files",
    "sb_shell_tool": "Execute shell commands",
    "sb_deploy_tool": "Deploy web applications",
    "sb_expose_tool": "Expose local services to the internet",
    "sb_vision_tool": "Analyze and understand images",
    "sb_browser_tool": "Browse websites and interact with web pages",
    "web_search_tool": "Search the web for information",
    "sb_image_edit_tool": "Edit and manipulate images",
    "data_providers_tool": "Access structured data from various providers",
}


class AgentPressTools(str, Enum):
    SB_FILES_TOOL = "sb_files_tool"
    SB_SHELL_TOOL = "sb_shell_tool"
    SB_DEPLOY_TOOL = "sb_deploy_tool"
    SB_EXPOSE_TOOL = "sb_expose_tool"
    SB_VISION_TOOL = "sb_vision_tool"
    SB_BROWSER_TOOL = "sb_browser_tool"
    WEB_SEARCH_TOOL = "web_search_tool"
    DATA_PROVIDERS_TOOL = "data_providers_tool"

    def get_description(self) -> str:
        global _AgentPressTools_descriptions
        desc = _AgentPressTools_descriptions.get(self.value)
        if not desc:
            raise ValueError(f"No description found for {self.value}")
        return desc


KortixTools = Union[AgentPressTools, KortixMCP]
