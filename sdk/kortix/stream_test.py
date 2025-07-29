import asyncio
import json
from .stream import (
    RealtimeStreamProcessor,
    RealtimeCallbacks,
    CompleteMessage,
    ToolResultMessage,
)
from .stream import try_parse_json


# Load the example stream data from the file
def load_example_stream_text():
    try:
        with open("./kortix/example_stream.txt", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        print("Warning: example_stream.txt not found, using fallback data")
        return """data: {"type": "status", "status": "starting", "message": "Agent is starting"}
data: {"type": "assistant", "message_id": null, "thread_id": "thread_123", "is_llm_message": true, "metadata": "", "created_at": "2024-01-01T10:00:00Z", "updated_at": "2024-01-01T10:00:00Z", "content": "{\\"role\\": \\"assistant\\", \\"content\\": \\"Hello! I can help you with\\"}", "sequence": 1}
data: {"type": "status", "status": "completed", "finish_reason": "completed"}"""


EXAMPLE_STREAM_TEXT = load_example_stream_text()


async def test_realtime_stream_processor():
    """Test the RealtimeStreamProcessor with sample stream data."""
    print("Starting test...")

    def on_stream_start():
        print("[STREAM START]")

    def on_text_update(full_text: str):
        # Uncomment to see text updates
        # print(f"\r[TEXT] {full_text}")
        pass

    def on_status_update(status: dict):
        finish_reason = status.get("finish_reason", "received")
        status_type = status.get("status_type", status.get("status", "unknown"))
        print(f"[STATUS] {status_type} {finish_reason}")

    def on_function_call_start():
        print("\n[TOOL USE DETECTED]")

    def on_function_call_update(details):
        if details.name:
            print(f'[TOOL UPDATE] Calling function: "{details.name}"')

    def on_tool_result(message: ToolResultMessage):
        if not message.content:
            print(f"[TOOL RESULT] No content in message")
            return

        content = try_parse_json(message.content)
        if not content:
            print(f"[TOOL RESULT] Failed to parse message content")
            return

        content_str = content.get("content", "")
        if not content_str:
            print(f"[TOOL RESULT] No content string in parsed content")
            return

        execution_result = try_parse_json(content_str)
        if not execution_result:
            print(f"[TOOL RESULT] Failed to parse execution result")
            return

        tool_execution = execution_result.get("tool_execution", {})
        tool_name = tool_execution.get("function_name")
        result = tool_execution.get("result", {})
        was_success = result.get("success", False)
        output = json.dumps(result.get("output", {}))
        error = json.dumps(result.get("error", {}))

        msg = f'[TOOL RESULT] Message ID: {message.message_id} | Tool: "{tool_name}" | '
        if was_success:
            output_preview = output[:80] + "..." if len(output) > 80 else output
            if output_preview == "{}":
                output_preview = "No answer found."
            msg += f"Success! Output: {output_preview}"
        else:
            msg += f"Failure! Error: {error}"
        print(msg)

    def on_function_call_end():
        print("[TOOL USE WAITING]")

    def on_message_end(full_message: CompleteMessage):
        print()  # New line
        if not full_message.content:
            print(f"[MESSAGE] No content in message")
            return

        content = try_parse_json(full_message.content)
        if content:
            role = content.get("role", "unknown")
            message_content = content.get("content", "")
            preview = (
                message_content[:100] + "..."
                if len(message_content) > 100
                else message_content
            )
            print(f"[MESSAGE] {role}: {preview}")
        else:
            print(f"[MESSAGE] Failed to parse message content")

    # Create the processor with callbacks
    callbacks = RealtimeCallbacks(
        on_stream_start=on_stream_start,
        on_text_update=on_text_update,
        on_status_update=on_status_update,
        on_function_call_start=on_function_call_start,
        on_function_call_update=on_function_call_update,
        on_tool_result=on_tool_result,
        on_function_call_end=on_function_call_end,
        on_message_end=on_message_end,
    )

    processor = RealtimeStreamProcessor(callbacks=callbacks)

    # Process the stream line by line
    lines = EXAMPLE_STREAM_TEXT.strip().split("\n")

    for line in lines:
        await asyncio.sleep(0.001)  # Small delay to simulate streaming
        processor.process_line(line)

    print("\nTest completed successfully!")


# Run the test
if __name__ == "__main__":
    asyncio.run(test_realtime_stream_processor())
