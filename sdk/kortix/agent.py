from .models import Tool
from .thread import Thread
from .tools import AgentPressTools, KortixTools
from .api.agents import (
    AgentCreateRequest,
    AgentPress_Tools,
    AgentPress_ToolConfig,
    AgentsClient,
    CustomMCP,
    MCPConfig,
)


class Agent:
    def __init__(self, client: AgentsClient, agent_id: str):
        self._client = client
        self._agent_id = agent_id

    async def run(self, prompt: str, thread: Thread):
        # TODO finish this
        pass


class KortixAgent:
    def __init__(self, client: AgentsClient):
        self._client = client

    async def create(
        self, name: str, system_prompt: str, model: str, tools: list[KortixTools] = []
    ) -> Agent:
        agentpress_tools = AgentPress_Tools()
        custom_mcps: list[CustomMCP] = []
        for tool in tools:
            if isinstance(tool, AgentPressTools):
                agentpress_tools[tool] = AgentPress_ToolConfig(
                    enabled=True, description=tool.get_description()
                )
            elif isinstance(tool, Tool):
                custom_mcps.append(
                    CustomMCP(
                        name=tool.name,
                        type="http",
                        config=MCPConfig(url=tool.url),
                        enabled_tools=[tool.name],
                    )
                )
            else:
                raise ValueError(f"Unknown tool type: {type(tool)}")

        agent = await self._client.create_agent(
            AgentCreateRequest(
                name=name,
                system_prompt=system_prompt,
                custom_mcps=custom_mcps,
                agentpress_tools=agentpress_tools,
            )
        )

        return Agent(self._client, agent.agent_id)

    async def get(self, agent_id: str) -> Agent:
        agent = await self._client.get_agent(agent_id)
        return Agent(self._client, agent.agent_id)
