from .api.threads import ThreadsClient


class Thread:
    def __init__(self, client: ThreadsClient, thread_id: str):
        self._client = client
        self._thread_id = thread_id

    async def add_message(self, message: str):
        pass


class KortixThread:
    def __init__(self, client: ThreadsClient):
        self._client = client

    async def create(self) -> Thread:
        pass

    async def get(self, thread_id: str) -> Thread:
        return Thread(self._client, thread_id)
