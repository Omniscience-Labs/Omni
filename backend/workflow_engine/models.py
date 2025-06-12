"""
Workflow Engine Models

Defines the data models for workflows, triggers, executions, and related entities.
"""

from typing import Dict, List, Optional, Any, Union
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class TriggerType(str, Enum):
    """Types of triggers that can start a workflow"""
    WEBHOOK = "webhook"
    SCHEDULE = "schedule"
    EVENT = "event"
    POLLING = "polling"
    MANUAL = "manual"
    WORKFLOW = "workflow"  # Triggered by another workflow


class WorkflowStatus(str, Enum):
    """Status of a workflow"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"
    ARCHIVED = "archived"


class ExecutionStatus(str, Enum):
    """Status of a workflow execution"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class NodeType(str, Enum):
    """Types of nodes in a workflow"""
    TRIGGER = "trigger"
    AGENT = "agent"
    TOOL = "tool"
    CONDITION = "condition"
    LOOP = "loop"
    PARALLEL = "parallel"
    WEBHOOK = "webhook"
    TRANSFORM = "transform"
    DELAY = "delay"
    OUTPUT = "output"


class ConnectionType(str, Enum):
    """Types of connections between nodes"""
    DATA = "data"
    TOOL = "tool"
    PROCESSED_DATA = "processed_data"
    ACTION = "action"
    CONDITION = "condition"


class TriggerConfig(BaseModel):
    """Configuration for a trigger"""
    type: TriggerType
    enabled: bool = True
    
    # Webhook config
    webhook_path: Optional[str] = None
    webhook_secret: Optional[str] = None
    webhook_method: Optional[str] = "POST"
    
    # Schedule config (cron expression)
    schedule: Optional[str] = None
    timezone: Optional[str] = "UTC"
    
    # Event config
    event_source: Optional[str] = None
    event_type: Optional[str] = None
    event_filters: Optional[Dict[str, Any]] = None
    
    # Polling config
    polling_url: Optional[str] = None
    polling_interval: Optional[int] = None  # seconds
    polling_headers: Optional[Dict[str, str]] = None
    
    # Workflow trigger config
    source_workflow_id: Optional[str] = None
    source_node_id: Optional[str] = None


class NodeConfig(BaseModel):
    """Configuration for a workflow node"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: NodeType
    name: str
    position: Dict[str, float]  # x, y coordinates
    
    # Agent config
    agent_id: Optional[str] = None
    model: Optional[str] = None
    instructions: Optional[str] = None
    temperature: Optional[float] = None
    
    # Tool config
    tool_id: Optional[str] = None
    tool_config: Optional[Dict[str, Any]] = None
    
    # Transform config
    transform_type: Optional[str] = None
    transform_config: Optional[Dict[str, Any]] = None
    
    # Condition config
    condition_type: Optional[str] = None  # "if", "switch"
    condition_rules: Optional[List[Dict[str, Any]]] = None
    
    # Loop config
    loop_type: Optional[str] = None  # "for", "while"
    loop_config: Optional[Dict[str, Any]] = None
    
    # Delay config
    delay_seconds: Optional[int] = None
    
    # Retry config
    retry_count: int = 3
    retry_delay: int = 5  # seconds
    
    # Error handling
    on_error: str = "fail"  # "fail", "continue", "retry"
    error_handler_node: Optional[str] = None


class Connection(BaseModel):
    """Connection between workflow nodes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_node_id: str
    source_handle: str
    target_node_id: str
    target_handle: str
    type: ConnectionType
    
    # Data transformation
    transform: Optional[Dict[str, Any]] = None
    
    # Conditional connection
    condition: Optional[Dict[str, Any]] = None


class WorkflowDefinition(BaseModel):
    """Complete workflow definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    version: int = 1
    
    # Ownership
    project_id: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Status
    status: WorkflowStatus = WorkflowStatus.DRAFT
    
    # Workflow structure
    nodes: List[NodeConfig]
    connections: List[Connection]
    
    # Triggers
    triggers: List[TriggerConfig]
    
    # Global settings
    timeout_seconds: int = 3600  # 1 hour default
    max_retries: int = 3
    
    # Variables and secrets
    variables: Dict[str, Any] = {}
    secret_refs: List[str] = []  # References to secrets in vault
    
    # Permissions
    is_public: bool = False
    allowed_users: List[str] = []
    allowed_teams: List[str] = []
    
    # Metadata
    tags: List[str] = []
    category: Optional[str] = None


class ExecutionContext(BaseModel):
    """Context for a workflow execution"""
    execution_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str
    workflow_version: int
    
    # Trigger info
    trigger_type: TriggerType
    trigger_data: Dict[str, Any] = {}
    
    # Execution info
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    status: ExecutionStatus = ExecutionStatus.PENDING
    
    # Runtime data
    variables: Dict[str, Any] = {}
    node_outputs: Dict[str, Any] = {}  # node_id -> output
    node_statuses: Dict[str, ExecutionStatus] = {}  # node_id -> status
    
    # Error tracking
    errors: List[Dict[str, Any]] = []
    
    # Performance metrics
    node_durations: Dict[str, float] = {}  # node_id -> duration in seconds
    total_tokens: int = 0
    total_cost: float = 0.0
    
    # Debugging
    debug_mode: bool = False
    trace_id: Optional[str] = None


class WorkflowExecution(BaseModel):
    """Record of a workflow execution"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str
    workflow_version: int
    workflow_name: str
    
    # Execution details
    execution_context: ExecutionContext
    
    # User info
    triggered_by: Optional[str] = None  # User ID or "system"
    project_id: str
    
    # Timing
    scheduled_for: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    
    # Results
    status: ExecutionStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    # Metrics
    nodes_executed: int = 0
    tokens_used: int = 0
    cost: float = 0.0
    
    # Audit
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class WorkflowTemplate(BaseModel):
    """Pre-built workflow template"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    category: str
    
    # Template definition
    workflow_definition: WorkflowDefinition
    
    # Customization points
    required_variables: List[Dict[str, str]]  # name, description, type
    required_tools: List[str]
    required_models: List[str]
    
    # Metadata
    author: str
    version: str
    tags: List[str]
    preview_image: Optional[str] = None
    
    # Usage
    usage_count: int = 0
    rating: float = 0.0
    is_featured: bool = False
    is_verified: bool = False


class WebhookRegistration(BaseModel):
    """Registration for a webhook trigger"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str
    trigger_id: str
    
    # Webhook details
    path: str  # Unique path for this webhook
    secret: str  # Secret for webhook validation
    method: str = "POST"
    
    # Configuration
    headers_validation: Optional[Dict[str, str]] = None
    body_schema: Optional[Dict[str, Any]] = None
    
    # Status
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_triggered: Optional[datetime] = None
    trigger_count: int = 0


class ScheduledJob(BaseModel):
    """Scheduled workflow execution"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    workflow_id: str
    trigger_id: str
    
    # Schedule
    cron_expression: str
    timezone: str = "UTC"
    
    # Execution window
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    # Status
    is_active: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    
    # Error handling
    consecutive_failures: int = 0
    max_consecutive_failures: int = 5 