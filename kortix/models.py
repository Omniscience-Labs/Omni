"""
Data models and type definitions for Kortix SDK
"""

from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ModelSettings:
    """Settings for AI model configuration"""
    model_name: str
    enable_thinking: bool = False
    reasoning_effort: str = 'low'  # 'low', 'medium', 'high'
    enable_context_manager: bool = False


@dataclass
class Message:
    """Represents a message in a conversation thread"""
    id: str
    role: str  # 'user', 'assistant', 'tool'
    content: Union[str, List[Dict[str, Any]]]
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class Thread:
    """Represents a conversation thread"""
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AgentRun:
    """Represents an agent execution run"""
    id: str
    thread_id: str
    status: str  # 'running', 'completed', 'failed', 'stopped'
    created_at: datetime
    completed_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass 
class ToolCall:
    """Represents a function/tool call"""
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class ToolResult:
    """Represents the result of a tool execution"""
    tool_call_id: str
    content: str
    is_error: bool = False


@dataclass
class AgentResponse:
    """Response from an agent execution"""
    content: str
    messages: List[Message]
    thread_id: str
    run_id: Optional[str] = None
    status: str = "completed" 