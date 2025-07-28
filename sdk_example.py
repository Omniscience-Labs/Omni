import asyncio
import os
import kortix

kortix.set_api_key(os.getenv("KORTIX_API_KEY"))
kortix.set_base_url(os.getenv("KORTIX_BASE_URL"))

mcp = kortix.FastMCP("Weather tools")
mcp.set_api_base(os.getenv("MCP_BASE_URL", "http://localhost:4000"))  # Publicly accessible API base URL
mcp.set_api_key(os.getenv("MCP_API_KEY"))  # Used for authentication with MCP

# Need to do this somewhere and expose it on MCP_BASE_URL
# mcp.run(port=4000, host="0.0.0.0")


@mcp.tool
async def get_weather(city: str) -> str:
    return f"The weather in {city} is sunny."

async def get_weather_agent():
    weather_agent_id = await db.get("weather_agent_id")
    if not weather_agent_id:
        agent = await kortix.Agent.create(
            tools=[mcp.tools["get_weather"]],
            # TODO: have full control over what exact tools are given to the agent
            mcp=[mcp],
            system_prompt="You are a weather agent. You are given a city and you need to return the weather in that city.",
            model="gpt-4o-mini",
            name="Weather Agent",
        )
        # SDK user has to store these in their DB somewhere again
        debug(agent.id, agent.created_at)
        await db.set("weather_agent_id", agent.id)
    else:
        agent = await kortix.Agent.get(weather_agent_id)
    return agent


async def get_thread():
    thread_id = await db.get("thread_id")
    if not thread_id:
        thread = await kortix.Thread.create()
        debug(thread.id, thread.messages, thread.agent_runs)
        await db.set("thread_id", thread.id)
    else:
        thread = await kortix.Thread.get(thread_id)
    return thread


async def main():
    # We'll expose whatever the current UI allows the user to do, just with an SDK
    # It'll have to work the exact same way. Basically like interacting with the UI with code
    agent = await get_weather_agent()

    agent.add_tools()
    agent.toggle_tool("get_weather")
    thread = await get_thread()

    response = await agent.run("What is the weather in Tokyo?", thread=thread)
    # The agent runs fully until the task is complete and returns the final response from LLM
    print(response)


if __name__ == "__main__":
    asyncio.run(main())
