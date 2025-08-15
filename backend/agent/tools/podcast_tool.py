import httpx
import json
from typing import Optional, Dict, Any, List
from datetime import datetime
from agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from services.supabase import DBConnection
from utils.logger import logger
from utils.config import config

class SandboxPodcastTool(SandboxToolsBase):
    """Tool for generating podcasts from agent run conversations using the Podcastfy service."""
    
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.podcastfy_url = "https://podcastfy-omni.onrender.com"
        self.db = DBConnection()
        
    @openapi_schema({
        "type": "function", 
        "function": {
            "name": "generate_podcast",
            "description": "Generate a podcast from an agent run conversation. This tool fetches the agent run data, retrieves the associated conversation messages, formats them for podcast generation, and calls the Podcastfy service to create an audio podcast. The podcast will include both the user's questions and the agent's responses in a conversational format suitable for audio consumption.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_run_id": {
                        "type": "string",
                        "description": "The UUID of the agent run to generate a podcast from. This should be a valid agent run ID from a completed conversation."
                    },
                    "podcast_title": {
                        "type": "string", 
                        "description": "Optional title for the podcast. If not provided, a title will be generated based on the conversation content.",
                        "default": ""
                    },
                    "include_thinking": {
                        "type": "boolean",
                        "description": "Whether to include the agent's thinking/reasoning process in the podcast (if available). This can provide insights into the agent's decision-making process.",
                        "default": False
                    }
                },
                "required": ["agent_run_id"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="generate_podcast">
        <parameter name="agent_run_id">5d8a2b42-d550-4da7-a9bc-cc86e063ded0</parameter>
        <parameter name="podcast_title">AI Agent Conversation About Project Planning</parameter>
        <parameter name="include_thinking">false</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_podcast(
        self, 
        agent_run_id: str,
        podcast_title: str = "",
        include_thinking: bool = False
    ) -> ToolResult:
        """
        Generate a podcast from an agent run conversation.
        
        Args:
            agent_run_id: The UUID of the agent run to create a podcast from
            podcast_title: Optional title for the podcast
            include_thinking: Whether to include agent thinking process
            
        Returns:
            ToolResult with podcast URL or generation status
        """
        try:
            logger.info(f"Starting podcast generation for agent run: {agent_run_id}")
            
            # Step 1: Fetch agent run data
            agent_run_data = await self._fetch_agent_run_data(agent_run_id)
            if not agent_run_data:
                return self.fail_response(f"Agent run {agent_run_id} not found or access denied.")
                
            thread_id = agent_run_data.get('thread_id')
            if not thread_id:
                return self.fail_response("No thread ID found for this agent run.")
                
            logger.info(f"Found thread ID: {thread_id} for agent run: {agent_run_id}")
            
            # Step 2: Fetch thread messages
            messages = await self._fetch_thread_messages(thread_id)
            if not messages:
                return self.fail_response("No messages found for this conversation.")
                
            logger.info(f"Retrieved {len(messages)} messages from thread: {thread_id}")
            
            # Step 3: Format conversation for podcast
            formatted_content = self._format_conversation_for_podcast(
                messages, agent_run_data, include_thinking
            )
            
            # Step 4: Generate title if not provided
            if not podcast_title:
                podcast_title = self._generate_podcast_title(messages, agent_run_data)
                
            # Step 5: Call Podcastfy service
            podcast_result = await self._call_podcastfy_service(
                formatted_content, podcast_title, agent_run_id
            )
            
            if podcast_result.get('success'):
                return self.success_response({
                    "status": "Podcast generated successfully",
                    "podcast_url": podcast_result.get('podcast_url'),
                    "podcast_id": podcast_result.get('podcast_id'),
                    "title": podcast_title,
                    "agent_run_id": agent_run_id,
                    "message_count": len(messages),
                    "service_response": podcast_result
                })
            else:
                return self.fail_response(f"Podcast generation failed: {podcast_result.get('error', 'Unknown error')}")
                
        except Exception as e:
            logger.error(f"Error generating podcast for agent run {agent_run_id}: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to generate podcast: {str(e)}")
    
    async def _fetch_agent_run_data(self, agent_run_id: str) -> Optional[Dict[str, Any]]:
        """Fetch agent run data from the database."""
        try:
            client = await self.db.client
            result = await client.table('agent_runs').select(
                '*, threads(account_id, metadata)'
            ).eq('id', agent_run_id).execute()
            
            if result.data:
                return result.data[0]
            return None
            
        except Exception as e:
            logger.error(f"Error fetching agent run data: {str(e)}")
            return None
    
    async def _fetch_thread_messages(self, thread_id: str) -> List[Dict[str, Any]]:
        """Fetch all messages for a thread."""
        try:
            client = await self.db.client
            result = await client.table('messages').select('*').eq(
                'thread_id', thread_id
            ).order('created_at', desc=False).execute()
            
            return result.data or []
            
        except Exception as e:
            logger.error(f"Error fetching thread messages: {str(e)}")
            return []
    
    def _format_conversation_for_podcast(
        self, 
        messages: List[Dict[str, Any]], 
        agent_run_data: Dict[str, Any],
        include_thinking: bool = False
    ) -> str:
        """Format the conversation messages for podcast generation."""
        
        formatted_lines = []
        
        # Add podcast introduction
        agent_model = agent_run_data.get('metadata', {}).get('model_name', 'AI Assistant')
        start_time = agent_run_data.get('started_at', 'Unknown time')
        
        formatted_lines.append("# AI Agent Conversation Podcast")
        formatted_lines.append(f"**Date:** {start_time}")
        formatted_lines.append(f"**Agent Model:** {agent_model}")
        formatted_lines.append(f"**Total Messages:** {len(messages)}")
        formatted_lines.append("")
        formatted_lines.append("---")
        formatted_lines.append("")
        
        # Process each message
        for i, message in enumerate(messages, 1):
            role = message.get('role', 'unknown')
            content = message.get('content', '')
            
            if role == 'user':
                formatted_lines.append(f"**User Question {i}:**")
                formatted_lines.append(content)
                formatted_lines.append("")
                
            elif role == 'assistant':
                formatted_lines.append(f"**AI Assistant Response {i}:**")
                
                # Handle thinking content if requested
                if include_thinking and isinstance(content, dict) and 'thinking' in content:
                    formatted_lines.append("*Agent's internal reasoning:*")
                    formatted_lines.append(content.get('thinking', ''))
                    formatted_lines.append("")
                
                # Add main response content
                main_content = content
                if isinstance(content, dict):
                    main_content = content.get('content', content.get('text', str(content)))
                
                formatted_lines.append(main_content)
                formatted_lines.append("")
                formatted_lines.append("---")
                formatted_lines.append("")
        
        return "\n".join(formatted_lines)
    
    def _generate_podcast_title(
        self, 
        messages: List[Dict[str, Any]], 
        agent_run_data: Dict[str, Any]
    ) -> str:
        """Generate a title for the podcast based on the conversation."""
        
        # Try to extract topic from first user message
        if messages:
            first_user_message = next((msg for msg in messages if msg.get('role') == 'user'), None)
            if first_user_message:
                content = first_user_message.get('content', '')
                # Take first 50 characters as basis for title
                topic_hint = content[:50].strip()
                if topic_hint:
                    return f"AI Conversation: {topic_hint}..."
        
        # Fallback title
        agent_model = agent_run_data.get('metadata', {}).get('model_name', 'AI Assistant')
        date_str = datetime.now().strftime("%Y-%m-%d")
        return f"{agent_model} Conversation - {date_str}"
    
    async def _call_podcastfy_service(
        self, 
        content: str, 
        title: str, 
        agent_run_id: str
    ) -> Dict[str, Any]:
        """Call the Podcastfy service to generate the podcast."""
        try:
            logger.info(f"Calling Podcastfy service for agent run: {agent_run_id}")
            
            # Prepare payload for Podcastfy service
            payload = {
                "text": content,
                "title": title,
                "metadata": {
                    "agent_run_id": agent_run_id,
                    "source": "omni_agent_conversation",
                    "generated_at": datetime.now().isoformat()
                }
            }
            
            # First, let's check if the service is available
            async with httpx.AsyncClient(timeout=120.0) as client:
                # Check health/status endpoint first
                try:
                    health_response = await client.get(f"{self.podcastfy_url}/health")
                    logger.info(f"Podcastfy health check status: {health_response.status_code}")
                except Exception as e:
                    logger.warning(f"Health check failed: {str(e)}")
                
                # Make the main podcast generation request
                response = await client.post(
                    f"{self.podcastfy_url}/generate", 
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                logger.info(f"Podcastfy response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    return {
                        "success": True,
                        "podcast_url": result.get("podcast_url"),
                        "podcast_id": result.get("podcast_id"),
                        "status": result.get("status"),
                        "full_response": result
                    }
                else:
                    error_text = response.text
                    logger.error(f"Podcastfy service error: {response.status_code} - {error_text}")
                    return {
                        "success": False,
                        "error": f"Service returned {response.status_code}: {error_text}"
                    }
                    
        except httpx.TimeoutException:
            logger.error("Podcastfy service timeout")
            return {
                "success": False,
                "error": "Request to Podcastfy service timed out"
            }
        except Exception as e:
            logger.error(f"Error calling Podcastfy service: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to call Podcastfy service: {str(e)}"
            }

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "check_podcast_status",
            "description": "Check the status of the Podcastfy service and verify if it's available for podcast generation.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="check_podcast_status">
        </invoke>
        </function_calls>
    ''')
    async def check_podcast_status(self) -> ToolResult:
        """Check if the Podcastfy service is available and ready."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.podcastfy_url}/health")
                
                if response.status_code == 200:
                    service_info = response.json()
                    return self.success_response({
                        "status": "Podcastfy service is available",
                        "service_url": self.podcastfy_url,
                        "response_code": response.status_code,
                        "service_info": service_info
                    })
                else:
                    return self.fail_response(f"Podcastfy service returned {response.status_code}: {response.text}")
                    
        except httpx.TimeoutException:
            return self.fail_response("Podcastfy service is not responding (timeout)")
        except Exception as e:
            return self.fail_response(f"Failed to check Podcastfy service: {str(e)}")


if __name__ == "__main__":
    import asyncio
    from agentpress.thread_manager import ThreadManager
    
    async def test_podcast_tool():
        """Test the podcast tool functionality."""
        # This would normally be called with proper project_id and thread_manager
        print("Podcast tool test - would require actual database and service connections")
        
    asyncio.run(test_podcast_tool())