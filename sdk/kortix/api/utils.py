from typing import AsyncGenerator
import httpx


async def stream_from_url(url: str, **kwargs) -> AsyncGenerator[str, None]:
    """
    Helper function that takes a URL and returns an async generator yielding lines.

    Args:
        url: The URL to stream from
        **kwargs: Additional arguments to pass to httpx.AsyncClient.stream()

    Yields:
        str: Each line from the streaming response
    """
    async with httpx.AsyncClient() as client:
        async with client.stream("GET", url, **kwargs) as response:
            response.raise_for_status()

            async for line in response.aiter_lines():
                if line.strip():  # Only yield non-empty lines
                    yield line.strip()
