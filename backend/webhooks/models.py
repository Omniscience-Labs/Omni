from pydantic import BaseModel
from typing import Dict, Any, Optional, Literal
from datetime import datetime

class WebhookTriggerRequest(BaseModel):
    """Base webhook trigger request."""
    workflow_id: str
    provider: Literal['slack', 'telegram', 'generic'] = 'slack'
    data: Dict[str, Any]
    headers: Optional[Dict[str, str]] = None
    timestamp: Optional[datetime] = None

class SlackEventRequest(BaseModel):
    """Slack event request model."""
    token: Optional[str] = None
    team_id: Optional[str] = None
    api_app_id: Optional[str] = None
    event: Optional[Dict[str, Any]] = None
    type: Optional[str] = None
    event_id: Optional[str] = None
    event_time: Optional[int] = None
    authed_users: Optional[list] = None
    challenge: Optional[str] = None

class TelegramUpdateRequest(BaseModel):
    """Telegram update request model."""
    update_id: int
    message: Optional[Dict[str, Any]] = None
    edited_message: Optional[Dict[str, Any]] = None
    channel_post: Optional[Dict[str, Any]] = None
    edited_channel_post: Optional[Dict[str, Any]] = None
    inline_query: Optional[Dict[str, Any]] = None
    chosen_inline_result: Optional[Dict[str, Any]] = None
    callback_query: Optional[Dict[str, Any]] = None

class SlackWebhookPayload(BaseModel):
    """Slack webhook payload after processing."""
    text: str
    user_id: str
    channel_id: str
    team_id: str
    timestamp: str
    event_type: str
    trigger_word: Optional[str] = None

class TelegramWebhookPayload(BaseModel):
    """Telegram webhook payload after processing."""
    text: str
    user_id: str
    chat_id: str
    message_id: int
    timestamp: int
    update_type: str
    user_first_name: Optional[str] = None
    user_last_name: Optional[str] = None
    user_username: Optional[str] = None
    chat_type: Optional[str] = None
    chat_title: Optional[str] = None

class WebhookExecutionResult(BaseModel):
    """Result of webhook execution."""
    success: bool
    execution_id: Optional[str] = None
    thread_id: Optional[str] = None
    error: Optional[str] = None
    message: str 