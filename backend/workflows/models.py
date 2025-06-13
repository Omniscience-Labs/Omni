from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal
from datetime import datetime

class WorkflowStep(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    type: Literal['TOOL', 'MCP_TOOL', 'CONDITION', 'LOOP', 'PARALLEL', 'WAIT', 'WEBHOOK', 'TRANSFORM']
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