from agentpress.tool import ToolResult, openapi_schema, xml_schema
from sandbox.tool_base import SandboxToolsBase
from utils.logger import logger
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from enum import Enum
import json
import uuid
from datetime import datetime, timezone

class TaskStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    status: TaskStatus = TaskStatus.PENDING
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

    def update(self, content: Optional[str] = None, status: Optional[TaskStatus] = None):
        """Update task content and/or status"""
        if content is not None:
            self.content = content
        
        if status is not None:
            self.status = status
            if status == TaskStatus.COMPLETED:
                self.completed_at = datetime.now(timezone.utc).isoformat()
            elif status == TaskStatus.PENDING:
                self.completed_at = None
        
        self.updated_at = datetime.now(timezone.utc).isoformat()
    
class TaskUpdateRequest(BaseModel):
    id: str
    content: Optional[str] = None
    status: Optional[TaskStatus] = None

class TaskListTool(SandboxToolsBase):
    """Tool for managing tasks stored in a single task_list message.
    
    Provides simple CRUD operations with batch support for efficient task management.
    Tasks persist in a single message with type "task_list"
    """
    
    def __init__(self, project_id: str, thread_manager, thread_id: str):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self.task_list_message_type = "task_list"
    
    async def _find_task_list_message(self) -> Optional[Dict[str, Any]]:
        """Find the single task_list message in the thread"""
        try:
            client = await self.thread_manager.db.client
            
            # Look for the most recent task_list message
            result = await client.table('messages').select('*').eq('thread_id', self.thread_id).eq('type', self.task_list_message_type).order('created_at', desc=True).limit(1).execute()
            
            if result.data:
                return result.data[0]
            return None
            
        except Exception as e:
            logger.error(f"Error finding task_list message: {e}")
            return None
    
    async def _get_tasks(self) -> List[Task]:
        """Get tasks from the task_list message"""
        try:
            message = await self._find_task_list_message()
            
            if message and message.get('content'):
                # Parse the message content to get tasks
                if isinstance(message['content'], str):
                    content_data = json.loads(message['content'])
                else:
                    content_data = message['content']
                
                tasks_data = content_data.get('tasks', [])
                return [Task(**task_data) for task_data in tasks_data]
            
            return []
            
        except Exception as e:
            logger.error(f"Error getting tasks from message: {e}")
            return []
    
    async def _save_tasks(self, tasks: List[Task]):
        """Save tasks to the task_list message"""
        try:
            client = await self.thread_manager.db.client
            
            # Prepare content
            content = {
                "tasks": [task.model_dump() for task in tasks]
            }
            
            # Find existing task_list message
            existing_message = await self._find_task_list_message()
            
            if existing_message:
                # Update existing message
                await client.table('messages').update({
                    'content': content
                }).eq('message_id', existing_message['message_id']).execute()
            else:
                # Create new task_list message
                await client.table('messages').insert({
                    'thread_id': self.thread_id,
                    'type': self.task_list_message_type,
                    'content': content,
                    'is_llm_message': False,
                    'metadata': {}
                }).execute()
                
        except Exception as e:
            logger.error(f"Error saving tasks to message: {e}")
            raise

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "view_tasks",
            "description": "View all tasks. Use this to see current tasks, check progress, or review completed work.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status_filter": {
                        "type": "string",
                        "enum": ["all", "pending", "completed", "cancelled"],
                        "default": "all",
                        "description": "Filter tasks by status"
                    }
                },
                "required": []
            }
        }
    })
    @xml_schema(
        tag_name="view-tasks",
        mappings=[
            {"param_name": "status_filter", "node_type": "element", "path": "status_filter", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="view_tasks">
        <parameter name="status_filter">pending</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def view_tasks(self, status_filter: str = "all") -> ToolResult:
        """View tasks with optional status filter"""
        try:
            tasks = await self._get_tasks()
            
            # Filter if needed
            if status_filter != "all":
                tasks = [t for t in tasks if t.status.value == status_filter]
            
            if not tasks:
                return ToolResult(
                    success=True,
                    output=json.dumps({
                        "tasks": [],
                        "message": f"No {status_filter} tasks found.",
                        "filter": status_filter
                    }, indent=2)
                )
    
            
            return ToolResult(
                success=True,
                output=json.dumps({
                    "tasks": [task.model_dump() for task in tasks],
                    "total": len(tasks),
                    "filter": status_filter
                }, indent=2)
            )
            
        except Exception as e:
            logger.error(f"Error viewing tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error viewing tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_tasks",
            "description": "Create one or more tasks. Supports batch creation for efficiency.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "description": "List of tasks to create",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {
                                    "type": "string",
                                    "description": "Task description"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "completed", "cancelled"],
                                    "default": "pending",
                                    "description": "Initial task status"
                                }
                            },
                            "required": ["content"]
                        },
                        "minItems": 1
                    }
                },
                "required": ["tasks"]
            }
        }
    })
    @xml_schema(
        tag_name="create-tasks",
        mappings=[
            {"param_name": "tasks", "node_type": "element", "path": "tasks", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="create_tasks">
        <parameter name="tasks">[
            {"content": "Research API documentation"},
            {"content": "Implement authentication"},
            {"content": "Write unit tests"},
            {"content": "Deploy to production"}
        ]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def create_tasks(self, tasks: List[Dict[str, Any]]) -> ToolResult:
        """Create multiple tasks in a single operation"""
        try:
            existing_tasks = await self._get_tasks()
            
            # Validate input and create task objects
            created_tasks = []
            for task_data in tasks:
                new_task = Task(
                    content=task_data["content"],
                    status=TaskStatus(task_data.get("status", "pending"))
                )
                existing_tasks.append(new_task)
                created_tasks.append(new_task.model_dump())
            
            await self._save_tasks(existing_tasks)
            
            return ToolResult(
                success=True,
                output=json.dumps({
                    "message": f"Created {len(created_tasks)} tasks",
                    "tasks": created_tasks
                }, indent=2)
            )
            
        except Exception as e:
            logger.error(f"Error creating tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error creating tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "update_tasks",
            "description": "Update one or more tasks. Can update content or status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "updates": {
                        "type": "array",
                        "description": "List of task updates",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "Task ID to update"
                                },
                                "content": {
                                    "type": "string",
                                    "description": "New task description (optional)"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "completed", "cancelled"],
                                    "description": "New task status (optional)"
                                }
                            },
                            "required": ["id"]
                        },
                        "minItems": 1
                    }
                },
                "required": ["updates"]
            }
        }
    })
    @xml_schema(
        tag_name="update-tasks",
        mappings=[
            {"param_name": "updates", "node_type": "element", "path": "updates", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="update_tasks">
        <parameter name="updates">[
            {"id": "task-id-1", "status": "completed"},
            {"id": "task-id-2", "content": "Updated task description"}
        ]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def update_tasks(self, updates: List[Dict[str, Any]]) -> ToolResult:
        """Update multiple tasks in a single operation"""
        try:
            tasks = await self._get_tasks()
            updated_count = 0
            
            # Create task map for quick lookup
            task_map = {task.id: task for task in tasks}
            
            for update_data in updates:
                update_request = TaskUpdateRequest(**update_data)
                
                if update_request.id not in task_map:
                    continue
                
                task = task_map[update_request.id]
                
                if update_request.content is not None:
                    task.update(content=update_request.content)
                
                if update_request.status is not None:
                    task.update(status=update_request.status)
                
                updated_count += 1
            
            await self._save_tasks(tasks)
            
            return ToolResult(
                success=True,
                output=json.dumps({
                    "message": f"Updated {updated_count} tasks",
                    "tasks": [task.model_dump() for task in tasks]
                }, indent=2)
            )
            
        except Exception as e:
            logger.error(f"Error updating tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error updating tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "delete_tasks",
            "description": "Delete one or more tasks by their IDs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_ids": {
                        "type": "array",
                        "description": "List of task IDs to delete",
                        "items": {
                            "type": "string"
                        },
                        "minItems": 1
                    }
                },
                "required": ["task_ids"]
            }
        }
    })
    @xml_schema(
        tag_name="delete-tasks",
        mappings=[
            {"param_name": "task_ids", "node_type": "element", "path": "task_ids", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="delete_tasks">
        <parameter name="task_ids">["task-id-1", "task-id-2"]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def delete_tasks(self, task_ids: List[str]) -> ToolResult:
        """Delete multiple tasks in a single operation"""
        try:
            tasks = await self._get_tasks()
            
            # Filter out deleted tasks
            task_id_set = set(task_ids)
            remaining_tasks = [task for task in tasks if task.id not in task_id_set]
            deleted_count = len(tasks) - len(remaining_tasks)
            
            await self._save_tasks(remaining_tasks)
            
            return ToolResult(
                success=True,
                output=json.dumps({
                    "message": f"Deleted {deleted_count} tasks",
                    "tasks": [task.model_dump() for task in remaining_tasks]
                }, indent=2)
            )
            
        except Exception as e:
            logger.error(f"Error deleting tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error deleting tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "clear_all_tasks",
            "description": "Delete all tasks. Use with caution - this cannot be undone!",
            "parameters": {
                "type": "object",
                "properties": {
                    "confirm": {
                        "type": "boolean",
                        "description": "Must be true to confirm clearing all tasks"
                    }
                },
                "required": ["confirm"]
            }
        }
    })
    @xml_schema(
        tag_name="clear-all-tasks",
        mappings=[
            {"param_name": "confirm", "node_type": "element", "path": "confirm", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="clear_all_tasks">
        <parameter name="confirm">true</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def clear_all_tasks(self, confirm: bool) -> ToolResult:
        """Clear all tasks"""
        try:
            if not confirm:
                return ToolResult(
                    success=False,
                    output="❌ Must confirm=true to clear all tasks"
                )
            
            await self._save_tasks([])
            
            return ToolResult(
                success=True,
                output=json.dumps({
                    "message": "All tasks have been cleared",
                    "tasks": []
                }, indent=2)
            )
            
        except Exception as e:
            logger.error(f"Error clearing tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error clearing tasks: {str(e)}")
