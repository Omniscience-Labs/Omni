"""
@fileoverview

This file is mostly important for dealing with the content of the streamed data, 
perhaps the frontend if the stream doesn't need to be decoded in the backend.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Callable, Any, Literal, AsyncGenerator
import json
import re
import httpx


def try_parse_json(json_str: str) -> Optional[Any]:
    """Utility function to safely parse JSON strings."""
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return None


@dataclass
class BaseStreamEvent:
    """The base structure for any event coming from the stream."""

    thread_id: str
    type: Literal["status", "assistant", "tool"]
    is_llm_message: bool
    metadata: str  # Often a JSON string
    created_at: str
    updated_at: str
    message_id: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None


@dataclass
class AssistantMessageChunk(BaseStreamEvent):
    """
    Represents a chunk of a streaming assistant message.
    `message_id` is null, and `sequence` is used for ordering.
    """

    sequence: Optional[int] = None

    def __post_init__(self):
        # Ensure message_id is None for chunks and type is assistant
        self.message_id = None
        self.type = "assistant"
        if not self.content:
            self.content = ""


@dataclass
class CompleteMessage(BaseStreamEvent):
    """
    Represents a final, complete message (assistant, tool, or status with an ID).
    `message_id` is a non-null string.
    """

    def __post_init__(self):
        # Ensure message_id is set and content has a default
        if not self.message_id:
            self.message_id = ""
        if not self.content:
            self.content = ""


@dataclass
class AssistantContentChunk:
    """The structure of the content within an AssistantMessageChunk."""

    role: Literal["assistant"]
    content: str


@dataclass
class ProcessedStreamResult:
    """The structured result after processing the stream."""

    final_messages: List[CompleteMessage]
    thread_id: Optional[str] = None
    run_ids: List[str] = field(default_factory=list)


@dataclass
class FunctionCallDetails:
    """Details about a function call in the stream."""

    name: Optional[str] = None
    # We could add `parameters: Optional[str]` here later


@dataclass
class ToolResultContent:
    """The content of a tool result message. The inner `content` is a JSON string."""

    role: Literal["user"]  # Or 'tool', depending on the API spec
    content: str  # A JSON string containing ToolExecutionResult


@dataclass
class ToolExecutionResult:
    """The parsed result of a tool execution."""

    tool_execution: Dict[str, Any]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolExecutionResult":
        return cls(tool_execution=data.get("tool_execution", {}))


@dataclass
class ToolResultMessage(CompleteMessage):
    """Represents a complete tool result message."""

    def __post_init__(self):
        super().__post_init__()
        # Ensure type is tool
        self.type = "tool"


# Type guard functions
def is_assistant_message_chunk(event: Any) -> bool:
    """Type guard to check if an event is a streaming chunk."""
    return (
        hasattr(event, "type")
        and event.type == "assistant"
        and hasattr(event, "message_id")
        and event.message_id is None
        and hasattr(event, "sequence")
        and isinstance(event.sequence, int)
    )


def is_complete_message(event: Any) -> bool:
    """Type guard to check for any complete, final message."""
    return hasattr(event, "message_id") and event.message_id is not None


def is_tool_result_message(event: Any) -> bool:
    """Type guard to specifically identify a tool result message."""
    return (
        hasattr(event, "type")
        and event.type == "tool"
        and hasattr(event, "message_id")
        and event.message_id is not None
    )


# Callback type definitions
OnStreamStartCallback = Callable[[], None]
OnTextUpdateCallback = Callable[[str], None]
OnMessageEndCallback = Callable[[CompleteMessage], None]
OnStatusUpdateCallback = Callable[[Any], None]
OnFunctionCallStartCallback = Callable[[], None]
OnFunctionCallUpdateCallback = Callable[[FunctionCallDetails], None]
OnFunctionCallEndCallback = Callable[[], None]
OnToolResultCallback = Callable[[ToolResultMessage], None]


@dataclass
class RealtimeCallbacks:
    """Callbacks for handling real-time stream events."""

    on_stream_start: Optional[OnStreamStartCallback] = None
    on_text_update: Optional[OnTextUpdateCallback] = None
    on_message_end: Optional[OnMessageEndCallback] = None
    on_status_update: Optional[OnStatusUpdateCallback] = None
    on_function_call_start: Optional[OnFunctionCallStartCallback] = None
    on_function_call_update: Optional[OnFunctionCallUpdateCallback] = None
    on_function_call_end: Optional[OnFunctionCallEndCallback] = None
    on_tool_result: Optional[OnToolResultCallback] = None


ParsingState = Literal["text", "in_function_call", "function_call_ended"]


@dataclass
class StreamState:
    """Internal state for stream processing."""

    chunks: List[AssistantMessageChunk] = field(default_factory=list)
    full_text: str = ""
    parsing_state: ParsingState = "text"
    current_function_call: Optional[FunctionCallDetails] = None


class RealtimeStreamProcessor:
    """
    Example streaming parser for reference.
    Processes real-time stream data with callback support.
    """

    def __init__(self, callbacks: Optional[RealtimeCallbacks] = None):
        self.messages: Dict[str, CompleteMessage] = {}
        self.state = StreamState()
        self.callbacks = callbacks or RealtimeCallbacks()
        self.stream_active = False
        self.invoke_name_regex = re.compile(r'<invoke\s+name="([^"]+)"')

    def _create_default_state(self) -> StreamState:
        """Create a new default state."""
        return StreamState()

    def _start_stream_if_inactive(self) -> None:
        """Start the stream if it's not already active."""
        if not self.stream_active:
            self.stream_active = True
            if self.callbacks.on_stream_start:
                self.callbacks.on_stream_start()

    def _handle_chunk(self, chunk: AssistantMessageChunk) -> None:
        """Handle an incoming assistant message chunk."""
        self._start_stream_if_inactive()

        if not chunk.content:
            return
        chunk_content_data = try_parse_json(chunk.content)
        if not chunk_content_data or "content" not in chunk_content_data:
            return

        chunk_content = chunk_content_data["content"]

        # Use the instance state
        self.state.chunks.append(chunk)

        # Sort chunks by sequence to handle out-of-order delivery
        self.state.chunks.sort(key=lambda c: c.sequence or 0)

        # Rebuild full text from sorted chunks
        full_text_parts = []
        for c in self.state.chunks:
            if c.content is not None:
                content_data = try_parse_json(c.content)
                if content_data and "content" in content_data:
                    full_text_parts.append(content_data["content"])

        self.state.full_text = "".join(full_text_parts)

        self._update_parsing_state(self.state)

        if self.callbacks.on_text_update:
            self.callbacks.on_text_update(self.state.full_text)

    def _update_parsing_state(self, state: StreamState) -> None:
        """Update the parsing state based on current content."""
        if state.parsing_state == "text":
            if "<function_calls>" in state.full_text:
                state.parsing_state = "in_function_call"
                state.current_function_call = FunctionCallDetails(name=None)
                if self.callbacks.on_function_call_start:
                    self.callbacks.on_function_call_start()
                self._update_parsing_state(state)

        elif state.parsing_state == "in_function_call":
            if state.current_function_call and state.current_function_call.name is None:
                match = self.invoke_name_regex.search(state.full_text)
                if match:
                    state.current_function_call.name = match.group(1)
                    if self.callbacks.on_function_call_update:
                        self.callbacks.on_function_call_update(
                            FunctionCallDetails(name=state.current_function_call.name)
                        )

            if "</function_calls>" in state.full_text:
                state.parsing_state = "function_call_ended"
                if self.callbacks.on_function_call_end:
                    self.callbacks.on_function_call_end()
                state.current_function_call = None

        elif state.parsing_state == "function_call_ended":
            pass

    def process_line(self, line: str) -> None:
        """Process a single line from the stream."""
        if not line.startswith("data:"):
            return

        try:
            event_data = try_parse_json(line[5:])  # Remove "data:" prefix
            if not event_data:
                return

            # Convert dict to appropriate object based on type
            if (
                event_data.get("type") == "assistant"
                and event_data.get("message_id") is None
                and "sequence" in event_data
            ):

                chunk = AssistantMessageChunk(
                    message_id=None,
                    thread_id=event_data.get("thread_id", ""),
                    type="assistant",
                    is_llm_message=event_data.get("is_llm_message", False),
                    metadata=event_data.get("metadata", ""),
                    created_at=event_data.get("created_at", ""),
                    updated_at=event_data.get("updated_at", ""),
                    content=event_data.get("content", ""),
                    sequence=event_data.get("sequence"),
                )
                self._handle_chunk(chunk)

            elif (
                event_data.get("type") == "tool"
                and event_data.get("message_id") is not None
            ):

                tool_message = ToolResultMessage(
                    message_id=event_data["message_id"],
                    thread_id=event_data.get("thread_id", ""),
                    type="tool",
                    is_llm_message=event_data.get("is_llm_message", False),
                    metadata=event_data.get("metadata", ""),
                    created_at=event_data.get("created_at", ""),
                    updated_at=event_data.get("updated_at", ""),
                    content=event_data.get("content", ""),
                )
                self._handle_tool_result_message(tool_message)

            elif (
                event_data.get("type") == "assistant"
                and event_data.get("message_id") is not None
            ):

                complete_message = CompleteMessage(
                    message_id=event_data["message_id"],
                    thread_id=event_data.get("thread_id", ""),
                    type="assistant",
                    is_llm_message=event_data.get("is_llm_message", False),
                    metadata=event_data.get("metadata", ""),
                    created_at=event_data.get("created_at", ""),
                    updated_at=event_data.get("updated_at", ""),
                    content=event_data.get("content", ""),
                )
                self._handle_complete_assistant_message(complete_message)

            elif event_data.get("type") == "status" and self.callbacks.on_status_update:

                status_details = try_parse_json(event_data.get("content", "{}")) or {}
                if event_data.get("status"):
                    status_details["status_type"] = event_data["status"]
                if event_data.get("message"):
                    status_details["message"] = event_data["message"]

                # Merge event data with status details
                full_status = {**event_data, **status_details}
                self.callbacks.on_status_update(full_status)

        except Exception as error:
            print(f"Failed to process stream line: {line}, error: {error}")

    def _handle_tool_result_message(self, message: ToolResultMessage) -> None:
        """Handle a tool result message."""
        if message.message_id:
            self.messages[message.message_id] = message
        if self.callbacks.on_tool_result:
            self.callbacks.on_tool_result(message)

    def _handle_complete_assistant_message(self, message: CompleteMessage) -> None:
        """Handle a complete assistant message."""
        if message.message_id:
            self.messages[message.message_id] = message
        if self.callbacks.on_message_end:
            self.callbacks.on_message_end(message)
        self.state = self._create_default_state()
