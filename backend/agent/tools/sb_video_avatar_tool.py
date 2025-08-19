import httpx
import json
import asyncio
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
from agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from utils.logger import logger
from utils.config import config


class SandboxVideoAvatarTool(SandboxToolsBase):
    """
    A tool for creating and generating videos with AI avatars using HeyGen.
    
    This tool provides functionality to:
    - Generate MP4 video files with AI avatars speaking custom text
    - Create interactive avatar sessions with customizable settings
    - Make avatars speak with text or conversational responses
    - Manage avatar states (listening, speaking, idle)
    - Handle voice chat interactions
    - Configure avatar appearance and voice settings
    
    Use this tool whenever users want to: create videos, make avatar videos, generate content with AI presenters, 
    create talking avatars, make AI spokespersons, or produce video content with virtual humans.
    """

    name: str = "sb_video_avatar_tool"
    
    # Keywords that should trigger this tool: video, avatar, generate, create, speech, presentation, content
    # Force deployment update: 2025-08-19T05:15:00
    
    # Avatar configuration options
    AVATAR_OPTIONS = {
        "kristin_professional": {
            "avatar_id": "Kristin_public_3_20240108",
            "name": "Kristin (Professional Female)",
            "description": "Professional businesswoman",
            "category": "professional",
            "gender": "female"
        },
        "josh_casual": {
            "avatar_id": "josh_lite3_20230714",
            "name": "Josh (Casual Male)",
            "description": "Casual young professional",
            "category": "casual",
            "gender": "male"
        },
        "anna_professional": {
            "avatar_id": "anna_costume1_cameraA_20220818",
            "name": "Anna (Professional Female)", 
            "description": "Professional businesswoman",
            "category": "professional",
            "gender": "female"
        },
        "monica_casual": {
            "avatar_id": "Monica_public_20230807",
            "name": "Monica (Casual Female)",
            "description": "Casual friendly woman",
            "category": "casual",
            "gender": "female"
        },
        "wayne_business": {
            "avatar_id": "Wayne_public_20230807",
            "name": "Wayne (Business Male)",
            "description": "Professional businessman",
            "category": "professional",
            "gender": "male"
        }
    }

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.heygen_api_key = config.HEYGEN_API_KEY
        self.heygen_base_url = "https://api.heygen.com"
        self.active_sessions: Dict[str, str] = {}  # Maps session names to session IDs
        
        if not self.heygen_api_key:
            logger.warning("HeyGen API key not configured. Video avatar functionality will be limited.")
        else:
            # Log key info for debugging (first/last chars only for security)
            key_preview = f"{self.heygen_api_key[:8]}...{self.heygen_api_key[-8:]}" if len(self.heygen_api_key) > 16 else "short_key"
            logger.info(f"HeyGen API key configured successfully: {key_preview}")
    
    def _get_heygen_headers(self) -> Dict[str, str]:
        """Get standard headers for HeyGen API requests."""
        return {
            "X-API-KEY": self.heygen_api_key,
            "Content-Type": "application/json"
        }

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_avatar_video",
            "description": "Generate and create a downloadable MP4 video file with an AI avatar speaking the provided text. Use this for: making videos, creating content, video generation, avatar videos, AI presenters, virtual speakers, talking avatars, video creation, and content production. This creates an actual video file that can be downloaded and shared.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Text for the avatar to speak in the video"
                    },
                    "avatar_id": {
                        "type": "string",
                        "description": "HeyGen avatar ID to use. Use 'default' or specific avatar IDs from HeyGen",
                        "default": "default"
                    },
                    "voice_id": {
                        "type": "string", 
                        "description": "Voice ID for the avatar's speech. Use 'default' to auto-select first available voice, or use list_available_voices to see all options",
                        "default": "default"
                    },
                    "video_title": {
                        "type": "string",
                        "description": "Optional title for the video file",
                        "default": "Avatar Video"
                    },
                    "background_color": {
                        "type": "string",
                        "description": "Background color in hex format (e.g., '#ffffff' for white)",
                        "default": "#ffffff"
                    },
                    "video_quality": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Video quality setting",
                        "default": "medium"
                    },
                    "async_polling": {
                        "type": "boolean",
                        "description": "Use smart async polling - starts generation, polls every 10 seconds, returns final video when ready",
                        "default": True
                    },
                    "wait_for_completion": {
                        "type": "boolean", 
                        "description": "Whether to wait for video generation to complete before returning (blocking approach)",
                        "default": False
                    },
                    "max_wait_time": {
                        "type": "integer",
                        "description": "Maximum time in seconds to wait for video completion (only when wait_for_completion is true)",
                        "default": 90
                    }
                },
                "required": ["text"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="generate_avatar_video">
        <parameter name="text">Hello! Welcome to our new AI-powered customer service. How can I help you today?</parameter>
        <parameter name="avatar_id">Kristin_public_3_20240108</parameter>
        <parameter name="voice_id">professional_female_1</parameter>
        <parameter name="video_title">Customer Service Introduction</parameter>
        <parameter name="background_color">#f0f8ff</parameter>
        <parameter name="wait_for_completion">true</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_avatar_video(
        self,
        text: str,
        avatar_id: str = "default",
        voice_id: str = "default",
        video_title: str = "Avatar Video",
        background_color: str = "#ffffff",
        video_quality: str = "medium",
        async_polling: bool = True,
        wait_for_completion: bool = False,
        max_wait_time: int = 90
    ) -> ToolResult:
        """Generate a downloadable MP4 video with an avatar speaking the provided text."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured. Please add HEYGEN_API_KEY to your environment variables.")
            
            # Debug: Log the API key format being used
            key_preview = f"{self.heygen_api_key[:8]}...{self.heygen_api_key[-8:]}" if len(self.heygen_api_key) > 16 else self.heygen_api_key
            logger.info(f"Starting avatar video generation with key: {key_preview}")
            logger.info(f"Starting avatar video generation: {video_title}")
            
            # Prepare video generation request
            video_data = {
                "video_inputs": [{
                    "character": {
                        "type": "avatar",
                        "avatar_id": avatar_id if avatar_id != "default" else "Kristin_public_3_20240108",
                        "avatar_style": "normal"
                    },
                    "voice": {
                        "type": "text",
                        "input_text": text,
                        "voice_id": voice_id if voice_id != "default" else "1bd001e7e50f421d891986aad5158bc8"
                    },
                    "background": {
                        "type": "color",
                        "value": background_color
                    }
                }],
                "dimension": {
                    "width": 1280,
                    "height": 720
                },
                "aspect_ratio": "16:9",
                "test": False,
                "caption": False
            }
            
            # Add quality settings
            quality_settings = {
                "low": {"fps": 24, "bitrate": 1000},
                "medium": {"fps": 30, "bitrate": 2000}, 
                "high": {"fps": 30, "bitrate": 4000}
            }
            video_data.update(quality_settings.get(video_quality, quality_settings["medium"]))
            
            # Make request to HeyGen API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v2/video/generate",
                    headers=self._get_heygen_headers(),
                    json=video_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    error_msg = f"HeyGen API error: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    return self.fail_response(error_msg)
                
                result = response.json()
                video_id = result.get("data", {}).get("video_id")
                
                if not video_id:
                    return self.fail_response("Failed to get video ID from HeyGen response")
                
                logger.info(f"Video generation started with ID: {video_id}")
                
                # Smart async polling approach
                if async_polling:
                    return await self._async_poll_and_download(video_id, video_title, text, avatar_id, voice_id, max_wait_time)
                    
                elif wait_for_completion:
                    # Traditional blocking approach 
                    video_url = await self._wait_for_video_completion(video_id, max_wait_time)
                    if video_url:
                        download_path = await self._download_video(video_url, video_title, video_id)
                        if download_path:
                            # Save metadata
                            await self._save_video_metadata(video_id, video_title, text, avatar_id, voice_id, download_path)
                            
                            logger.info(f"Successfully generated and downloaded video: {download_path}")
                            return self.success_response(
                                f"Avatar video generated successfully! Video saved as: {download_path}\n"
                                f"Video ID: {video_id}\n"
                                f"Title: {video_title}\n"
                                f"Avatar: {avatar_id}\n"
                                f"Text: {text[:100]}{'...' if len(text) > 100 else ''}",
                                attachments=[download_path]
                            )
                        else:
                            logger.error(f"Video {video_id} generation completed but download failed")
                            return self.fail_response("Video generation completed but download failed")
                    else:
                        return self.fail_response("Video generation timed out or failed")
                else:
                    # Quick return approach
                    return self.success_response(
                        f"🎬 Avatar video generation started successfully!\n\n"
                        f"Video ID: {video_id}\n"
                        f"Text: \"{text}\"\n"
                        f"Avatar: {avatar_id}\n\n" 
                        f"📹 Your video is now processing (typically takes 30-60 seconds).\n"
                        f"Use check_video_status('{video_id}') to check progress and download when ready!"
                    )
                    
        except Exception as e:
            error_msg = f"Failed to generate avatar video: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return self.fail_response(error_msg)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_avatar_session",
            "description": "Create a new interactive video avatar session with customizable settings. This sets up the avatar with specified appearance, voice, and behavioral parameters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_name": {
                        "type": "string",
                        "description": "Unique name for this avatar session (used for management and reference)"
                    },
                    "selected_avatar": {
                        "type": "string",
                        "description": "Avatar option key from available avatars (e.g., 'wayne_professional', 'susan_professional') or 'custom' to use custom_avatar_id",
                        "enum": ["kristin_professional", "josh_casual", "anna_professional", "monica_casual", "wayne_business", "custom"]
                    },
                    "custom_avatar_id": {
                        "type": "string",
                        "description": "Custom HeyGen avatar ID (required if selected_avatar is 'custom')",
                        "default": ""
                    },
                    "selected_voice": {
                        "type": "string",
                        "description": "Voice option to use for the avatar",
                        "default": "professional_male_1"
                    },
                    "voice_emotion": {
                        "type": "string",
                        "enum": ["EXCITED", "SERIOUS", "FRIENDLY", "SOOTHING", "BROADCASTER"],
                        "description": "Emotion/tone for the avatar's voice",
                        "default": "FRIENDLY"
                    },
                    "quality": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Video quality for the streaming session",
                        "default": "medium"
                    },
                    "enable_voice_chat": {
                        "type": "boolean",
                        "description": "Enable voice chat functionality for interactive conversations",
                        "default": True
                    },
                    "knowledge_base": {
                        "type": "string",
                        "description": "Knowledge base or personality prompt for the avatar's responses",
                        "default": "You are a helpful AI assistant. Be friendly and professional in your responses."
                    },
                    "language": {
                        "type": "string",
                        "description": "Language code for the avatar (e.g., 'en' for English, 'es' for Spanish)",
                        "default": "en"
                    }
                },
                "required": ["session_name", "selected_avatar"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="create_avatar_session">
        <parameter name="session_name">sales_demo_avatar</parameter>
        <parameter name="selected_avatar">kristin_professional</parameter>
        <parameter name="selected_voice">professional_male_1</parameter>
        <parameter name="voice_emotion">FRIENDLY</parameter>
        <parameter name="quality">high</parameter>
        <parameter name="enable_voice_chat">true</parameter>
        <parameter name="knowledge_base">You are a sales representative for our SaaS product. Be enthusiastic, knowledgeable, and focus on the customer's needs.</parameter>
        </invoke>
        </function_calls>
    ''')
    async def create_avatar_session(
        self,
        session_name: str,
        selected_avatar: str,
        custom_avatar_id: str = "",
        selected_voice: str = "professional_male_1",
        voice_emotion: str = "FRIENDLY",
        quality: str = "medium",
        enable_voice_chat: bool = True,
        knowledge_base: str = "You are a helpful AI assistant. Be friendly and professional in your responses.",
        language: str = "en"
    ) -> ToolResult:
        """Create a new interactive avatar session."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured. Please add HEYGEN_API_KEY to your environment variables.")
            
            # Determine avatar ID
            if selected_avatar == "custom":
                if not custom_avatar_id:
                    return self.fail_response("custom_avatar_id is required when selected_avatar is 'custom'")
                avatar_id = custom_avatar_id
                avatar_name = "Custom Avatar"
            else:
                avatar_config = self.AVATAR_OPTIONS.get(selected_avatar)
                if not avatar_config:
                    return self.fail_response(f"Unknown avatar option: {selected_avatar}")
                avatar_id = avatar_config["avatar_id"]
                avatar_name = avatar_config["name"]
            
            logger.info(f"Creating avatar session '{session_name}' with avatar {avatar_name}")
            
            # Prepare session creation request
            session_data = {
                "quality": quality,
                "avatar_name": avatar_id,
                "voice": {
                    "voice_id": selected_voice,
                    "rate": 1.0,
                    "emotion": voice_emotion
                },
                "knowledge_base": knowledge_base,
                "language": language,
                "disable_idleness": False
            }
            
            # Create session via HeyGen API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v1/streaming.create_token",
                    headers=self._get_heygen_headers(),
                    json=session_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    error_msg = f"HeyGen API error: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    return self.fail_response(error_msg)
                
                result = response.json()
                
                if result.get("code") != 100:
                    return self.fail_response(f"HeyGen session creation failed: {result.get('message', 'Unknown error')}")
                
                session_token = result.get("data", {}).get("token")
                session_id = result.get("data", {}).get("session_id", session_token)  # Fallback to token if no session_id
                
                if not session_token:
                    return self.fail_response("Failed to get session token from HeyGen response")
                
                # Store session info
                self.active_sessions[session_name] = session_id
                
                # Save session metadata to workspace
                await self._save_session_metadata(session_name, {
                    "session_id": session_id,
                    "session_token": session_token,
                    "avatar_id": avatar_id,
                    "avatar_name": avatar_name,
                    "selected_voice": selected_voice,
                    "voice_emotion": voice_emotion,
                    "quality": quality,
                    "enable_voice_chat": enable_voice_chat,
                    "knowledge_base": knowledge_base,
                    "language": language,
                    "created_at": datetime.utcnow().isoformat()
                })
                
                logger.info(f"Avatar session '{session_name}' created successfully with ID: {session_id}")
                
                return self.success_response(
                    f"Interactive avatar session '{session_name}' created successfully!\n"
                    f"Session ID: {session_id}\n"
                    f"Avatar: {avatar_name} ({avatar_id})\n"
                    f"Voice: {selected_voice} ({voice_emotion})\n"
                    f"Quality: {quality}\n"
                    f"Voice Chat: {'Enabled' if enable_voice_chat else 'Disabled'}\n"
                    f"Language: {language}\n\n"
                    f"You can now use make_avatar_speak to make the avatar talk, or other session management commands."
                )
                
        except Exception as e:
            error_msg = f"Failed to create avatar session: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return self.fail_response(error_msg)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "make_avatar_speak",
            "description": "Make an avatar in an active session speak the provided text. The avatar will generate speech and display the corresponding lip-sync animation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_name": {
                        "type": "string",
                        "description": "Name of the avatar session to use"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text for the avatar to speak"
                    },
                    "task_type": {
                        "type": "string",
                        "enum": ["repeat", "chat"],
                        "description": "Type of task - 'repeat' for simple text-to-speech, 'chat' for conversational responses",
                        "default": "repeat"
                    }
                },
                "required": ["session_name", "text"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="make_avatar_speak">
        <parameter name="session_name">sales_demo_avatar</parameter>
        <parameter name="text">Hello! I'm excited to tell you about our amazing new features.</parameter>
        <parameter name="task_type">repeat</parameter>
        </invoke>
        </function_calls>
    ''')
    async def make_avatar_speak(
        self,
        session_name: str,
        text: str,
        task_type: str = "repeat"
    ) -> ToolResult:
        """Make an avatar speak the provided text."""
        try:
            if session_name not in self.active_sessions:
                return self.fail_response(f"No active session found with name '{session_name}'. Create a session first using create_avatar_session.")
            
            session_id = self.active_sessions[session_name]
            logger.info(f"Making avatar speak in session '{session_name}': {text[:50]}...")
            
            # Prepare speak request
            speak_data = {
                "session_id": session_id,
                "text": text,
                "task_type": task_type
            }
            
            # Make avatar speak via HeyGen API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v1/streaming.task",
                    headers=self._get_heygen_headers(),
                    json=speak_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    error_msg = f"HeyGen API error: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    return self.fail_response(error_msg)
                
                result = response.json()
                
                if result.get("code") != 100:
                    return self.fail_response(f"HeyGen speak task failed: {result.get('message', 'Unknown error')}")
                
                task_id = result.get("data", {}).get("task_id")
                
                return self.success_response(
                    f"Avatar is now speaking in session '{session_name}'!\n"
                    f"Task ID: {task_id}\n"
                    f"Text: {text}\n"
                    f"Task Type: {task_type}"
                )
                
        except Exception as e:
            error_msg = f"Failed to make avatar speak: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return self.fail_response(error_msg)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "check_video_status",
            "description": "Check the status of a video generation job and download when ready.",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_id": {
                        "type": "string",
                        "description": "Video ID to check status for"
                    },
                    "download_if_ready": {
                        "type": "boolean",
                        "description": "Automatically download the video if it's ready",
                        "default": True
                    }
                },
                "required": ["video_id"]
            }
        }
    })
    async def check_video_status(self, video_id: str, download_if_ready: bool = True) -> ToolResult:
        """Check the status of a video generation job."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            # Validate video ID format (should be 32 hex chars)
            if not video_id or len(video_id) != 32 or not all(c in '0123456789abcdef' for c in video_id):
                return self.fail_response(f"Invalid video ID format: '{video_id}'. Expected 32-character hex string.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v1/video_status.get?video_id={video_id}",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"HeyGen API error: {response.status_code} - {response.text}")
                
                result = response.json()
                status = result.get("data", {}).get("status")
                video_url = result.get("data", {}).get("video_url")
                
                if status == "completed" and video_url and download_if_ready:
                    download_path = await self._download_video(video_url, f"video_{video_id}", video_id)
                    if download_path:
                        logger.info(f"Video {video_id} completed and downloaded: {download_path}")
                        return self.success_response(
                            f"Video generation completed! Video downloaded to: {download_path}\n"
                            f"Video ID: {video_id}\n"
                            f"Status: {status}",
                            attachments=[download_path]
                        )
                    else:
                        logger.error(f"Video {video_id} completed but download failed")
                        return self.fail_response("Video completed but download failed")
                
                return self.success_response(
                    f"Video Status: {status}\n"
                    f"Video ID: {video_id}\n" +
                    (f"Video URL: {video_url}" if video_url else "Video not ready yet")
                )
                
        except Exception as e:
            return self.fail_response(f"Failed to check video status: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_avatar_options",
            "description": "List all available avatar options with their details.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def list_avatar_options(self) -> ToolResult:
        """List all available avatar options."""
        try:
            avatar_list = []
            for key, config in self.AVATAR_OPTIONS.items():
                avatar_list.append(f"• {key}: {config['name']} - {config['description']} (ID: {config['avatar_id']})")
            
            return self.success_response(
                "Available Avatar Options:\n\n" + "\n".join(avatar_list) + 
                "\n\nYou can also use 'custom' with a custom_avatar_id parameter to use any HeyGen avatar ID."
            )
            
        except Exception as e:
            return self.fail_response(f"Failed to list avatar options: {str(e)}")

    @openapi_schema({
        "type": "function", 
        "function": {
            "name": "close_avatar_session",
            "description": "Close an active avatar session and clean up resources.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_name": {
                        "type": "string",
                        "description": "Name of the session to close"
                    }
                },
                "required": ["session_name"]
            }
        }
    })
    async def close_avatar_session(self, session_name: str) -> ToolResult:
        """Close an avatar session."""
        try:
            if session_name not in self.active_sessions:
                return self.fail_response(f"No active session found with name '{session_name}'")
            
            session_id = self.active_sessions[session_name]
            
            # Close session via HeyGen API
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v1/streaming.stop",
                    headers=self._get_heygen_headers(),
                    json={"session_id": session_id},
                    timeout=30.0
                )
                
                # Remove from active sessions regardless of API response
                del self.active_sessions[session_name]
                
                return self.success_response(f"Avatar session '{session_name}' closed successfully.")
                
        except Exception as e:
            # Still remove from active sessions
            if session_name in self.active_sessions:
                del self.active_sessions[session_name]
            return self.fail_response(f"Failed to close avatar session cleanly: {str(e)}")

    # Helper methods

    async def _async_poll_and_download(
        self, 
        video_id: str, 
        video_title: str, 
        text: str, 
        avatar_id: str, 
        voice_id: str, 
        max_wait_time: int = 90
    ) -> ToolResult:
        """Smart async polling: starts generation, polls with progress updates, returns final video."""
        logger.info(f"Starting smart async polling for video {video_id}")
        
        # Initial response - let user know we're processing (logged instead of messaged)
        logger.info(f"Starting async video generation for video_id: {video_id}, text: {text[:50]}")
        
        start_time = asyncio.get_event_loop().time()
        check_count = 0
        
        while (asyncio.get_event_loop().time() - start_time) < max_wait_time:
            try:
                check_count += 1
                
                # Check video status
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{self.heygen_base_url}/v1/video_status.get?video_id={video_id}",
                        headers=self._get_heygen_headers(),
                        timeout=15.0
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        status = result.get("data", {}).get("status")
                        video_url = result.get("data", {}).get("video_url")
                        
                        if status == "completed" and video_url:
                            # Video is ready! Download it
                            logger.info(f"Video {video_id} completed, downloading...")
                            
                            logger.info(f"Video {video_id} completed, downloading to sandbox...")
                            
                            download_path = await self._download_video(video_url, video_title, video_id)
                            if download_path:
                                # Save metadata
                                await self._save_video_metadata(video_id, video_title, text, avatar_id, voice_id, download_path)
                                
                                logger.info(f"Successfully downloaded video: {download_path}")
                                return self.success_response(
                                    f"🎉 **Avatar video completed and downloaded!**\n\n"
                                    f"📁 **File:** `{download_path}`\n"
                                    f"🎬 **Video ID:** `{video_id}`\n"
                                    f"📝 **Text:** \"{text}\"\n"
                                    f"👤 **Avatar:** {avatar_id}\n"
                                    f"⏱️ **Processing time:** {int(asyncio.get_event_loop().time() - start_time)} seconds\n\n"
                                    f"Your video is ready for download from the sandbox!",
                                    attachments=[download_path]
                                )
                            else:
                                logger.error(f"Video {video_id} completed but download failed")
                                return self.fail_response("Video completed successfully but failed to download to sandbox")
                                
                        elif status == "failed":
                            logger.error(f"Video {video_id} generation failed")
                            return self.fail_response(f"HeyGen video generation failed for video ID: {video_id}")
                            
                        else:
                            # Still processing - give progress update every few checks
                            elapsed = int(asyncio.get_event_loop().time() - start_time)
                            if check_count % 3 == 0:  # Every 3rd check (roughly every 30 seconds)
                                logger.info(f"Video {video_id} still processing: {elapsed}s elapsed, status: {status}")
                            
                            logger.info(f"Video {video_id} status: {status}, elapsed: {elapsed}s")
                            
            except Exception as e:
                logger.error(f"Error polling video status: {e}")
            
            # Smart polling intervals: start fast, then slow down
            if check_count <= 3:
                await asyncio.sleep(8)   # First 3 checks: every 8 seconds  
            elif check_count <= 8:
                await asyncio.sleep(12)  # Next 5 checks: every 12 seconds
            else:
                await asyncio.sleep(15)  # After that: every 15 seconds
        
        # Timeout reached
        logger.warning(f"Video {video_id} timed out after {max_wait_time} seconds")
        return self.fail_response(
            f"Video generation timed out after {max_wait_time} seconds. "
            f"Video ID: {video_id} - you can check status manually later."
        )

    async def _wait_for_video_completion(self, video_id: str, max_wait_time: int = 300) -> Optional[str]:
        """Wait for video generation to complete and return the video URL."""
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < max_wait_time:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{self.heygen_base_url}/v1/video_status.get?video_id={video_id}",
                        headers=self._get_heygen_headers(),
                        timeout=30.0
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        status = result.get("data", {}).get("status")
                        video_url = result.get("data", {}).get("video_url")
                        
                        if status == "completed" and video_url:
                            logger.info(f"Video {video_id} completed successfully")
                            return video_url
                        elif status == "failed":
                            logger.error(f"Video {video_id} generation failed")
                            return None
                        
                        logger.info(f"Video {video_id} status: {status}, waiting...")
                
            except Exception as e:
                logger.error(f"Error checking video status: {e}")
            
            await asyncio.sleep(10)  # Wait 10 seconds before next check
        
        logger.warning(f"Video {video_id} generation timed out after {max_wait_time} seconds")
        return None

    async def _download_video(self, video_url: str, title: str, video_id: str) -> Optional[str]:
        """Download video to sandbox workspace."""
        try:
            logger.info(f"Starting video download for {video_id}")
            
            # Ensure sandbox is ready
            try:
                await self._ensure_sandbox()
                logger.info(f"Sandbox initialized successfully, ID: {self.sandbox_id}")
            except Exception as sandbox_error:
                logger.error(f"Failed to initialize sandbox: {sandbox_error}")
                raise Exception(f"Sandbox initialization failed: {sandbox_error}")
            
            # Clean filename
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
            filename = f"{safe_title}_{video_id}.mp4"
            file_path = f"/workspace/{filename}"
            
            logger.info(f"Target file path: {file_path}, filename: {filename}")
            
            # Download video
            logger.info(f"Downloading video from: {video_url[:50]}...")
            async with httpx.AsyncClient() as client:
                response = await client.get(video_url, timeout=120.0)
                response.raise_for_status()
                
                # Log download success
                content_size = len(response.content)
                logger.info(f"Downloaded {content_size} bytes from HeyGen")
                
                # Save to sandbox with detailed error handling
                try:
                    await self.sandbox.fs.upload_file(response.content, file_path)
                    logger.info(f"Successfully wrote video to sandbox: {file_path}")
                except Exception as write_error:
                    logger.error(f"Sandbox file write failed: {write_error}")
                    logger.error(f"Attempted to write {content_size} bytes to {file_path}")
                    raise Exception(f"Sandbox write failed: {write_error}")
                
                logger.info(f"Video downloaded successfully: {file_path}")
                return filename  # Return relative path for attachment
                
        except Exception as e:
            logger.error(f"Failed to download video: {e}")
            return None

    async def _save_video_metadata(self, video_id: str, title: str, text: str, avatar_id: str, voice_id: str, file_path: str):
        """Save video metadata as JSON file."""
        try:
            await self._ensure_sandbox()
            
            metadata = {
                "video_id": video_id,
                "title": title,
                "text": text,
                "avatar_id": avatar_id,
                "voice_id": voice_id,
                "file_path": file_path,
                "generated_at": datetime.utcnow().isoformat(),
                "tool": "sb_video_avatar_tool"
            }
            
            metadata_path = f"/workspace/{title.replace(' ', '_')}_{video_id}_metadata.json"
            await self.sandbox.fs.upload_file(json.dumps(metadata, indent=2).encode(), metadata_path)
            
            logger.info(f"Video metadata saved: {metadata_path}")
            
        except Exception as e:
            logger.warning(f"Failed to save video metadata: {e}")

    async def _save_session_metadata(self, session_name: str, session_data: Dict[str, Any]):
        """Save session metadata as JSON file."""
        try:
            await self._ensure_sandbox()
            
            metadata_path = f"/workspace/avatar_session_{session_name}_metadata.json"
            await self.sandbox.fs.upload_file(json.dumps(session_data, indent=2).encode(), metadata_path)
            
            logger.info(f"Session metadata saved: {metadata_path}")
            
        except Exception as e:
            logger.warning(f"Failed to save session metadata: {e}")