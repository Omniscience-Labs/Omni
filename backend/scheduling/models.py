from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime
from enum import Enum
import croniter
import re

class ScheduleType(str, Enum):
    SIMPLE = "simple"
    CRON = "cron"
    ADVANCED = "advanced"


class SimpleScheduleConfig(BaseModel):
    """Simple interval-based schedule configuration"""
    interval_type: Literal["minutes", "hours", "days", "weeks"] = Field(..., description="Type of interval")
    interval_value: int = Field(..., ge=1, le=999, description="Interval value (1-999)")
    
    @validator("interval_value")
    def validate_interval_value(cls, v, values):
        interval_type = values.get("interval_type")
        if interval_type == "minutes" and v > 1440:
            raise ValueError("Minutes interval cannot exceed 1440 (24 hours)")
        elif interval_type == "hours" and v > 168:
            raise ValueError("Hours interval cannot exceed 168 (1 week)")
        elif interval_type == "days" and v > 365:
            raise ValueError("Days interval cannot exceed 365")
        elif interval_type == "weeks" and v > 52:
            raise ValueError("Weeks interval cannot exceed 52")
        return v
    
    def to_cron(self) -> str:
        """Convert simple schedule to cron expression"""
        if self.interval_type == "minutes":
            return f"*/{self.interval_value} * * * *"
        elif self.interval_type == "hours":
            return f"0 */{self.interval_value} * * *"
        elif self.interval_type == "days":
            return f"0 0 */{self.interval_value} * *"
        elif self.interval_type == "weeks":
            return f"0 0 * * 0/{self.interval_value}"
        else:
            raise ValueError(f"Unsupported interval type: {self.interval_type}")


class CronScheduleConfig(BaseModel):
    """Cron expression-based schedule configuration"""
    cron_expression: str = Field(..., description="Valid cron expression")
    
    @validator("cron_expression")
    def validate_cron_expression(cls, v):
        try:
            croniter.croniter(v)
            return v
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid cron expression: {e}")


class AdvancedScheduleConfig(BaseModel):
    """Advanced schedule configuration with multiple options"""
    cron_expression: str = Field(..., description="Valid cron expression")
    timezone: str = Field(default="UTC", description="Timezone for schedule evaluation")
    start_date: Optional[datetime] = Field(None, description="Schedule start date")
    end_date: Optional[datetime] = Field(None, description="Schedule end date")
    max_executions: Optional[int] = Field(None, ge=1, description="Maximum number of executions")
    
    @validator("cron_expression")
    def validate_cron_expression(cls, v):
        try:
            croniter.croniter(v)
            return v
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid cron expression: {e}")
    
    @validator("timezone")
    def validate_timezone(cls, v):
        common_timezones = [
            "UTC", "America/New_York", "America/Chicago", "America/Denver", 
            "America/Los_Angeles", "Europe/London", "Europe/Paris", "Europe/Berlin",
            "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney"
        ]
        if v not in common_timezones:
            pass
        return v
    
    @validator("end_date")
    def validate_end_date(cls, v, values):
        start_date = values.get("start_date")
        if v and start_date and v <= start_date:
            raise ValueError("End date must be after start date")
        return v


class ScheduleConfig(BaseModel):
    """Main schedule configuration model"""
    type: ScheduleType = Field(..., description="Type of schedule")
    enabled: bool = Field(default=True, description="Whether schedule is enabled")
    simple: Optional[SimpleScheduleConfig] = Field(None, description="Simple schedule config")
    cron: Optional[CronScheduleConfig] = Field(None, description="Cron schedule config")
    advanced: Optional[AdvancedScheduleConfig] = Field(None, description="Advanced schedule config")
    
    @validator("simple")
    def validate_simple_config(cls, v, values):
        if values.get("type") == ScheduleType.SIMPLE and not v:
            raise ValueError("Simple schedule config is required when type is 'simple'")
        return v
    
    @validator("cron")
    def validate_cron_config(cls, v, values):
        if values.get("type") == ScheduleType.CRON and not v:
            raise ValueError("Cron schedule config is required when type is 'cron'")
        return v
    
    @validator("advanced")
    def validate_advanced_config(cls, v, values):
        if values.get("type") == ScheduleType.ADVANCED and not v:
            raise ValueError("Advanced schedule config is required when type is 'advanced'")
        return v
    
    def get_cron_expression(self) -> str:
        """Get the cron expression for this schedule"""
        if self.type == ScheduleType.SIMPLE and self.simple:
            return self.simple.to_cron()
        elif self.type == ScheduleType.CRON and self.cron:
            return self.cron.cron_expression
        elif self.type == ScheduleType.ADVANCED and self.advanced:
            return self.advanced.cron_expression
        else:
            raise ValueError("Invalid schedule configuration")
    
    def get_timezone(self) -> str:
        """Get the timezone for this schedule"""
        if self.type == ScheduleType.ADVANCED and self.advanced:
            return self.advanced.timezone
        return "UTC"


class ScheduleStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    EXPIRED = "expired"
    ERROR = "error"


