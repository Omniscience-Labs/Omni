import asyncio
import json
import os
from typing import Any, Optional
from dotenv import load_dotenv
from fastmcp import FastMCP


from .kortix import Kortix
from .tools import AgentPressTools, KortixMCP
from .stream import RealtimeStreamProcessor, RealtimeCallbacks

load_dotenv("../.env")


# Local key-value store for storing agent and thread IDs
class LocalKVStore:
    def __init__(self, filename: str = ".kvstore.json"):
        self.filename = filename
        self._data = {}
        self._load()

    def _load(self):
        if os.path.exists(self.filename):
            try:
                with open(self.filename, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception:
                self._data = {}
        else:
            self._data = {}

    def _save(self):
        with open(self.filename, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2)

    def get(self, key: str, default: Optional[Any] = None) -> Any:
        return self._data.get(key, default)

    def set(self, key: str, value: Any):
        self._data[key] = value
        self._save()

    def delete(self, key: str):
        if key in self._data:
            del self._data[key]
            self._save()

    def clear(self):
        self._data = {}
        self._save()


kv = LocalKVStore()


mcp = FastMCP(name="Kortix")


@mcp.tool
async def get_weather(city: str) -> str:
    return f"The weather in {city} is windy."


async def main():
    """
    Please ignore the asyncio.exceptions.CancelledError that is thrown when the MCP server is stopped. I couldn't fix it.
    """

    kortixMCP = KortixMCP(mcp, "http://localhost:4000/mcp/")
    await kortixMCP.initialize()

    # Start the MCP server in the background
    asyncio.create_task(
        mcp.run_http_async(
            show_banner=False, log_level="error", host="0.0.0.0", port=4000
        )
    )

    kortix = Kortix(
        os.getenv("KORTIX_API_KEY", "pk_xxx:sk_xxx"),
        "http://localhost:8000/api",
    )

    # Setup the agent
    agent_id = kv.get("agent_id")
    if not agent_id:
        agent = await kortix.Agent.create(
            name="Generic Agent",
            system_prompt="You are a generic agent. You can use the tools provided to you to answer questions.",
            model="anthropic/claude-sonnet-4-20250514",
            tools=[AgentPressTools.WEB_SEARCH_TOOL, kortixMCP],
        )
        kv.set("agent_id", agent._agent_id)
    else:
        agent = await kortix.Agent.get(agent_id)

    # Setup the thread
    thread_id = kv.get("thread_id")
    if not thread_id:
        thread = await kortix.Thread.create()
        kv.set("thread_id", thread._thread_id)
    else:
        thread = await kortix.Thread.get(thread_id)

    # Run the agent
    agent_run = await agent.run("What is the weather in Bangalore?", thread)

    stream = await agent_run.get_stream()

    processor = RealtimeStreamProcessor(
        callbacks=RealtimeCallbacks(
            # on_text_update=lambda full_text: print(f"[TEXT] {full_text}"), # Uncomment to see each chunk coming in
            on_status_update=lambda status: print(
                f"[STATUS] {status.get('status_type', status.get('status', 'unknown'))}"
            ),
            on_function_call_start=lambda: print("\n[TOOL USE DETECTED]"),
            on_function_call_update=lambda details: print(
                f'[TOOL UPDATE] Calling function: "{details.name}"'
            ),
            on_tool_result=lambda message: print(f"[TOOL RESULT] {message.content}"),
            on_message_end=lambda message: print(f"[MESSAGE] {message.content}"),
        )
    )

    async for line in stream:
        processor.process_line(line)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except:
        exit(0)
