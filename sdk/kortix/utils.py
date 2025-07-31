import json
import re
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
    chunks = []  # Store chunks to sort by sequence
    parsing_state = "text"  # "text", "in_function_call", "function_call_ended"
    current_function_name = None
    invoke_name_regex = re.compile(r'<invoke\s+name="([^"]+)"')
    
    def rebuild_full_text():
        """Rebuild full text from sorted chunks like the original processor"""
        # Sort chunks by sequence
        sorted_chunks = sorted(chunks, key=lambda c: c.get("sequence", 0))
        
        full_text_parts = []
        for chunk in sorted_chunks:
            content = chunk.get("content", "")
            if content:
                parsed_content = try_parse_json(content)
                if parsed_content and "content" in parsed_content:
                    full_text_parts.append(parsed_content["content"])
        
        return "".join(full_text_parts)
    
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
                # Parse status like the original - merge content with event data
                status_details = try_parse_json(data.get("content", "{}")) or {}
                if data.get("status"):
                    status_details["status_type"] = data["status"]
                if data.get("message"):
                    status_details["message"] = data["message"]
                
                full_status = {**data, **status_details}
                finish_reason = full_status.get("finish_reason", "received")
                status_type = full_status.get("status_type", full_status.get("status", "unknown"))
                print(f"[STATUS] {status_type} {finish_reason}")
                
            elif event_type == "assistant":
                message_id = data.get("message_id")
                sequence = data.get("sequence")
                content = data.get("content", "")
                
                # Assistant chunks (message_id is null, has sequence) - accumulate text
                if message_id is None and sequence is not None:
                    # Add chunk to collection
                    chunks.append(data)
                    
                    # Rebuild full text from all chunks
                    full_text = rebuild_full_text()
                    
                    # Check for function call detection
                    if parsing_state == "text":
                        if "<function_calls>" in full_text:
                            parsing_state = "in_function_call"
                            print("\n[TOOL USE DETECTED]")
                            
                    elif parsing_state == "in_function_call":
                        if current_function_name is None:
                            match = invoke_name_regex.search(full_text)
                            if match:
                                current_function_name = match.group(1)
                                print(f'[TOOL UPDATE] Calling function: "{current_function_name}"')
                                
                        if "</function_calls>" in full_text:
                            parsing_state = "function_call_ended"
                            print("[TOOL USE WAITING]")
                            current_function_name = None
                
                # Complete assistant messages (message_id is not null) - print final message
                elif message_id is not None:
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
                    
                    # Reset state for next message
                    chunks = []
                    parsing_state = "text"
                    current_function_name = None
                        
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