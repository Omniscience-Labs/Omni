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
        self.podcastfy_url = "https://varnica-dev-podcastfy.onrender.com"
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
                    },
                    "tts_model": {
                        "type": "string",
                        "description": "TTS model to use: 'openai' (cost-effective, ~307KB files) or 'elevenlabs' (premium quality, ~1.6MB files)",
                        "enum": ["openai", "elevenlabs"],
                        "default": "openai"
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
        include_thinking: bool = False,
        tts_model: str = "openai"
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
                messages, agent_run_data, include_thinking, is_bite_sized=False
            )
            
            # Step 4: Generate title if not provided
            if not podcast_title:
                podcast_title = self._generate_podcast_title(messages, agent_run_data)
                
            # Step 5: Call Podcastfy service
            podcast_result = await self._call_podcastfy_service(
                formatted_content, podcast_title, agent_run_id, tts_model
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
        include_thinking: bool = False,
        is_bite_sized: bool = False
    ) -> str:
        """Format the conversation messages for podcast generation with proper speaker roles."""
        
        formatted_lines = []
        
        # Add podcast introduction with clear speaker roles - using Mike and Laurel
        agent_model = agent_run_data.get('metadata', {}).get('model_name', 'AI Assistant')
        start_time = agent_run_data.get('started_at', 'Unknown time')
        
        if is_bite_sized:
            formatted_lines.append("Mike: Welcome to this bite-sized AI conversation!")
            formatted_lines.append(f"Laurel: We're quickly reviewing a conversation with {agent_model}.")
            formatted_lines.append(f"Mike: Let's dive right into the key highlights from this {len(messages)}-message exchange!")
        else:
            formatted_lines.append("Mike: Welcome to this AI Agent conversation podcast!")
            formatted_lines.append(f"Laurel: Today we're reviewing a conversation with {agent_model} from {start_time}")
            formatted_lines.append(f"Mike: This conversation had {len(messages)} messages. Let's explore what happened!")
            formatted_lines.append("Laurel: This should be fascinating! Let's dive in.")
        formatted_lines.append("")
        
        # Process each message with natural podcast flow
        for i, message in enumerate(messages, 1):
            role = message.get('role', 'unknown')
            content = message.get('content', '')
            
            if role == 'user':
                if is_bite_sized:
                    formatted_lines.append(f"Mike: The user asked: {content}")
                    formatted_lines.append("Laurel: Let's see how the AI handled this!")
                else:
                    formatted_lines.append(f"Mike: The user asked: {content}")
                    formatted_lines.append("Laurel: That's an interesting question! What did the AI respond?")
                formatted_lines.append("")
                
            elif role == 'assistant':
                # Handle thinking content if requested
                if include_thinking and isinstance(content, dict) and 'thinking' in content:
                    if is_bite_sized:
                        formatted_lines.append(f"Mike: The AI quickly processed: {content.get('thinking', '')[:100]}...")
                    else:
                        formatted_lines.append(f"Mike: First, the AI thought about this problem: {content.get('thinking', '')}")
                        formatted_lines.append("Laurel: Interesting reasoning process!")
                    formatted_lines.append("")
                
                # Add main response content
                main_content = content
                if isinstance(content, dict):
                    main_content = content.get('content', content.get('text', str(content)))
                
                if is_bite_sized:
                    # Truncate content for bite-sized version
                    truncated_content = main_content[:200] + "..." if len(main_content) > 200 else main_content
                    formatted_lines.append(f"Laurel: The AI responded: {truncated_content}")
                    formatted_lines.append("Mike: Great response!")
                else:
                    formatted_lines.append(f"Laurel: The AI assistant responded: {main_content}")
                    formatted_lines.append("Mike: That's a comprehensive and helpful response!")
                formatted_lines.append("")
                
            elif role == 'system':
                if not is_bite_sized:  # Skip system messages in bite-sized version
                    formatted_lines.append(f"Mike: The system provided this guidance: {content}")
                    formatted_lines.append("")
        
        if is_bite_sized:
            formatted_lines.append("Mike: That's a quick look at this AI conversation!")
            formatted_lines.append("Laurel: Perfect bite-sized summary of the key interaction points.")
            formatted_lines.append("Mike: Thanks for listening to this quick AI chat review!")
        else:
            formatted_lines.append("Mike: That concludes this AI conversation review!")
            formatted_lines.append("Laurel: Thanks for listening to this AI interaction podcast. The conversation shows how AI can provide detailed, helpful responses to user questions.")
            formatted_lines.append("Mike: Until next time!")
        
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
        agent_run_id: str,
        tts_model: str = "openai"
    ) -> Dict[str, Any]:
        """Call the Podcastfy service to generate the podcast."""
        try:
            logger.info(f"Calling Podcastfy service for agent run: {agent_run_id}")
            
            # Configure TTS model and voice
            voice_config = self._get_tts_config(tts_model)
            
            # Prepare payload for Podcastfy service
            payload = {
                "text": content,
                "title": title,
                "tts_model": tts_model,
                "voice_id": voice_config["voice_id"],
                "metadata": {
                    "agent_run_id": agent_run_id,
                    "source": "omni_agent_conversation",
                    "generated_at": datetime.now().isoformat(),
                    "tts_model": tts_model,
                    "quality": voice_config["quality"]
                }
            }
            
            # First, let's check if the service is available
            async with httpx.AsyncClient(timeout=180.0) as client:  # Increased for OpenAI TTS
                # Check health/status endpoint first
                try:
                    health_response = await client.get(f"{self.podcastfy_url}/api/health")
                    logger.info(f"Podcastfy health check status: {health_response.status_code}")
                except Exception as e:
                    logger.warning(f"Health check failed: {str(e)}")
                
                # Make the main podcast generation request
                response = await client.post(
                    f"{self.podcastfy_url}/api/generate", 
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
                    
                    # Provide user-friendly error messages
                    if response.status_code == 502:
                        user_error = "Podcast service is temporarily unavailable (Bad Gateway). Please try again later."
                    elif response.status_code == 503:
                        user_error = "Podcast service is temporarily unavailable. Please try again later."
                    elif response.status_code == 500:
                        user_error = "Internal server error in podcast service. Please try again later."
                    else:
                        user_error = f"Podcast service returned HTTP {response.status_code}"
                    
                    return {
                        "success": False,
                        "error": user_error,
                        "status_code": response.status_code,
                        "raw_error": error_text[:200] if error_text else None
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
                response = await client.get(f"{self.podcastfy_url}/api/health")
                
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

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_podcast_from_url",
            "description": "Generate a podcast from web content by providing a URL. This tool will scrape the content from the URL and convert it into an engaging audio podcast using AI hosts. Works with most public websites including news articles, blog posts, and other web content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the web content to convert into a podcast. Should be a public website URL (e.g., news article, blog post, documentation)."
                    },
                    "podcast_title": {
                        "type": "string",
                        "description": "Optional title for the podcast. If not provided, a title will be generated based on the web content.",
                        "default": ""
                    },
                    "tts_model": {
                        "type": "string",
                        "description": "TTS model to use: 'openai' (cost-effective, ~307KB files) or 'elevenlabs' (premium quality, ~1.6MB files)",
                        "enum": ["openai", "elevenlabs"],
                        "default": "openai"
                    }
                },
                "required": ["url"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="generate_podcast_from_url">
        <parameter name="url">https://www.example.com/article</parameter>
        <parameter name="podcast_title">Breaking News Analysis</parameter>
        <parameter name="tts_model">openai</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_podcast_from_url(
        self,
        url: str,
        podcast_title: str = "",
        tts_model: str = "openai"
    ) -> ToolResult:
        """
        Generate a podcast from web content at the provided URL.
        
        Args:
            url: The URL of the web content to convert
            podcast_title: Optional title for the podcast
            tts_model: TTS model to use for generation
            
        Returns:
            ToolResult with podcast URL or generation status
        """
        try:
            logger.info(f"Starting podcast generation from URL: {url}")
            
            # Step 1: Validate URL
            if not url or not url.startswith(('http://', 'https://')):
                return self.fail_response("Please provide a valid HTTP/HTTPS URL.")
            
            # Step 2: Generate title if not provided
            if not podcast_title:
                try:
                    domain = url.split('//')[1].split('/')[0].replace('www.', '')
                    podcast_title = f"Content from {domain}"
                except:
                    podcast_title = "Web Content Podcast"
            
            logger.info(f"Generated podcast title: {podcast_title}")
            
            # Step 3: Call Podcastfy service with URL
            podcast_result = await self._call_podcastfy_service_url(
                url, podcast_title, tts_model
            )
            
            if podcast_result.get('success'):
                return self.success_response({
                    "status": "Podcast generated successfully from URL",
                    "podcast_url": podcast_result.get('podcast_url'),
                    "audio_url": podcast_result.get('audio_url'),
                    "podcast_id": podcast_result.get('podcast_id'),
                    "title": podcast_title,
                    "source_url": url,
                    "tts_model": tts_model,
                    "service_response": podcast_result
                })
            else:
                error_msg = podcast_result.get('error', 'Unknown error')
                return self.fail_response(f"Podcast generation failed: {error_msg}")
                
        except Exception as e:
            logger.error(f"Error generating podcast from URL {url}: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to generate podcast from URL: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_bite_sized_podcast",
            "description": "Generate a bite-sized (shorter) podcast from an agent run conversation. This creates a condensed version with key highlights, hosted by Mike and Laurel, perfect for quick listening. Content is truncated and focused on main points only.",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_run_id": {
                        "type": "string",
                        "description": "The UUID of the agent run to generate a bite-sized podcast from. Should be a valid agent run ID from a completed conversation."
                    },
                    "podcast_title": {
                        "type": "string",
                        "description": "Optional title for the podcast. If not provided, a title will be generated. Will be prefixed with 'Bite-sized: '",
                        "default": ""
                    },
                    "tts_model": {
                        "type": "string",
                        "description": "TTS model to use: 'openai' (cost-effective, ~307KB files) or 'elevenlabs' (premium quality, ~1.6MB files)",
                        "enum": ["openai", "elevenlabs"],
                        "default": "openai"
                    }
                },
                "required": ["agent_run_id"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="generate_bite_sized_podcast">
        <parameter name="agent_run_id">5d8a2b42-d550-4da7-a9bc-cc86e063ded0</parameter>
        <parameter name="podcast_title">Quick AI Chat Summary</parameter>
        <parameter name="tts_model">openai</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_bite_sized_podcast(
        self,
        agent_run_id: str,
        podcast_title: str = "",
        tts_model: str = "openai"
    ) -> ToolResult:
        """
        Generate a bite-sized podcast from an agent run conversation.
        
        Args:
            agent_run_id: The UUID of the agent run to create a podcast from
            podcast_title: Optional title for the podcast (will be prefixed with 'Bite-sized: ')
            tts_model: TTS model to use for generation
            
        Returns:
            ToolResult with podcast URL or generation status
        """
        try:
            logger.info(f"Starting bite-sized podcast generation for agent run: {agent_run_id}")
            
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
            
            # Step 3: Format conversation for bite-sized podcast
            formatted_content = self._format_conversation_for_podcast(
                messages, agent_run_data, include_thinking=False, is_bite_sized=True
            )
            
            # Step 4: Generate title if not provided
            if not podcast_title:
                base_title = self._generate_podcast_title(messages, agent_run_data)
                podcast_title = f"Bite-sized: {base_title}"
            else:
                podcast_title = f"Bite-sized: {podcast_title}"
                
            # Step 5: Call Podcastfy service
            podcast_result = await self._call_podcastfy_service(
                formatted_content, podcast_title, agent_run_id, tts_model
            )
            
            if podcast_result.get('success'):
                return self.success_response({
                    "status": "Bite-sized podcast generated successfully",
                    "podcast_url": podcast_result.get('podcast_url'),
                    "audio_url": podcast_result.get('audio_url'),
                    "podcast_id": podcast_result.get('podcast_id'),
                    "title": podcast_title,
                    "agent_run_id": agent_run_id,
                    "message_count": len(messages),
                    "is_bite_sized": True,
                    "hosts": "Mike and Laurel",
                    "service_response": podcast_result
                })
            else:
                return self.fail_response(f"Bite-sized podcast generation failed: {podcast_result.get('error', 'Unknown error')}")
                
        except Exception as e:
            logger.error(f"Error generating bite-sized podcast for agent run {agent_run_id}: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to generate bite-sized podcast: {str(e)}")

    async def _call_podcastfy_service_url(
        self, 
        url: str, 
        title: str, 
        tts_model: str = "openai"
    ) -> Dict[str, Any]:
        """Call the Podcastfy service to generate podcast from URL."""
        try:
            logger.info(f"Calling Podcastfy service for URL: {url}")
            
            # Configure TTS model and voice
            voice_config = self._get_tts_config(tts_model)
            
            # Prepare payload for Podcastfy service - URL-based generation
            payload = {
                "urls": [url],  # Podcastfy expects URLs in a list
                "title": title,
                "tts_model": tts_model,
                "voice_id": voice_config["voice_id"],
                "metadata": {
                    "source_url": url,
                    "source": "omni_url_podcast",
                    "generated_at": datetime.now().isoformat(),
                    "tts_model": tts_model,
                    "quality": voice_config["quality"]
                }
            }
            
            async with httpx.AsyncClient(timeout=180.0) as client:  # URL processing can take longer
                # Check health/status endpoint first
                try:
                    health_response = await client.get(f"{self.podcastfy_url}/api/health")
                    logger.info(f"Podcastfy health check status: {health_response.status_code}")
                except Exception as e:
                    logger.warning(f"Health check failed: {str(e)}")
                
                # Make the main podcast generation request
                response = await client.post(
                    f"{self.podcastfy_url}/api/generate", 
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                logger.info(f"Podcastfy response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    return {
                        "success": True,
                        "podcast_url": result.get("podcast_url"),
                        "audio_url": result.get("audio_url"),
                        "podcast_id": result.get("podcast_id"),
                        "status": result.get("status"),
                        "full_response": result
                    }
                else:
                    error_text = response.text
                    logger.error(f"Podcastfy service error: {response.status_code} - {error_text}")
                    
                    # Handle specific error cases for URL processing
                    if response.status_code == 502:
                        user_error = "Podcast service is temporarily unavailable (Bad Gateway). Please try again later."
                    elif response.status_code == 503:
                        user_error = "Podcast service is temporarily unavailable. Please try again later."
                    elif response.status_code == 500:
                        user_error = "Internal server error in podcast service. Please try again later."
                    elif response.status_code == 403:
                        user_error = f"Access denied to the URL '{url}'. The website may block automated access. Try a different source or manual content extraction."
                    elif response.status_code == 404:
                        user_error = f"The URL '{url}' could not be found or is not accessible."
                    else:
                        user_error = f"Podcast service returned HTTP {response.status_code}"
                    
                    return {
                        "success": False,
                        "error": user_error,
                        "status_code": response.status_code,
                        "raw_error": error_text[:200] if error_text else None
                    }
                    
        except httpx.TimeoutException:
            logger.error("Podcastfy service timeout for URL processing")
            return {
                "success": False,
                "error": "Request to Podcastfy service timed out. URL processing can take longer - please try again."
            }
        except Exception as e:
            logger.error(f"Error calling Podcastfy service for URL: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to call Podcastfy service: {str(e)}"
            }

    def _get_tts_config(self, tts_model: str) -> Dict[str, str]:
        """Get TTS configuration for different models"""
        configs = {
            "openai": {
                "voice_id": "alloy",
                "quality": "cost-effective",
                "description": "~307KB files, fast generation"
            },
            "elevenlabs": {
                "voice_id": "ErXwobaYiN019PkySvjV", 
                "quality": "premium",
                "description": "~1.6MB files, high quality"
            }
        }
        return configs.get(tts_model, configs["openai"])

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_podcast_from_text", 
            "description": "Generate a podcast directly from text content. This is the FASTEST method - no database lookups required! Perfect for creating quick podcasts from any text content like articles, summaries, or custom content. Works instantly without needing agent run IDs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text content to convert into a podcast. Can be any text - articles, summaries, conversations, etc."
                    },
                    "podcast_title": {
                        "type": "string",
                        "description": "Title for the podcast",
                        "default": "Custom Text Podcast"
                    },
                    "tts_model": {
                        "type": "string",
                        "description": "TTS model to use: 'openai' (cost-effective, ~307KB files) or 'elevenlabs' (premium quality, ~1.6MB files)",
                        "enum": ["openai", "elevenlabs"],
                        "default": "openai"
                    },
                    "conversation_style": {
                        "type": "string",
                        "description": "Style of the podcast conversation",
                        "enum": ["informative", "casual", "formal", "educational", "news_analysis"],
                        "default": "informative"
                    }
                },
                "required": ["text"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="generate_podcast_from_text">
        <parameter name="text">Rate limits are essential for API management. They prevent abuse and ensure fair usage across all users. Common rate limit types include per-second, per-minute, and per-hour limits.</parameter>
        <parameter name="podcast_title">Understanding API Rate Limits</parameter>
        <parameter name="tts_model">openai</parameter>
        <parameter name="conversation_style">educational</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_podcast_from_text(
        self,
        text: str,
        podcast_title: str = "Custom Text Podcast",
        tts_model: str = "openai",
        conversation_style: str = "informative"
    ) -> ToolResult:
        """
        Generate a podcast directly from text content - FASTEST method!
        
        Args:
            text: The text content to convert into a podcast
            podcast_title: Title for the podcast
            tts_model: TTS model to use for generation
            conversation_style: Style of the conversation
            
        Returns:
            ToolResult with podcast URL or generation status
        """
        try:
            logger.info(f"Starting fast podcast generation from text: {podcast_title}")
            
            # Validate input
            if not text or not text.strip():
                return self.fail_response("Please provide some text content for the podcast.")
            
            # Configure TTS model and voice
            voice_config = self._get_tts_config(tts_model)
            
            # Prepare payload for direct text generation
            payload = {
                "text": text.strip(),
                "title": podcast_title,
                "tts_model": tts_model,
                "voice_id": voice_config["voice_id"],
                "conversation_style": conversation_style,
                "metadata": {
                    "source": "omni_direct_text",
                    "generated_at": datetime.now().isoformat(),
                    "tts_model": tts_model,
                    "quality": voice_config["quality"]
                }
            }
            
            # Call Podcastfy service directly (no database lookups!)
            async with httpx.AsyncClient(timeout=180.0) as client:
                # Make the podcast generation request
                response = await client.post(
                    f"{self.podcastfy_url}/api/generate", 
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                logger.info(f"Podcastfy response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    return self.success_response({
                        "status": "Fast podcast generated successfully from text",
                        "podcast_url": result.get("podcast_url"),
                        "audio_url": result.get("audio_url"), 
                        "podcast_id": result.get("podcast_id"),
                        "title": podcast_title,
                        "tts_model": tts_model,
                        "conversation_style": conversation_style,
                        "text_length": len(text),
                        "method": "direct_text_generation",
                        "service_response": result
                    })
                else:
                    error_text = response.text
                    logger.error(f"Podcastfy service error: {response.status_code} - {error_text}")
                    
                    # Provide user-friendly error messages
                    if response.status_code == 502:
                        user_error = "Podcast service is temporarily unavailable (Bad Gateway). Please try again later."
                    elif response.status_code == 503:
                        user_error = "Podcast service is temporarily unavailable. Please try again later."
                    elif response.status_code == 500:
                        user_error = "Internal server error in podcast service. Please try again later."
                    else:
                        user_error = f"Podcast service returned HTTP {response.status_code}"
                    
                    return self.fail_response(f"{user_error}: {error_text[:200] if error_text else 'No details'}")
                    
        except httpx.TimeoutException:
            logger.error("Podcastfy service timeout for text generation")
            return self.fail_response("Request to Podcastfy service timed out. Please try again.")
        except Exception as e:
            logger.error(f"Error generating podcast from text: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to generate podcast from text: {str(e)}")


if __name__ == "__main__":
    import asyncio
    from agentpress.thread_manager import ThreadManager
    
    async def test_podcast_tool():
        """Test the podcast tool functionality."""
        # This would normally be called with proper project_id and thread_manager
        print("Podcast tool test - would require actual database and service connections")
        
    asyncio.run(test_podcast_tool())