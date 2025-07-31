import json
from typing import AsyncGenerator


async def print_stream(stream: AsyncGenerator[str, None]):
    """
    Simple stream printer that processes async string generator.
    Prints different types of stream events with basic formatting.
    """
    async for line in stream:
        line = line.strip()

        # Skip empty lines
        if not line:
            continue

        # Parse stream data lines
        if line.startswith("data: "):
            json_str = line[6:]  # Remove "data: " prefix

            try:
                data = json.loads(json_str)
                event_type = data.get("type", "unknown")

                if event_type == "status":
                    status = data.get("status", "unknown")
                    message = data.get("message", "")
                    finish_reason = data.get("finish_reason", "")

                    if status == "starting":
                        print("🔄 Stream starting...")
                    elif status == "completed":
                        print(
                            f"✅ Stream completed ({finish_reason})"
                            if finish_reason
                            else "✅ Stream completed"
                        )
                    elif status == "error":
                        print(f"❌ Stream error: {message}")
                    else:
                        print(f"📋 Status: {status}")

                elif event_type == "assistant":
                    content = data.get("content", "")
                    if content:
                        try:
                            # Parse the nested JSON content
                            content_data = json.loads(content)
                            assistant_content = content_data.get("content", "")
                            if assistant_content:
                                print(f"🤖 Assistant: {assistant_content}")
                        except json.JSONDecodeError:
                            print(f"🤖 Assistant: {content}")

                elif event_type == "tool":
                    content = data.get("content", "")
                    if content:
                        try:
                            content_data = json.loads(content)
                            tool_content = content_data.get("content", "")
                            if tool_content:
                                tool_data = json.loads(tool_content)
                                tool_execution = tool_data.get("tool_execution", {})
                                function_name = tool_execution.get(
                                    "function_name", "unknown"
                                )
                                result = tool_execution.get("result", {})
                                success = result.get("success", False)

                                if success:
                                    output = result.get("output", {})
                                    print(
                                        f"🔧 Tool {function_name}: Success - {output}"
                                    )
                                else:
                                    error = result.get("error", {})
                                    print(f"🔧 Tool {function_name}: Error - {error}")
                        except json.JSONDecodeError:
                            print(f"🔧 Tool: {content}")

                else:
                    print(f"📄 {event_type}: {data}")

            except json.JSONDecodeError:
                print(f"❓ Invalid JSON: {line}")
        else:
            # Non-data lines (headers, etc.)
            if line and not line.startswith(":"):  # Skip SSE comments
                print(f"📝 {line}")
