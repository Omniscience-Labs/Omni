import json
from typing import AsyncGenerator, Optional, Any


def try_parse_json(json_str: str) -> Optional[Any]:
    """Utility function to safely parse JSON strings."""
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return None


async def print_stream(stream: AsyncGenerator[str, None]):
    """
    Simple stream printer that processes async string generator.
    Follows the same output format as stream_test.py.
    """
    stream_started = False
    
    async for line in stream:
        line = line.strip()
        
        # Skip empty lines
        if not line:
            continue
            
        # Parse stream data lines
        if line.startswith("data: "):
            json_str = line[6:]  # Remove "data: " prefix
            
            data = try_parse_json(json_str)
            if not data:
                continue
                
            event_type = data.get("type", "unknown")
            
            # Print stream start on first event
            if not stream_started:
                print("[STREAM START]")
                stream_started = True
            
            if event_type == "status":
                finish_reason = data.get("finish_reason", "received")
                status_type = data.get("status_type", data.get("status", "unknown"))
                print(f"[STATUS] {status_type} {finish_reason}")
                
            elif event_type == "assistant":
                # Handle assistant messages - print at end of message
                content = data.get("content", "")
                if content:
                    parsed_content = try_parse_json(content)
                    if parsed_content:
                        role = parsed_content.get("role", "unknown")
                        message_content = parsed_content.get("content", "")
                        preview = (
                            message_content[:100] + "..."
                            if len(message_content) > 100
                            else message_content
                        )
                        print()  # New line
                        print(f"[MESSAGE] {role}: {preview}")
                    else:
                        print()  # New line
                        print(f"[MESSAGE] Failed to parse message content")
                        
            elif event_type == "tool":
                # Handle tool results
                message_id = data.get("message_id")
                content = data.get("content", "")
                
                if not content:
                    print(f"[TOOL RESULT] No content in message")
                    continue

                parsed_content = try_parse_json(content)
                if not parsed_content:
                    print(f"[TOOL RESULT] Failed to parse message content")
                    continue

                content_str = parsed_content.get("content", "")
                if not content_str:
                    print(f"[TOOL RESULT] No content string in parsed content")
                    continue

                execution_result = try_parse_json(content_str)
                if not execution_result:
                    print(f"[TOOL RESULT] Failed to parse execution result")
                    continue

                tool_execution = execution_result.get("tool_execution", {})
                tool_name = tool_execution.get("function_name")
                result = tool_execution.get("result", {})
                was_success = result.get("success", False)
                output = json.dumps(result.get("output", {}))
                error = json.dumps(result.get("error", {}))

                msg = f'[TOOL RESULT] Message ID: {message_id} | Tool: "{tool_name}" | '
                if was_success:
                    output_preview = output[:80] + "..." if len(output) > 80 else output
                    if output_preview == "{}":
                        output_preview = "No answer found."
                    msg += f"Success! Output: {output_preview}"
                else:
                    msg += f"Failure! Error: {error}"
                print(msg)