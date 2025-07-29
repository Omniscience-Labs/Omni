from .api.threads import AgentStartRequest
from .thread import Thread, AgentRun
from .tools import AgentPressTools, KortixMCP, KortixTools
from .api.agents import (
    AgentCreateRequest,
    AgentPress_ToolConfig,
    AgentsClient,
    CustomMCP,
    MCPConfig,
)


class Agent:
    def __init__(self, client: AgentsClient, agent_id: str):
        self._client = client
        self._agent_id = agent_id

    async def run(
        self,
        prompt: str,
        thread: Thread,
        model: str = "anthropic/claude-sonnet-4-20250514",
    ):
        await thread.add_message(prompt)
        response = await thread._client.start_agent(
            thread._thread_id,
            AgentStartRequest(
                agent_id=self._agent_id,
                model_name=model,
            ),
        )
        return AgentRun(thread, response.agent_run_id)


class KortixAgent:
    def __init__(self, client: AgentsClient):
        self._client = client

    async def create(
        self, name: str, system_prompt: str, model: str, tools: list[KortixTools] = []
    ) -> Agent:
        agentpress_tools = {}
        custom_mcps: list[CustomMCP] = []
        for tool in tools:
            if isinstance(tool, AgentPressTools):
                agentpress_tools[tool] = AgentPress_ToolConfig(
                    enabled=True, description=tool.get_description()
                )
            elif isinstance(tool, KortixMCP):
                mcp = tool
                custom_mcps.append(
                    CustomMCP(
                        name=mcp.name,
                        type=mcp.type,
                        config=MCPConfig(url=mcp.url),
                        enabled_tools=mcp.enabled_tools,
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
