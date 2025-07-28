import os
import asyncio
from .config import global_config
from .agent import Agent
from .tools.fastmcp import FastMCP


global_config.set_api_key(
    os.getenv("KORTIX_API_KEY", "af3d6952-2109-4ab3-bbfe-4a2e2326c740")
)
global_config.set_api_url(os.getenv("KORTIX_API_URL", "http://localhost:8000/api"))

mcp = FastMCP("Demo 🚀")


@mcp.tool
def get_weather(city: str) -> str:
    return f"The weather in {city} is sunny"


async def main():
    # Create agent with tools
    agent = Agent(
        name="Weather Agent",
        instructions="Help users get weather information",
        model="anthropic/claude-sonnet-4-20250514",
        tools=[mcp],
    )
    
    result = await agent.run("What's the weather in Paris?")
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
