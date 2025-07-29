import asyncio
import json
import os
from typing import Any, Optional


from _kortix import Kortix


class LocalKVStore:
    def __init__(self, filename: str = "kvstore.json"):
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


async def main():
    kortix = Kortix("af3d6952-2109-4ab3-bbfe-4a2e2326c740", "http://localhost:8000/api")

    agent_id = kv.get("agent_id")
    if not agent_id:
        agent = await kortix.Agent.create(
            name="Test Agent",
            system_prompt="You are a test agent. You only respond with 'Hello, world!'",
            model="gpt-4o-mini",
        )
        kv.set("agent_id", agent._agent_id)
    else:
        agent = await kortix.Agent.get(agent_id)

    thread_id = kv.get("thread_id")
    if not thread_id:
        thread = await kortix.Thread.create()
        kv.set("thread_id", thread._thread_id)
    else:
        thread = await kortix.Thread.get(thread_id)

    agent_run = await agent.run("What is the weather in Tokyo?", thread)

    stream = await agent_run.get_stream()

    async for line in stream:
        print(line)


if __name__ == "__main__":
    asyncio.run(main())
