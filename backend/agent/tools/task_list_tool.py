from agentpress.tool import ToolResult, openapi_schema, xml_schema
from sandbox.tool_base import SandboxToolsBase
from utils.logger import logger
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from enum import Enum
import json
import uuid

class TaskStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    content: str
    status: TaskStatus = TaskStatus.PENDING
    section: str = "General"  # Simplified: just a string

class TaskListTool(SandboxToolsBase):
    """Simplified task management tool with same external interface"""
    
    def __init__(self, project_id: str, thread_manager, thread_id: str):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self.task_list_message_type = "task_list"
    
    async def _load_tasks(self) -> List[Task]:
        """Load tasks from storage"""
            
        try:
            client = await self.thread_manager.db.client
            result = await client.table('messages').select('*')\
                .eq('thread_id', self.thread_id)\
                .eq('type', self.task_list_message_type)\
                .order('created_at', desc=True).limit(1).execute()
            
            if result.data and result.data[0].get('content'):
                content = result.data[0]['content']
                if isinstance(content, str):
                    content = json.loads(content)
                
                # Handle both old nested format and new simple format
                tasks = []
                if 'tasks' in content:
                    # New simple format
                    tasks = [Task(**task_data) for task_data in content['tasks']]
                elif 'sections' in content:
                    # Old nested format - convert to simple
                    for section_data in content['sections']:
                        section_name = section_data.get('title', 'General')
                        for task_data in section_data.get('tasks', []):
                            task_data['section'] = section_name
                            tasks.append(Task(**task_data))
                
                return tasks
            
            return []
            
        except Exception as e:
            logger.error(f"Error loading tasks: {e}")
            return []
    
    async def _save_tasks(self, tasks: List[Task]):
        """Save tasks to storage (simplified)"""
        try:
            client = await self.thread_manager.db.client
            
            # Simple storage format
            content = {
                'tasks': [task.model_dump() for task in tasks]
            }
            
            # Find existing message
            result = await client.table('messages').select('message_id')\
                .eq('thread_id', self.thread_id)\
                .eq('type', self.task_list_message_type)\
                .order('created_at', desc=True).limit(1).execute()
            
            if result.data:
                # Update existing
                await client.table('messages').update({'content': content})\
                    .eq('message_id', result.data[0]['message_id']).execute()
            else:
                # Create new
                await client.table('messages').insert({
                    'thread_id': self.thread_id,
                    'type': self.task_list_message_type,
                    'content': content,
                    'is_llm_message': False,
                    'metadata': {}
                }).execute()
            
        except Exception as e:
            logger.error(f"Error saving tasks: {e}")
            raise
    
    def _format_response(self, tasks: List[Task], message: str = "") -> Dict[str, Any]:
        """Format tasks for response (maintains expected nested structure)"""
        # Group by section for backward compatibility
        sections_map = {}
        for task in tasks:
            section = task.section
            if section not in sections_map:
                sections_map[section] = []
            sections_map[section].append(task.model_dump())
        
        sections = [
            {
                "id": section_name.lower().replace(" ", "_"),
                "title": section_name,
                "tasks": task_list
            }
            for section_name, task_list in sections_map.items()
        ]
        
        response = {
            "sections": sections,
            "total": len(tasks)
        }
        
        if message:
            response["message"] = message
            
        return response

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
            tasks = await self._load_tasks()
            
            # Apply filter
            if status_filter != "all":
                tasks = [t for t in tasks if t.status.value == status_filter]
            
            message = f"No {status_filter} tasks found." if not tasks else ""
            response_data = self._format_response(tasks, message)
            response_data["filter"] = status_filter
            
            return ToolResult(success=True, output=json.dumps(response_data, indent=2))
            
        except Exception as e:
            logger.error(f"Error viewing tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error viewing tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_tasks",
            "description": "Create tasks organized by sections. Supports batch creation for efficiency.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sections": {
                        "type": "array",
                        "description": "List of sections with their tasks",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "Section title"
                                },
                                "tasks": {
                                    "type": "array",
                                    "description": "Tasks in this section",
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
                            "required": ["title", "tasks"]
                        },
                        "minItems": 1
                    }
                },
                "required": ["sections"]
            }
        }
    })
    @xml_schema(
        tag_name="create-tasks",
        mappings=[
            {"param_name": "sections", "node_type": "element", "path": "sections", "required": True}
        ],
        example='''
        <function_calls>
        <invoke name="create_tasks">
        <parameter name="sections">[
            {
                "title": "Setup & Planning",
                "tasks": [
                    {"content": "Research API documentation"},
                    {"content": "Setup development environment"}
                ]
            },
            {
                "title": "Development",
                "tasks": [
                    {"content": "Create API client"},
                    {"content": "Implement API integration"}
                ]
            }
        ]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def create_tasks(self, sections: List[Dict[str, Any]]) -> ToolResult:
        """Create tasks organized by sections"""
        try:
            existing_tasks = await self._load_tasks()
            created_count = 0
            
            for section_data in sections:
                section_title = section_data["title"]
                
                for task_data in section_data["tasks"]:
                    new_task = Task(
                        content=task_data["content"],
                        status=TaskStatus(task_data.get("status", "pending")),
                        section=section_title
                    )
                    existing_tasks.append(new_task)
                    created_count += 1
            
            await self._save_tasks(existing_tasks)
            
            message = f"Created {created_count} tasks"
            response_data = self._format_response(existing_tasks, message)
            
            return ToolResult(success=True, output=json.dumps(response_data, indent=2))
            
        except Exception as e:
            logger.error(f"Error creating tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error creating tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "update_tasks",
        "description": "Update tasks by their IDs. Can change content, status, or move between sections.",
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
                                },
                                "section": {
                                    "type": "string",
                                    "description": "New section name (optional)"
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
            {"id": "task-id-2", "content": "Updated description", "section": "New Section"}
        ]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def update_tasks(self, updates: List[Dict[str, Any]]) -> ToolResult:
        """Update multiple tasks"""
        try:
            tasks = await self._load_tasks()
            task_map = {task.id: task for task in tasks}
            updated_count = 0
            
            for update_data in updates:
                task_id = update_data["id"]
                if task_id in task_map:
                    task = task_map[task_id]
                    
                    if "content" in update_data:
                        task.content = update_data["content"]
                    if "status" in update_data:
                        task.status = TaskStatus(update_data["status"])
                    if "section" in update_data:
                        task.section = update_data["section"]
                    
                    updated_count += 1
            
            await self._save_tasks(tasks)
            
            message = f"Updated {updated_count} tasks"
            response_data = self._format_response(tasks, message)
            
            return ToolResult(success=True, output=json.dumps(response_data, indent=2))
            
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
                        "items": {"type": "string"},
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
        """Delete multiple tasks"""
        try:
            tasks = await self._load_tasks()
            task_id_set = set(task_ids)
            remaining_tasks = [task for task in tasks if task.id not in task_id_set]
            deleted_count = len(tasks) - len(remaining_tasks)
            
            await self._save_tasks(remaining_tasks)
            
            message = f"Deleted {deleted_count} tasks"
            response_data = self._format_response(remaining_tasks, message)
            
            return ToolResult(success=True, output=json.dumps(response_data, indent=2))
            
        except Exception as e:
            logger.error(f"Error deleting tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error deleting tasks: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "clear_tasks",
            "description": "Clear all tasks or tasks in specific sections.",
            "parameters": {
                "type": "object",
                "properties": {
                    "confirm": {
                        "type": "boolean",
                        "description": "Must be true to confirm clearing tasks"
                    },
                    "sections": {
                        "type": "array",
                        "description": "Section names to clear (optional - if not provided, all tasks will be cleared)",
                        "items": {"type": "string"}
                    }
                },
                "required": ["confirm"]
            }
        }
    })
    @xml_schema(
        tag_name="clear-tasks",
        mappings=[
            {"param_name": "confirm", "node_type": "element", "path": "confirm", "required": True},
            {"param_name": "sections", "node_type": "element", "path": "sections", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="clear_tasks">
        <parameter name="confirm">true</parameter>
        <parameter name="sections">["Setup & Planning", "Development"]</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def clear_tasks(self, confirm: bool, sections: Optional[List[str]] = None) -> ToolResult:
        """Clear all tasks or tasks in specific sections"""
        try:
            if not confirm:
                return ToolResult(success=False, output="❌ Must confirm=true to clear tasks")
            
            tasks = await self._load_tasks()
            
            if sections:
                section_set = set(sections)
                remaining_tasks = [task for task in tasks if task.section not in section_set]
                deleted_count = len(tasks) - len(remaining_tasks)
                message = f"Deleted {deleted_count} tasks from {len(sections)} sections"
            else:
                remaining_tasks = []
                deleted_count = len(tasks)
                message = f"Deleted all {deleted_count} tasks"
            
            await self._save_tasks(remaining_tasks)
            
            response_data = self._format_response(remaining_tasks, message)
            
            return ToolResult(success=True, output=json.dumps(response_data, indent=2))
            
        except Exception as e:
            logger.error(f"Error clearing tasks: {e}")
            return ToolResult(success=False, output=f"❌ Error clearing tasks: {str(e)}")
