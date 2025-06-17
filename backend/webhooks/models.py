from pydantic import BaseModel
from typing import Dict, Any, Optional, Literal
from datetime import datetime

class WebhookTriggerRequest(BaseModel):
    """Base webhook trigger request."""
    workflow_id: str
    provider: Literal['slack', 'generic'] = 'slack'
    data: Dict[str, Any]
    headers: Optional[Dict[str, str]] = None
    timestamp: Optional[datetime] = None

class SlackEventRequest(BaseModel):
    """Slack event request model."""
    token: Optional[str] = None
    team_id: Optional[str] = None
    api_app_id: Optional[str] = None
    event: Optional[Dict[str, Any]] = None
    type: str
    event_id: Optional[str] = None
    event_time: Optional[int] = None
    authed_users: Optional[list] = None
    challenge: Optional[str] = None

class SlackWebhookPayload(BaseModel):
    """Slack webhook payload after processing."""
    text: str
    user_id: str
    channel_id: str
    team_id: str
    timestamp: str
    event_type: str
    trigger_word: Optional[str] = None

class WebhookExecutionResult(BaseModel):
    """Result of webhook execution."""
    success: bool
    execution_id: Optional[str] = None
    thread_id: Optional[str] = None
    error: Optional[str] = None
    message: str 