class WorkflowSchedule(BaseModel):
    """Complete workflow schedule model"""
    id: Optional[str] = Field(None, description="QStash schedule ID")
    workflow_id: str = Field(..., description="Workflow ID")
    name: str = Field(..., description="Schedule name")
    description: Optional[str] = Field(None, description="Schedule description")
    config: ScheduleConfig = Field(..., description="Schedule configuration")
    status: ScheduleStatus = Field(default=ScheduleStatus.ACTIVE, description="Schedule status")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    last_execution: Optional[datetime] = Field(None, description="Last execution timestamp")
    next_execution: Optional[datetime] = Field(None, description="Next execution timestamp")
    execution_count: int = Field(default=0, description="Total execution count")
    error_count: int = Field(default=0, description="Error count")
    last_error: Optional[str] = Field(None, description="Last error message")


class ScheduleCreateRequest(BaseModel):
    """Request model for creating a schedule"""
    workflow_id: str = Field(..., description="Workflow ID")
    name: str = Field(..., min_length=1, max_length=100, description="Schedule name")
    description: Optional[str] = Field(None, max_length=500, description="Schedule description")
    config: ScheduleConfig = Field(..., description="Schedule configuration")


class ScheduleUpdateRequest(BaseModel):
    """Request model for updating a schedule"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Schedule name")
    description: Optional[str] = Field(None, max_length=500, description="Schedule description")
    config: Optional[ScheduleConfig] = Field(None, description="Schedule configuration")
    enabled: Optional[bool] = Field(None, description="Whether schedule is enabled")


class ScheduleExecutionLog(BaseModel):
    """Schedule execution log entry"""
    schedule_id: str = Field(..., description="Schedule ID")
    workflow_id: str = Field(..., description="Workflow ID")
    execution_id: Optional[str] = Field(None, description="Workflow execution ID")
    timestamp: datetime = Field(..., description="Execution timestamp")
    status: Literal["success", "failure", "timeout"] = Field(..., description="Execution status")
    duration_ms: Optional[int] = Field(None, description="Execution duration in milliseconds")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    trigger_data: Optional[Dict[str, Any]] = Field(None, description="Trigger data sent to workflow")


class ScheduleListResponse(BaseModel):
    """Response model for listing schedules"""
    schedules: List[WorkflowSchedule] = Field(..., description="List of schedules")
    total: int = Field(..., description="Total number of schedules")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")


class CronValidationRequest(BaseModel):
    """Request model for cron validation"""
    cron_expression: str = Field(..., description="Cron expression to validate")


class CronValidationResponse(BaseModel):
    """Response model for cron validation"""
    valid: bool = Field(..., description="Whether the cron expression is valid")
    cron_expression: str = Field(..., description="The validated cron expression")
    next_executions: Optional[List[str]] = Field(None, description="Next execution times (ISO format)")
    description: Optional[str] = Field(None, description="Human-readable description")
    error: Optional[str] = Field(None, description="Error message if invalid")


class ScheduleTemplate(BaseModel):
    """Predefined schedule template"""
    id: str = Field(..., description="Template ID")
    name: str = Field(..., description="Template name")
    description: str = Field(..., description="Template description")
    icon: str = Field(..., description="Template icon")
    config: ScheduleConfig = Field(..., description="Template configuration")
    category: str = Field(..., description="Template category")


SCHEDULE_TEMPLATES = [
    ScheduleTemplate(
        id="every_minute",
        name="Every Minute",
        description="Run every minute",
        icon="⏱️",
        category="Testing",
        config=ScheduleConfig(
            type=ScheduleType.SIMPLE,
            simple=SimpleScheduleConfig(interval_type="minutes", interval_value=1)
        )
    ),
    ScheduleTemplate(
        id="every_5_minutes",
        name="Every 5 Minutes",
        description="Run every 5 minutes",
        icon="🕐",
        category="Frequent",
        config=ScheduleConfig(
            type=ScheduleType.SIMPLE,
            simple=SimpleScheduleConfig(interval_type="minutes", interval_value=5)
        )
    ),
    ScheduleTemplate(
        id="every_hour",
        name="Every Hour",
        description="Run every hour at minute 0",
        icon="⏰",
        category="Regular",
        config=ScheduleConfig(
            type=ScheduleType.CRON,
            cron=CronScheduleConfig(cron_expression="0 * * * *")
        )
    ),
    ScheduleTemplate(
        id="daily_9am",
        name="Daily at 9 AM",
        description="Run every day at 9:00 AM",
        icon="🌅",
        category="Daily",
        config=ScheduleConfig(
            type=ScheduleType.CRON,
            cron=CronScheduleConfig(cron_expression="0 9 * * *")
        )
    ),
    ScheduleTemplate(
        id="weekdays_9am",
        name="Weekdays at 9 AM",
        description="Run Monday-Friday at 9:00 AM",
        icon="💼",
        category="Business",
        config=ScheduleConfig(
            type=ScheduleType.CRON,
            cron=CronScheduleConfig(cron_expression="0 9 * * 1-5")
        )
    ),
    ScheduleTemplate(
        id="weekly_monday",
        name="Weekly on Monday",
        description="Run every Monday at 9:00 AM",
        icon="📅",
        category="Weekly",
        config=ScheduleConfig(
            type=ScheduleType.CRON,
            cron=CronScheduleConfig(cron_expression="0 9 * * 1")
        )
    ),
    ScheduleTemplate(
        id="monthly_first",
        name="Monthly on 1st",
        description="Run on the 1st of every month at 9:00 AM",
        icon="📆",
        category="Monthly",
        config=ScheduleConfig(
            type=ScheduleType.CRON,
            cron=CronScheduleConfig(cron_expression="0 9 1 * *")
        )
    ),
] 