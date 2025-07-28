"""
Mock Suna API Service for Testing

Simulates the Suna backend API endpoints needed by the Kortix SDK.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from aiohttp import web, web_request
import aiohttp
import socket


class MockSunaAPI:
    """Mock Suna API server for testing"""
    
    def __init__(self, port: Optional[int] = None):
        self.port = port or self._find_free_port()
        self.app = web.Application()
        self.runner: Optional[web.AppRunner] = None
        self.site: Optional[web.TCPSite] = None
        
        # In-memory storage for testing
        self.threads: Dict[str, Dict[str, Any]] = {}
        self.messages: Dict[str, List[Dict[str, Any]]] = {}  # thread_id -> messages
        self.agent_runs: Dict[str, Dict[str, Any]] = {}
        
        self._setup_routes()
    
    def _find_free_port(self) -> int:
        """Find a free port for the mock server"""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            return s.getsockname()[1]
    
    def _setup_routes(self):
        """Setup API routes"""
        # Agent and thread management (no agent creation needed)
        self.app.router.add_post('/agent/initiate', self.initiate_agent)
        self.app.router.add_get('/threads/{thread_id}/messages', self.get_thread_messages)
        self.app.router.add_post('/threads/{thread_id}/messages/add', self.add_message_to_thread)
        self.app.router.add_post('/thread/{thread_id}/agent/start', self.start_agent_run)
        self.app.router.add_get('/agent-run/{run_id}', self.get_agent_run)
        self.app.router.add_post('/agent-run/{run_id}/stop', self.stop_agent_run)
        
        # Add CORS middleware for testing
        self.app.middlewares.append(self._cors_middleware)
    
    @web.middleware
    async def _cors_middleware(self, request: web_request.Request, handler):
        """Add CORS headers for testing"""
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response
    
    async def start(self):
        """Start the mock API server"""
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, 'localhost', self.port)
        await self.site.start()
    
    async def stop(self):
        """Stop the mock API server"""
        if self.site:
            await self.site.stop()
        if self.runner:
            await self.runner.cleanup()
    
    # API Endpoints
    
    async def initiate_agent(self, request: web_request.Request) -> web.Response:
        """POST /agent/initiate - Create a new thread"""
        thread_id = str(uuid.uuid4())
        
        thread_data = {
            "thread_id": thread_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        self.threads[thread_id] = thread_data
        self.messages[thread_id] = []
        
        return web.json_response({
            "thread_id": thread_id,
            "agent_run_id": None
        })
    
    async def get_thread_messages(self, request: web_request.Request) -> web.Response:
        """GET /threads/{thread_id}/messages - Get all messages in a thread"""
        thread_id = request.match_info['thread_id']
        
        if thread_id not in self.messages:
            return web.json_response({"detail": "Thread not found"}, status=404)
        
        messages = self.messages[thread_id]
        
        # Return in the same format as the real backend API
        return web.json_response({
            "messages": messages  # Return raw messages as they're stored
        })
    
    async def add_message_to_thread(self, request: web_request.Request) -> web.Response:
        """POST /threads/{thread_id}/messages/add - Add a message to a thread"""
        thread_id = request.match_info['thread_id']
        
        if thread_id not in self.messages:
            return web.json_response({"detail": "Thread not found"}, status=404)
        
        # The real API expects just the message content as a string
        # Handle query parameters instead of JSON
        message_content = request.query.get("message", "")
        message_id = str(uuid.uuid4())
        
        # Detect message type based on content
        message_type = "user"
        content_structure = {
            "role": "user",
            "content": message_content
        }
        
        # Check if this looks like a tool result message
        if isinstance(message_content, str) and (
            "<tool_result" in message_content or
            "Tool Results:" in message_content or 
            "Function Results:" in message_content or
            "result:" in message_content.lower()
        ):
            message_type = "tool"
            content_structure = message_content  # Tool messages store content directly
        
        # Store in the same format as the real backend
        message = {
            "message_id": message_id,
            "type": message_type,
            "is_llm_message": True,
            "content": content_structure,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {}
        }
        
        self.messages[thread_id].append(message)
        
        # Return in the same format as the real backend
        return web.json_response(message)
    
    async def start_agent_run(self, request: web_request.Request) -> web.Response:
        """POST /thread/{thread_id}/agent/start - Start an agent run with instructions and tools"""
        thread_id = request.match_info['thread_id']
        
        if thread_id not in self.threads:
            return web.json_response({"detail": "Thread not found"}, status=404)
        
        data = await request.json()
        run_id = str(uuid.uuid4())
        
        # Extract instructions and tools from the request (new format)
        instructions = data.get("instructions", "")
        tool_schemas = data.get("tool_schemas", [])
        
        # Simulate agent response with function calls based on instructions and available tools
        agent_message = self._generate_mock_agent_response(thread_id, instructions, tool_schemas)
        
        # Add agent message to thread
        message_id = str(uuid.uuid4())
        agent_msg = {
            "message_id": message_id,
            "type": "assistant",
            "content": agent_message,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {}
        }
        self.messages[thread_id].append(agent_msg)
        
        run_data = {
            "agent_run_id": run_id,
            "thread_id": thread_id,
            "status": "completed",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat()
        }
        
        self.agent_runs[run_id] = run_data
        
        return web.json_response({
            "agent_run_id": run_id,
            "thread_id": thread_id,
            "status": "running",
            "created_at": run_data["created_at"]
        })
    
    async def get_agent_run(self, request: web_request.Request) -> web.Response:
        """GET /agent-run/{run_id} - Get agent run status"""
        run_id = request.match_info['run_id']
        
        if run_id not in self.agent_runs:
            return web.json_response({"detail": "Agent run not found"}, status=404)
        
        return web.json_response(self.agent_runs[run_id])
    
    async def stop_agent_run(self, request: web_request.Request) -> web.Response:
        """POST /agent-run/{run_id}/stop - Stop an agent run"""
        run_id = request.match_info['run_id']
        
        if run_id not in self.agent_runs:
            return web.json_response({"detail": "Agent run not found"}, status=404)
        
        self.agent_runs[run_id]["status"] = "stopped"
        
        return web.json_response({"status": "stopped"})
    
    def _generate_mock_agent_response(self, thread_id: str, instructions: str, tool_schemas: List[Dict[str, Any]]) -> str:
        """Generate a mock agent response with potential function calls"""
        messages = self.messages.get(thread_id, [])
        
        if not messages:
            return "Hello! How can I help you?"
        
        # Check if there are any tool messages in the thread (indicating tools were already executed)
        has_tool_messages = any(msg.get("type") == "tool" for msg in messages)
        
        # If tools have been executed, return a final response
        if has_tool_messages:
            last_tool_message = None
            for msg in reversed(messages):
                if msg.get("type") == "tool":
                    last_tool_message = msg
                    break
            
            if last_tool_message:
                tool_content = last_tool_message.get("content", "")
                tool_content_str = str(tool_content)
                if "weather" in tool_content_str.lower():
                    return "Based on the weather information, it looks like it's sunny! Is there anything else you'd like to know?"
                elif "result:" in tool_content_str.lower():
                    return f"The calculation has been completed. {tool_content_str} Is there anything else I can help you with?"
                elif "async result" in tool_content_str.lower():
                    return f"I found the information you requested. {tool_content_str} Is there anything else you'd like to know?"
                else:
                    return "I've completed the task. Is there anything else I can help you with?"
        
        # First time - check user message for keywords that should trigger function calls
        last_user_message = None
        for msg in reversed(messages):
            if msg.get("type") == "user":
                last_user_message = msg
                break
        
        if not last_user_message:
            return "Hello! How can I help you?"
            
        user_content = last_user_message.get("content", "")
        
        # Handle case where content might be a dict (backend format)
        if isinstance(user_content, dict):
            if "content" in user_content:
                user_content_str = user_content["content"]
            elif "text" in user_content:
                user_content_str = user_content["text"]
            else:
                user_content_str = str(user_content)
        else:
            user_content_str = str(user_content)
        
        # Check if tools are available and user message should trigger them
        available_tools = [schema.get("function", {}).get("name") for schema in tool_schemas if schema.get("function")]
        
        # Check if the user message contains keywords that should trigger function calls
        if "weather" in user_content_str.lower() and "get_weather" in available_tools:
            return '''I'll check the weather for you.

<function_calls>
<invoke name="get_weather">
<parameter name="city">Tokyo</parameter>
</invoke>
</function_calls>'''
        
        elif ("calculate" in user_content_str.lower() or any(op in user_content_str for op in ['+', '-', '*', '/', '='])) and "calculate" in available_tools:
            return '''I'll calculate that for you.

<function_calls>
<invoke name="calculate">
<parameter name="expression">15 * 23</parameter>
</invoke>
</function_calls>'''
        
        elif "search" in user_content_str.lower() and "async_tool" in available_tools:
            return '''I'll search for that information.

<function_calls>
<invoke name="async_tool">
<parameter name="query">latest AI developments</parameter>
</invoke>
</function_calls>'''
        
        else:
            # Return a simple response without function calls
            return f"I understand you said: {user_content_str}. How can I help you further?"
    
    def add_test_data(self, thread_id: str, messages: List[Dict[str, Any]]):
        """Add test data to the mock API for testing"""
        if thread_id not in self.threads:
            self.threads[thread_id] = {
                "thread_id": thread_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        
        self.messages[thread_id] = messages
    
    def reset_data(self):
        """Reset all stored data"""
        self.threads.clear()
        self.messages.clear()
        self.agent_runs.clear()
    
    def add_test_data(self, thread_id: str, messages: List[Dict[str, Any]]):
        """Add test data for a specific thread"""
        # Create thread if it doesn't exist
        if thread_id not in self.threads:
            self.threads[thread_id] = {
                "id": thread_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        
        # Add messages
        if thread_id not in self.messages:
            self.messages[thread_id] = []
        
        self.messages[thread_id].extend(messages) 