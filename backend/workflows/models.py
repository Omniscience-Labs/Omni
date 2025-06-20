from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional, Literal, Union
from datetime import datetime

class ScheduleConfig(BaseModel):
    """Configuration for scheduled workflow triggers."""
    cron_expression: Optional[str] = None
    interval_type: Optional[Literal['minutes', 'hours', 'days', 'weeks']] = None
    interval_value: Optional[int] = None
    timezone: str = "UTC"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    enabled: bool = True

class SlackWebhookConfig(BaseModel):
    """Configuration for Slack webhook integration."""
    webhook_url: str
    signing_secret: str
    channel: Optional[str] = None
    username: Optional[str] = None

class TelegramWebhookConfig(BaseModel):
    """Configuration for Telegram webhook integration."""
    webhook_url: str
    bot_token: str
    secret_token: Optional[str] = None

class GenericWebhookConfig(BaseModel):
    """Configuration for generic webhook integration."""
    url: str
    headers: Optional[Dict[str, str]] = None
    auth_token: Optional[str] = None

class WebhookConfig(BaseModel):
    """Configuration for webhook triggers."""
    type: Literal['slack', 'telegram', 'generic'] = 'slack'
    method: Optional[Literal['POST', 'GET', 'PUT']] = 'POST'
    authentication: Optional[Literal['none', 'api_key', 'bearer']] = 'none'
    slack: Optional[SlackWebhookConfig] = None
    telegram: Optional[TelegramWebhookConfig] = None
    generic: Optional[GenericWebhookConfig] = None

class InputNodeConfig(BaseModel):
    """Configuration for workflow input nodes."""
    prompt: str = ""
    trigger_type: Literal['MANUAL', 'WEBHOOK', 'SCHEDULE'] = 'MANUAL'
    webhook_config: Optional[Union[WebhookConfig, Dict[str, Any]]] = None
    schedule_config: Optional[ScheduleConfig] = None
    variables: Optional[Dict[str, Any]] = None

class WorkflowStep(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: Literal['TOOL', 'MCP_TOOL', 'CONDITION', 'LOOP', 'PARALLEL', 'WAIT', 'WEBHOOK', 'TRANSFORM', 'INPUT']
    config: Dict[str, Any]
    next_steps: List[str]
    error_handler: Optional[str] = None

class WorkflowTrigger(BaseModel):
    type: Literal['MANUAL', 'SCHEDULE', 'WEBHOOK', 'EVENT']
    config: Dict[str, Any]

class WorkflowDefinition(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    steps: List[WorkflowStep]
    entry_point: str
    triggers: List[WorkflowTrigger]
    state: Literal['DRAFT', 'ACTIVE', 'PAUSED'] = 'DRAFT'
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    project_id: str
    agent_id: Optional[str] = None
    is_template: bool = False
    max_execution_time: int = 3600
    max_retries: int = 3

class WorkflowExecution(BaseModel):
    id: Optional[str] = None
    workflow_id: str
    status: Literal['pending', 'running', 'completed', 'failed', 'cancelled'] = 'pending'
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    trigger_type: str
    trigger_data: Optional[Dict[str, Any]] = None
    variables: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class WorkflowNode(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: Dict[str, Any]

class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    type: Optional[str] = None
    animated: Optional[bool] = None
    label: Optional[str] = None

class WorkflowFlow(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    metadata: Dict[str, Any]

class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    project_id: str
    agent_id: Optional[str] = None
    is_template: bool = False
    max_execution_time: int = 3600
    max_retries: int = 3

class WorkflowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    state: Optional[Literal['DRAFT', 'ACTIVE', 'PAUSED']] = None
    agent_id: Optional[str] = None
    is_template: Optional[bool] = None
    max_execution_time: Optional[int] = None
    max_retries: Optional[int] = None

class WorkflowExecuteRequest(BaseModel):
    variables: Optional[Dict[str, Any]] = None

class WorkflowConvertRequest(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    metadata: Dict[str, Any]

class WorkflowValidateRequest(BaseModel):
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]

class WorkflowValidateResponse(BaseModel):
    valid: bool
    errors: List[str] 