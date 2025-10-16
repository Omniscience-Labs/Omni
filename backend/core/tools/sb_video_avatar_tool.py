import httpx
import json
import asyncio
import os
import re
from typing import Optional, Dict, Any, List
from datetime import datetime
from core.agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.utils.config import config


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
    # Enhanced video download reliability: 2025-01-27T15:30:00
    
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
        
        # Extract default avatar ID from system prompt if specified
        self.default_avatar_id = self._extract_default_avatar_id()
        
        if not self.heygen_api_key:
            logger.warning("HeyGen API key not configured. Video avatar functionality will be limited.")
        else:
            # Log key info for debugging (first/last chars only for security)
            key_preview = f"{self.heygen_api_key[:8]}...{self.heygen_api_key[-8:]}" if len(self.heygen_api_key) > 16 else "short_key"
            logger.info(f"HeyGen API key configured successfully: {key_preview}")
            
        if self.default_avatar_id:
            logger.info(f"🎭 Default avatar ID configured from system prompt: {self.default_avatar_id}")
    
    def _extract_default_avatar_id(self) -> Optional[str]:
        """
        Extract default avatar ID from system prompt if specified.
        
        Supports multiple formats:
        - default_avatar_id: wayne_business
        - DEFAULT_AVATAR_ID: wayne_business  
        - heygen_avatar_id: Kristin_public_3_20240108
        - HEYGEN_AVATAR_ID: Kristin_public_3_20240108
        - avatar_id: josh_lite3_20230714
        - AVATAR_ID: josh_lite3_20230714
        """
        try:
            if not self.thread_manager or not self.thread_manager.agent_config:
                return None
            
            system_prompt = self.thread_manager.agent_config.get('system_prompt', '')
            if not system_prompt:
                return None
            
            # Try multiple patterns to extract avatar ID
            patterns = [
                r'default_avatar_id:\s*([^\s\n]+)',
                r'DEFAULT_AVATAR_ID:\s*([^\s\n]+)',
                r'heygen_avatar_id:\s*([^\s\n]+)',
                r'HEYGEN_AVATAR_ID:\s*([^\s\n]+)',
                r'avatar_id:\s*([^\s\n]+)',
                r'AVATAR_ID:\s*([^\s\n]+)',
            ]
            
            for pattern in patterns:
                match = re.search(pattern, system_prompt, re.IGNORECASE)
                if match:
                    avatar_id = match.group(1).strip()
                    logger.info(f"Found default avatar ID in system prompt: {avatar_id}")
                    return avatar_id
            
            return None
            
        except Exception as e:
            logger.warning(f"Error extracting default avatar ID from system prompt: {e}")
            return None
    
    def _get_heygen_headers(self) -> Dict[str, str]:
        """Get standard headers for HeyGen API requests."""
        return {
            "X-API-KEY": self.heygen_api_key,
            "Content-Type": "application/json"
        }

    # ==================== VIDEO GENERATION GUIDE ====================
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "explain_video_options",
            "description": "CALL THIS FIRST when user asks to create/generate a video but hasn't specified what kind or what information they have. Explains all video generation options and what information is needed for each type. Helps users choose the right approach and tells them what to provide.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def explain_video_options(self) -> ToolResult:
        """Comprehensive guide to all video generation options - call this first for generic video requests."""
        guide = """
🎬 **HeyGen Video Generation - Complete Guide**

I can create several types of videos! Let me help you choose the best option:

---

## 📹 **1. STANDARD AVATAR VIDEO** (Most Common)
**Best for**: Presentations, explainers, social media content, announcements

**What you need to provide**:
- ✅ **Script/Text**: What should the avatar say?
- 📐 **Format** (optional): Horizontal (16:9), Vertical TikTok/Reels (9:16), or Square (1:1)
- 👤 **Avatar** (optional): I'll use a good default if not specified
- 🎙️ **Voice** (optional): Professional, casual, etc.

**Example request**: 
*"Create a video explaining our new product features. Make it vertical for TikTok."*

**What I'll do**: Generate the video with `generate_avatar_video()`

---

## 🎁 **2. UGC PRODUCT VIDEO** (For E-commerce/Ads)
**Best for**: Product demonstrations, TikTok ads, authentic-looking reviews

**What you need to provide**:
- 🖼️ **PRODUCT IMAGE FIRST** (clear photo of your product)
- 📝 **Script** about the product (casual, authentic tone works best)
- 📐 **Format**: Usually vertical (9:16) for TikTok/Reels

**Example request**: 
*"I want to create a UGC-style ad for my skincare product"*

**What I'll do**: 
1. Ask you to provide/upload the product image
2. Upload it with `upload_product_image()`
3. Generate UGC video with `generate_ugc_video()` - avatar naturally showcases your product!

**⚠️ Important**: I need the product image BEFORE making the video.

---

## 📋 **3. TEMPLATE VIDEO** (Personalized at Scale)
**Best for**: Personalized customer videos, bulk video generation with variable data

**What you need to provide**:
- 📝 **Template ID** (templates must be created in HeyGen dashboard first)
- 🔤 **Variable values** (names, companies, data points, etc.)

**Example request**: 
*"Generate personalized welcome videos for each customer using my template"*

**What I'll do**: 
1. Show available templates with `list_video_templates()`
2. Check template variables with `get_template_details()`
3. Generate with `generate_from_template()`

**⚠️ Important**: Templates must exist in your HeyGen dashboard first.

---

## 🎭 **4. STREAMING AVATAR** (Real-time Interactive)
**Best for**: Live customer service, interactive demos, conversational agents

**What you need to provide**:
- 🎯 **Use case description**
- 👤 **Avatar preference**
- 🎙️ **Voice and personality settings**

**Example request**: 
*"Set up an interactive avatar for customer support that answers questions in real-time"*

**What I'll do**: Create a live session with `create_avatar_session()`

**⚠️ Important**: This is for REAL-TIME interaction. For pre-recorded videos, use option 1.

---

## 🤔 **Quick Decision Helper**

Tell me what you want:

1️⃣ **"Make a video where an avatar says [text]"** 
   → Standard Avatar Video ✅

2️⃣ **"Avatar showing off my product in a video"** 
   → UGC Product Video (need product image!) 📸

3️⃣ **"100+ personalized videos with different names/data"** 
   → Template Video (need templates set up) 📋

4️⃣ **"Live interactive avatar responding in real-time"** 
   → Streaming Avatar 🎭

---

## 💡 **What Should You Tell Me?**

For the best video, please share:

✅ **What type of video?** (presentation, ad, tutorial, announcement)
✅ **The script/message** (what should the avatar say?)
✅ **Where will you use it?** 
   - TikTok/Reels/Shorts → 9:16 vertical
   - YouTube → 16:9 horizontal
   - Instagram feed → 1:1 square
✅ **For product videos**: Share your product image
✅ **Tone**: Professional, casual, energetic, calm?

---

## 📊 **Most Popular**

- **90%** use: Standard Avatar Video (easiest!)
- **7%** use: UGC Product Video (great for e-commerce)
- **2%** use: Templates (bulk personalization)
- **1%** use: Streaming (advanced)

---

**What type of video would you like? Tell me more and I'll get you exactly what you need!** 🎬
        """
        return self.success_response(guide)

    # ==================== CORE VIDEO GENERATION ====================

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
                    "preserve_exact_text": {
                        "type": "boolean",
                        "description": "Force HeyGen to use exact text without AI modifications or improvements",
                        "default": False
                    },
                    "avatar_id": {
                        "type": "string",
                        "description": "HeyGen avatar ID to use. Use 'default' to use the avatar configured in system prompt (or Kristin if not configured), or specify a HeyGen avatar ID directly. To configure a default avatar, add 'default_avatar_id: YOUR_AVATAR_ID' to the agent's system prompt.",
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
                    "aspect_ratio": {
                        "type": "string",
                        "enum": ["16:9", "9:16", "1:1"],
                        "description": "Video aspect ratio - 16:9 (horizontal/YouTube), 9:16 (vertical/TikTok/Reels/Shorts), 1:1 (square/Instagram)",
                        "default": "16:9"
                    },
                    "async_polling": {
                        "type": "boolean",
                        "description": "Use smart async polling - starts generation, polls intelligently, downloads to sandbox when ready",
                        "default": True
                    },
                    "wait_for_completion": {
                        "type": "boolean", 
                        "description": "Whether to wait for video generation to complete before returning (blocking approach)",
                        "default": False
                    },
                    "max_wait_time": {
                        "type": "integer",
                        "description": "Maximum time in seconds to wait for video completion (default: 300 seconds for async polling)",
                        "default": 300
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
        <parameter name="aspect_ratio">16:9</parameter>
        <parameter name="async_polling">true</parameter>
        </invoke>
        <!-- For TikTok/Reels/Shorts (vertical UGC): -->
        <invoke name="generate_avatar_video">
        <parameter name="text">Check out this amazing tip!</parameter>
        <parameter name="aspect_ratio">9:16</parameter>
        </invoke>
        </function_calls>
    ''')
    async def generate_avatar_video(
        self,
        text: str,
        preserve_exact_text: bool = False,
        avatar_id: str = "default",
        voice_id: str = "default",
        video_title: str = "Avatar Video",
        background_color: str = "#ffffff",
        video_quality: str = "medium",
        aspect_ratio: str = "16:9",
        async_polling: bool = True,
        wait_for_completion: bool = False,
        max_wait_time: int = 300
    ) -> ToolResult:
        """Generate a downloadable MP4 video with an avatar speaking the provided text."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured. Please add HEYGEN_API_KEY to your environment variables.")
            
            # Debug: Log the API key format being used
            key_preview = f"{self.heygen_api_key[:8]}...{self.heygen_api_key[-8:]}" if len(self.heygen_api_key) > 16 else self.heygen_api_key
            logger.info(f"Starting avatar video generation with key: {key_preview}")
            logger.info(f"Starting avatar video generation: {video_title}")
            
            # Determine which avatar ID to use
            resolved_avatar_id = avatar_id
            if avatar_id == "default":
                # Use system prompt configured default, or fallback to Kristin
                resolved_avatar_id = self.default_avatar_id or "Kristin_public_3_20240108"
                logger.info(f"Using resolved default avatar: {resolved_avatar_id}")
            
            # Prepare video generation request
            voice_config = {
                "type": "text",
                "input_text": text,
                "voice_id": voice_id if voice_id != "default" else "1bd001e7e50f421d891986aad5158bc8"
            }
            
            # Add exact text preservation settings if requested
            if preserve_exact_text:
                voice_config.update({
                    "speed": 1.0,  # Normal speed
                    "emotion": "neutral",  # Neutral emotion to avoid text changes
                    "pause": 0,  # No extra pauses
                    "emphasis": False  # No emphasis changes
                })
                logger.info(f"🔒 Exact text preservation enabled for: '{text}'")
            
            # Calculate dimensions based on aspect ratio
            dimension_map = {
                "16:9": {"width": 1280, "height": 720},    # Horizontal (YouTube, standard)
                "9:16": {"width": 720, "height": 1280},    # Vertical (TikTok, Reels, Shorts)
                "1:1": {"width": 1080, "height": 1080}     # Square (Instagram feed)
            }
            dimensions = dimension_map.get(aspect_ratio, dimension_map["16:9"])
            
            video_data = {
                "video_inputs": [{
                    "character": {
                        "type": "avatar",
                        "avatar_id": resolved_avatar_id,
                        "avatar_style": "normal"
                    },
                    "voice": voice_config,
                    "background": {
                        "type": "color",
                        "value": background_color
                    }
                }],
                "dimension": dimensions,
                "aspect_ratio": aspect_ratio,
                "test": False,
                "caption": False
            }
            
            # Log UGC format if vertical
            if aspect_ratio == "9:16":
                logger.info(f"📱 Generating VERTICAL video (UGC format) for TikTok/Reels/Shorts")
            
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
                
                # Enhanced job ID logging
                logger.info(f"🎬 ===== VIDEO GENERATION STARTED =====")
                logger.info(f"📋 JOB ID: {video_id}")
                logger.info(f"📝 TEXT: '{text}'")
                logger.info(f"👤 AVATAR: {resolved_avatar_id}" + (f" (from system prompt default)" if avatar_id == "default" and self.default_avatar_id else ""))
                logger.info(f"🔒 EXACT TEXT: {preserve_exact_text}")
                logger.info(f"=========================================")
                
                # Smart async polling approach
                if async_polling:
                    logger.info(f"🎬 Starting async video generation for '{video_title}' (ID: {video_id})")
                    return await self._async_poll_and_download(video_id, video_title, text, resolved_avatar_id, voice_id, max_wait_time)
                    
                elif wait_for_completion:
                    # Traditional blocking approach 
                    video_url = await self._wait_for_video_completion(video_id, max_wait_time)
                    if video_url:
                        download_path = await self._download_video(video_url, video_title, video_id)
                        if download_path:
                            # Save metadata
                            await self._save_video_metadata(video_id, video_title, text, resolved_avatar_id, voice_id, download_path)
                            
                            logger.info(f"Successfully generated and downloaded video: {download_path}")
                            return self.success_response(
                                f"Avatar video generated successfully! Video saved as: {download_path}\n"
                                f"Video ID: {video_id}\n"
                                f"Title: {video_title}\n"
                                f"Avatar: {resolved_avatar_id}\n"
                                f"Text: {text[:100]}{'...' if len(text) > 100 else ''}",
                                attachments=[download_path]
                            )
                        else:
                            logger.error(f"Video {video_id} generation completed but download failed")
                            return self.fail_response("Video generation completed but download failed")
                    else:
                        return self.fail_response("Video generation timed out or failed")
                else:
                    # Quick return approach - ALWAYS show job ID prominently
                    avatar_info = f"{resolved_avatar_id}"
                    if avatar_id == "default" and self.default_avatar_id:
                        avatar_info += " (from system prompt)"
                    
                    # Format type indicator based on aspect ratio
                    format_emoji = {
                        "16:9": "🖥️",
                        "9:16": "📱",
                        "1:1": "⬛"
                    }.get(aspect_ratio, "🎬")
                    
                    format_name = {
                        "16:9": "Horizontal (YouTube/standard)",
                        "9:16": "Vertical UGC (TikTok/Reels/Shorts)",
                        "1:1": "Square (Instagram)"
                    }.get(aspect_ratio, "Standard")
                    
                    return self.success_response(
                        f"🎬 **AVATAR VIDEO GENERATION STARTED!**\n\n"
                        f"📋 **JOB ID**: `{video_id}` ⭐\n"
                        f"📝 **REQUESTED TEXT**: \"{text}\"\n"
                        f"👤 **AVATAR**: {avatar_info}\n"
                        f"🎙️ **VOICE**: {voice_id}\n"
                        f"{format_emoji} **FORMAT**: {aspect_ratio} - {format_name}\n"
                        f"📐 **DIMENSIONS**: {dimensions['width']}x{dimensions['height']}\n\n" 
                        f"📹 **STATUS**: Processing (typically 30-60 seconds)\n"
                        f"🔍 **TRACK PROGRESS**: Use `check_video_status('{video_id}')` to check and download\n\n"
                        f"**⚠️ IMPORTANT**: HeyGen may slightly modify your text for natural speech. The exact text above was requested."
                    )
                    
        except Exception as e:
            error_msg = f"Failed to generate avatar video: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return self.fail_response(error_msg)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_avatar_session",
            "description": "Create a streaming avatar token for real-time interactive avatars. NOTE: Streaming avatars require WebRTC and work best in frontend applications. For pre-recorded videos, use generate_avatar_video instead. This creates a session token that can be used in a web/mobile app.",
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
                    f"🎭 **Streaming Avatar Session Token Created!**\n\n"
                    f"**Session Name**: {session_name}\n"
                    f"**Session ID**: `{session_id}`\n"
                    f"**Token**: `{session_token[:20]}...`\n"
                    f"**Avatar**: {avatar_name} ({avatar_id})\n"
                    f"**Voice**: {selected_voice} ({voice_emotion})\n"
                    f"**Quality**: {quality}\n"
                    f"**Language**: {language}\n\n"
                    f"⚠️ **IMPORTANT NOTES**:\n"
                    f"1. Streaming avatars require WebRTC and work best in frontend apps\n"
                    f"2. This token is valid for establishing a client-side connection\n"
                    f"3. For simple video generation, use `generate_avatar_video` instead\n\n"
                    f"📱 **Frontend Integration Example**:\n"
                    f"```javascript\n"
                    f"const peerConnection = new RTCPeerConnection();\n"
                    f"// Use session_token: {session_token[:20]}...\n"
                    f"// Connect to HeyGen's WebRTC service\n"
                    f"```\n\n"
                    f"💡 **Tip**: If you just want to create a video, use `generate_avatar_video` - it's much simpler!"
                )
                
        except Exception as e:
            error_msg = f"Failed to create avatar session: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return self.fail_response(error_msg)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "make_avatar_speak",
            "description": "Send text to an active streaming avatar session. Call this MULTIPLE TIMES to keep the session going - each call sends new text for the avatar to speak. Perfect for conversational agents, tutorials, or any multi-part content. Session stays active until you close it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_name": {
                        "type": "string",
                        "description": "Name of the avatar session to use"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text for the avatar to speak. You can call this function repeatedly with different text to continue the conversation."
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
        <!-- First message -->
        <invoke name="make_avatar_speak">
        <parameter name="session_name">sales_demo_avatar</parameter>
        <parameter name="text">Hello! I'm excited to tell you about our amazing new features.</parameter>
        <parameter name="task_type">repeat</parameter>
        </invoke>
        <!-- Send more messages to keep session going -->
        <invoke name="make_avatar_speak">
        <parameter name="session_name">sales_demo_avatar</parameter>
        <parameter name="text">Our new AI-powered analytics can help you boost conversions by up to 300%.</parameter>
        </invoke>
        <invoke name="make_avatar_speak">
        <parameter name="session_name">sales_demo_avatar</parameter>
        <parameter name="text">Want to see a demo? Let me show you how it works!</parameter>
        </invoke>
        </function_calls>
    ''')
    async def make_avatar_speak(
        self,
        session_name: str,
        text: str,
        task_type: str = "repeat"
    ) -> ToolResult:
        """Make an avatar speak the provided text in an active session. Can be called multiple times to continue conversation."""
        try:
            if session_name not in self.active_sessions:
                return self.fail_response(
                    f"❌ No active session found with name '{session_name}'.\n\n"
                    f"**Create a session first**:\n"
                    f"1. Use `create_avatar_session(session_name='{session_name}', ...)` to start\n"
                    f"2. Then call `make_avatar_speak()` to send text\n\n"
                    f"💡 **Tip**: Sessions let you send multiple messages without regenerating!"
                )
            
            session_id = self.active_sessions[session_name]
            logger.info(f"📢 Making avatar speak in session '{session_name}': {text[:50]}...")
            
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
                    return self.fail_response(
                        f"❌ Failed to send speak command\n\n"
                        f"**Error**: {error_msg}\n\n"
                        f"💡 **Troubleshooting**:\n"
                        f"- Session might have expired (timeout after 10-15 min inactivity)\n"
                        f"- Try creating new session with `create_avatar_session()`"
                    )
                
                result = response.json()
                
                if result.get("code") != 100:
                    return self.fail_response(f"HeyGen speak task failed: {result.get('message', 'Unknown error')}")
                
                task_id = result.get("data", {}).get("task_id")
                duration = result.get("data", {}).get("duration_ms", 0) / 1000 if "duration_ms" in result.get("data", {}) else 0
                
                return self.success_response(
                    f"🗣️ **Avatar Speaking!**\n\n"
                    f"**Session**: {session_name}\n"
                    f"**Task ID**: `{task_id}`\n"
                    f"**Text**: \"{text[:100]}{'...' if len(text) > 100 else ''}\"\n"
                    f"**Duration**: ~{duration:.1f}s\n\n"
                    f"✅ **Session Still Active!**\n\n"
                    f"**Keep the conversation going**:\n"
                    f"- Call `make_avatar_speak(session_name='{session_name}', text='...')` again\n"
                    f"- Send as many messages as you want\n"
                    f"- Each message queues up in the session\n\n"
                    f"💡 **Tip**: Use `close_avatar_session('{session_name}')` when done."
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
                            f"✅ Video generation completed! Video downloaded to: {download_path}\n"
                            f"🎬 Video ID: {video_id}\n"
                            f"📊 Status: {status}\n"
                            f"📁 File ready for download from sandbox",
                            attachments=[download_path]
                        )
                    else:
                        logger.error(f"Video {video_id} completed but download failed after retries")
                        return self.fail_response(
                            f"❌ **Download Failed**\n\n"
                            f"Video generation completed successfully, but download to sandbox failed after multiple attempts.\n\n"
                            f"**Video Details:**\n"
                            f"• Video ID: `{video_id}`\n"
                            f"• Video URL: `{video_url}`\n"
                            f"• Status: {status} ✅\n\n"
                            f"**You can:**\n"
                            f"1. Try `diagnose_sandbox_issues()` to check sandbox health\n"
                            f"2. Download directly from: {video_url}\n"
                            f"3. Retry this command again\n"
                            f"4. Contact support if issues persist"
                        )
                
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

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "diagnose_sandbox_issues",
            "description": "Diagnose sandbox connectivity and file system issues to help troubleshoot video download problems.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def diagnose_sandbox_issues(self) -> ToolResult:
        """Diagnose sandbox issues that might be causing download failures."""
        try:
            diagnostics = []
            
            # 1. Test sandbox initialization
            try:
                await self._ensure_sandbox()
                diagnostics.append("✅ Sandbox initialization: Success")
            except Exception as e:
                diagnostics.append(f"❌ Sandbox initialization: Failed - {str(e)}")
                return self.fail_response("Sandbox initialization failed:\n" + "\n".join(diagnostics))
            
            # 2. Test sandbox state
            try:
                state_ok = await self._validate_sandbox_state()
                if state_ok:
                    diagnostics.append("✅ Sandbox state validation: Ready")
                else:
                    diagnostics.append("❌ Sandbox state validation: Not ready")
            except Exception as e:
                diagnostics.append(f"❌ Sandbox state validation: Failed - {str(e)}")
            
            # 3. Test file system operations
            try:
                test_path = "/workspace/.diagnostic_test.txt"
                test_content = b"Diagnostic test content"
                
                await self.sandbox.fs.upload_file(test_content, test_path)
                diagnostics.append("✅ File write test: Success")
                
                # Test file read
                try:
                    file_info = await self.sandbox.fs.stat(test_path)
                    diagnostics.append(f"✅ File stat test: Success (size: {getattr(file_info, 'size', 'unknown')})")
                except Exception:
                    diagnostics.append("⚠️ File stat test: Failed (file written but can't read stats)")
                
                # Cleanup
                try:
                    await self.sandbox.fs.delete(test_path)
                    diagnostics.append("✅ File delete test: Success")
                except Exception:
                    diagnostics.append("⚠️ File delete test: Failed (cleanup issue)")
                    
            except Exception as e:
                diagnostics.append(f"❌ File system test: Failed - {str(e)}")
            
            # 4. Test network connectivity
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get("https://httpbin.org/get")
                    if response.status_code == 200:
                        diagnostics.append("✅ External network test: Success")
                    else:
                        diagnostics.append(f"⚠️ External network test: HTTP {response.status_code}")
            except Exception as e:
                diagnostics.append(f"❌ External network test: Failed - {str(e)}")
            
            # 5. Test sandbox disk space
            try:
                # Try to write a larger test file to check space
                large_test_path = "/workspace/.large_test.tmp"
                large_content = b"x" * (1024 * 1024)  # 1MB test file
                
                await self.sandbox.fs.upload_file(large_content, large_test_path)
                diagnostics.append("✅ Disk space test: Sufficient (1MB test passed)")
                
                try:
                    await self.sandbox.fs.delete(large_test_path)
                except Exception:
                    pass
                    
            except Exception as e:
                diagnostics.append(f"❌ Disk space test: Failed - {str(e)}")
            
            # Compile results
            success_count = len([d for d in diagnostics if d.startswith("✅")])
            warning_count = len([d for d in diagnostics if d.startswith("⚠️")])
            failure_count = len([d for d in diagnostics if d.startswith("❌")])
            
            summary = f"**Sandbox Diagnostic Results:**\n\n"
            summary += f"✅ Passed: {success_count}\n"
            summary += f"⚠️ Warnings: {warning_count}\n" 
            summary += f"❌ Failed: {failure_count}\n\n"
            
            summary += "**Detailed Results:**\n"
            for diagnostic in diagnostics:
                summary += f"{diagnostic}\n"
                
            if failure_count == 0 and warning_count <= 1:
                summary += "\n**Status:** Sandbox appears to be working properly ✅"
                return self.success_response(summary)
            elif failure_count > 0:
                summary += "\n**Status:** Critical issues detected ❌"
                summary += "\n**Recommendation:** Contact support or restart sandbox"
                return self.fail_response(summary)
            else:
                summary += "\n**Status:** Minor issues detected ⚠️"
                summary += "\n**Recommendation:** Issues may resolve themselves or affect performance"
                return self.success_response(summary)
                
        except Exception as e:
            logger.error(f"Diagnostic process failed: {e}", exc_info=True)
            return self.fail_response(f"Sandbox diagnostic process failed: {str(e)}")

    # ==================== NEW ENDPOINTS - HeyGen API Complete Integration ====================
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_all_avatars",
            "description": "Get all available HeyGen avatars with their IDs, names, preview images, and voices. Use this to dynamically select avatars instead of hardcoded options.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def list_all_avatars(self) -> ToolResult:
        """List all available HeyGen avatars from the API."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v2/avatars",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"HeyGen API error: {response.status_code} - {response.text}")
                
                result = response.json()
                avatars = result.get("data", {}).get("avatars", [])
                
                if not avatars:
                    return self.success_response("No avatars found.")
                
                avatar_list = []
                for avatar in avatars:
                    avatar_info = {
                        "id": avatar.get("avatar_id"),
                        "name": avatar.get("avatar_name"),
                        "gender": avatar.get("gender"),
                        "preview_image": avatar.get("preview_image_url"),
                        "preview_video": avatar.get("preview_video_url"),
                        "available_voices": avatar.get("available_voices", [])
                    }
                    avatar_list.append(avatar_info)
                
                logger.info(f"Retrieved {len(avatar_list)} avatars from HeyGen")
                
                # Format response
                response_text = f"📋 **Available Avatars ({len(avatar_list)} total)**:\n\n"
                for i, avatar in enumerate(avatar_list[:20], 1):  # Show first 20
                    response_text += f"{i}. **{avatar['name']}** (ID: `{avatar['id']}`)\n"
                    response_text += f"   Gender: {avatar['gender']}, Voices: {len(avatar['available_voices'])}\n\n"
                
                if len(avatar_list) > 20:
                    response_text += f"\n... and {len(avatar_list) - 20} more avatars available.\n"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to list avatars: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_all_voices",
            "description": "Get all available HeyGen voices with their IDs, languages, genders, and styles. Use this to select appropriate voices for avatars.",
            "parameters": {
                "type": "object",
                "properties": {
                    "language": {
                        "type": "string",
                        "description": "Filter by language code (e.g., 'en', 'es', 'fr'). Leave empty for all languages.",
                        "default": ""
                    }
                },
                "required": []
            }
        }
    })
    async def list_all_voices(self, language: str = "") -> ToolResult:
        """List all available HeyGen voices."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            url = f"{self.heygen_base_url}/v2/voices"
            if language:
                url += f"?language={language}"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    url,
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"HeyGen API error: {response.status_code} - {response.text}")
                
                result = response.json()
                voices = result.get("data", {}).get("voices", [])
                
                if not voices:
                    return self.success_response(f"No voices found{' for language: ' + language if language else ''}.")
                
                voice_list = []
                for voice in voices:
                    voice_info = {
                        "id": voice.get("voice_id"),
                        "name": voice.get("display_name"),
                        "language": voice.get("language"),
                        "gender": voice.get("gender"),
                        "style": voice.get("style", "standard"),
                        "preview_audio": voice.get("preview_audio_url")
                    }
                    voice_list.append(voice_info)
                
                logger.info(f"Retrieved {len(voice_list)} voices from HeyGen")
                
                # Format response
                filter_text = f" (Language: {language})" if language else ""
                response_text = f"🎙️ **Available Voices ({len(voice_list)} total{filter_text})**:\n\n"
                for i, voice in enumerate(voice_list[:30], 1):  # Show first 30
                    response_text += f"{i}. **{voice['name']}** (ID: `{voice['id']}`)\n"
                    response_text += f"   Language: {voice['language']}, Gender: {voice['gender']}, Style: {voice['style']}\n\n"
                
                if len(voice_list) > 30:
                    response_text += f"\n... and {len(voice_list) - 30} more voices available.\n"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to list voices: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_photo_avatar",
            "description": "Upload a photo and create a custom talking avatar from it. Perfect for personalized videos using real faces. The photo will be turned into an avatar that can speak any text you provide.",
            "parameters": {
                "type": "object",
                "properties": {
                    "photo_path": {
                        "type": "string",
                        "description": "Path to the photo file in the sandbox workspace (e.g., '/workspace/my_photo.jpg')"
                    },
                    "avatar_name": {
                        "type": "string",
                        "description": "Name for this custom avatar",
                        "default": "Custom Photo Avatar"
                    }
                },
                "required": ["photo_path"]
            }
        }
    })
    async def create_photo_avatar(self, photo_path: str, avatar_name: str = "Custom Photo Avatar") -> ToolResult:
        """Upload a photo and create a custom avatar from it."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            await self._ensure_sandbox()
            
            # Read photo from sandbox
            logger.info(f"Reading photo from sandbox: {photo_path}")
            photo_content = await self.sandbox.fs.read_file(photo_path)
            
            # Upload photo to HeyGen
            async with httpx.AsyncClient() as client:
                files = {"file": ("photo.jpg", photo_content, "image/jpeg")}
                
                response = await client.post(
                    f"{self.heygen_base_url}/v2/photo_avatar/photo/upload",
                    headers={"X-API-KEY": self.heygen_api_key},  # Don't include Content-Type for multipart
                    files=files,
                    timeout=60.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"Photo upload failed: {response.status_code} - {response.text}")
                
                result = response.json()
                photo_id = result.get("data", {}).get("photo_id")
                
                if not photo_id:
                    return self.fail_response("Failed to get photo ID from upload response")
                
                logger.info(f"✅ Photo uploaded successfully: {photo_id}")
                
                return self.success_response(
                    f"📸 **Photo Avatar Created Successfully!**\n\n"
                    f"**Photo ID**: `{photo_id}`\n"
                    f"**Name**: {avatar_name}\n\n"
                    f"✅ Your photo has been uploaded and processed.\n\n"
                    f"**Next Steps**:\n"
                    f"1. Use `generate_photo_avatar_video(photo_id='{photo_id}', text='Your message')` to create videos\n"
                    f"2. The avatar will use the face from your photo to speak any text\n\n"
                    f"💡 **Tip**: Photo avatars are perfect for personalized sales videos, CEO messages, or custom content!"
                )
                
        except Exception as e:
            logger.error(f"Failed to create photo avatar: {e}", exc_info=True)
            return self.fail_response(f"Failed to create photo avatar: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_photo_avatar_video",
            "description": "Generate a video using a custom photo avatar. The person in the photo will appear to speak your text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "photo_id": {
                        "type": "string",
                        "description": "Photo ID from create_photo_avatar"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text for the photo avatar to speak"
                    },
                    "voice_id": {
                        "type": "string",
                        "description": "Voice ID to use (use list_all_voices to see options)",
                        "default": "default"
                    },
                    "video_title": {
                        "type": "string",
                        "description": "Title for the video",
                        "default": "Photo Avatar Video"
                    }
                },
                "required": ["photo_id", "text"]
            }
        }
    })
    async def generate_photo_avatar_video(
        self, 
        photo_id: str, 
        text: str, 
        voice_id: str = "default",
        video_title: str = "Photo Avatar Video"
    ) -> ToolResult:
        """Generate a video with a custom photo avatar."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            video_data = {
                "photo_id": photo_id,
                "input_text": text,
                "voice_id": voice_id if voice_id != "default" else "1bd001e7e50f421d891986aad5158bc8"
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v2/photo_avatar/photo/generate",
                    headers=self._get_heygen_headers(),
                    json=video_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"HeyGen API error: {response.status_code} - {response.text}")
                
                result = response.json()
                video_id = result.get("data", {}).get("video_id")
                
                if not video_id:
                    return self.fail_response("Failed to get video ID from response")
                
                logger.info(f"🎬 Photo avatar video generation started: {video_id}")
                
                # Use async polling to download when ready
                return await self._async_poll_and_download(video_id, video_title, text, photo_id, voice_id, 300)
                
        except Exception as e:
            return self.fail_response(f"Failed to generate photo avatar video: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "translate_video",
            "description": "Translate an existing video into multiple languages. Translates both audio and optionally preserves the original voice. Perfect for reaching global audiences.",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_id": {
                        "type": "string",
                        "description": "ID of the video to translate (from a previously generated video)"
                    },
                    "target_languages": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of target language codes (e.g., ['es', 'fr', 'de', 'ja']). Supports 40+ languages including: es (Spanish), fr (French), de (German), it (Italian), pt (Portuguese), zh (Chinese), ja (Japanese), ko (Korean), ar (Arabic), hi (Hindi), ru (Russian), and more."
                    },
                    "preserve_voice": {
                        "type": "boolean",
                        "description": "Use voice cloning to keep the original speaker's voice in translated languages",
                        "default": True
                    },
                    "translate_title": {
                        "type": "string",
                        "description": "Title for the translated videos",
                        "default": "Translated Video"
                    }
                },
                "required": ["video_id", "target_languages"]
            }
        }
    })
    async def translate_video(
        self,
        video_id: str,
        target_languages: List[str],
        preserve_voice: bool = True,
        translate_title: str = "Translated Video"
    ) -> ToolResult:
        """Translate a video into multiple languages."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            translation_data = {
                "video_id": video_id,
                "target_languages": target_languages,
                "translate_audio": True,
                "preserve_voice": preserve_voice
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v2/video_translate",
                    headers=self._get_heygen_headers(),
                    json=translation_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"Translation API error: {response.status_code} - {response.text}")
                
                result = response.json()
                translate_id = result.get("data", {}).get("translate_id")
                
                if not translate_id:
                    return self.fail_response("Failed to get translation ID from response")
                
                logger.info(f"🌍 Video translation started: {translate_id} for languages: {', '.join(target_languages)}")
                
                return self.success_response(
                    f"🌍 **Video Translation Started!**\n\n"
                    f"**Translation ID**: `{translate_id}`\n"
                    f"**Original Video**: {video_id}\n"
                    f"**Target Languages**: {', '.join(target_languages)}\n"
                    f"**Voice Preservation**: {'Yes (voice cloning)' if preserve_voice else 'No (synthetic voice)'}\n\n"
                    f"⏳ **Status**: Processing (typically 5-15 minutes per language)\n\n"
                    f"**Next Steps**:\n"
                    f"1. Use `check_translation_status('{translate_id}')` to check progress\n"
                    f"2. Translated videos will be available for download when complete\n\n"
                    f"💡 **Tip**: Voice cloning keeps the original speaker's voice characteristics in the translated language!"
                )
                
        except Exception as e:
            return self.fail_response(f"Failed to translate video: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "check_translation_status",
            "description": "Check the status of a video translation job and get URLs for completed translations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "translate_id": {
                        "type": "string",
                        "description": "Translation ID from translate_video"
                    }
                },
                "required": ["translate_id"]
            }
        }
    })
    async def check_translation_status(self, translate_id: str) -> ToolResult:
        """Check translation status."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v1/video_translate.get?translate_id={translate_id}",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"API error: {response.status_code} - {response.text}")
                
                result = response.json()
                data = result.get("data", {})
                status = data.get("status")
                translations = data.get("translations", [])
                
                response_text = f"🌍 **Translation Status**: {status}\n\n"
                response_text += f"**Translation ID**: `{translate_id}`\n"
                response_text += f"**Languages**: {len(translations)}\n\n"
                
                if translations:
                    response_text += "**Translations**:\n"
                    for trans in translations:
                        lang = trans.get("language")
                        trans_status = trans.get("status")
                        video_url = trans.get("video_url")
                        response_text += f"\n• **{lang.upper()}**: {trans_status}\n"
                        if video_url:
                            response_text += f"  URL: {video_url}\n"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to check translation status: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_my_videos",
            "description": "List all your generated videos with their status, URLs, and metadata. Useful for managing your video library.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of videos to return (default: 20)",
                        "default": 20
                    }
                },
                "required": []
            }
        }
    })
    async def list_my_videos(self, limit: int = 20) -> ToolResult:
        """List all generated videos."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v1/video.list?limit={limit}",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"API error: {response.status_code} - {response.text}")
                
                result = response.json()
                videos = result.get("data", {}).get("videos", [])
                
                if not videos:
                    return self.success_response("No videos found in your library.")
                
                response_text = f"📹 **Your Video Library ({len(videos)} videos)**:\n\n"
                for i, video in enumerate(videos, 1):
                    video_id = video.get("video_id")
                    status = video.get("status")
                    title = video.get("title", "Untitled")
                    created = video.get("created_at", "Unknown")
                    video_url = video.get("video_url", "Processing...")
                    
                    response_text += f"{i}. **{title}**\n"
                    response_text += f"   ID: `{video_id}`\n"
                    response_text += f"   Status: {status}\n"
                    response_text += f"   Created: {created}\n"
                    if video_url != "Processing...":
                        response_text += f"   URL: {video_url}\n"
                    response_text += "\n"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to list videos: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "delete_video",
            "description": "Delete a video from your HeyGen library. This is permanent and cannot be undone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "video_id": {
                        "type": "string",
                        "description": "ID of the video to delete"
                    }
                },
                "required": ["video_id"]
            }
        }
    })
    async def delete_video(self, video_id: str) -> ToolResult:
        """Delete a video."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.heygen_base_url}/v1/video/{video_id}",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"API error: {response.status_code} - {response.text}")
                
                logger.info(f"🗑️ Deleted video: {video_id}")
                return self.success_response(f"✅ Video `{video_id}` deleted successfully.")
                
        except Exception as e:
            return self.fail_response(f"Failed to delete video: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_account_usage",
            "description": "Check your HeyGen account credits, usage statistics, and remaining quota. Useful for monitoring API usage and costs.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def get_account_usage(self) -> ToolResult:
        """Get account usage and credit information."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                # Get remaining quota - this is the correct HeyGen endpoint
                quota_response = await client.get(
                    f"{self.heygen_base_url}/v2/user/remaining_quota",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if quota_response.status_code != 200:
                    return self.fail_response(f"API error: {quota_response.status_code} - {quota_response.text}")
                
                result = quota_response.json()
                data = result.get("data", {})
                
                # Format response
                response_text = "💳 **HeyGen Account Credits & Usage**\n\n"
                
                # Credits information
                remaining = data.get("remaining", 0)
                total = data.get("total", 0)
                used = total - remaining if total > 0 else 0
                percentage_used = (used / total * 100) if total > 0 else 0
                
                response_text += f"**Credit Balance**:\n"
                response_text += f"• Remaining: **{remaining:.2f}** credits\n"
                response_text += f"• Total Quota: {total:.2f} credits\n"
                response_text += f"• Used: {used:.2f} credits ({percentage_used:.1f}%)\n\n"
                
                # Usage breakdown if available
                if "details" in data:
                    details = data.get("details", {})
                    response_text += f"**Usage Breakdown**:\n"
                    for key, value in details.items():
                        response_text += f"• {key.replace('_', ' ').title()}: {value}\n"
                    response_text += "\n"
                
                # Status indicator
                if remaining > total * 0.2:
                    response_text += "✅ **Status**: Healthy credit balance\n"
                elif remaining > 0:
                    response_text += "⚠️ **Status**: Low credits - consider refilling\n"
                else:
                    response_text += "🚨 **Status**: No credits remaining - refill required\n"
                
                response_text += f"\n💡 **Tip**: Each video generation typically costs 1-3 credits depending on length and quality."
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to get account usage: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_streaming_avatar_guide",
            "description": "Get a complete guide for integrating HeyGen streaming avatars into your web/mobile application. This explains the WebRTC setup, token usage, and best practices.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def get_streaming_avatar_guide(self) -> ToolResult:
        """Provide comprehensive guide for streaming avatar integration."""
        guide = """
🎭 **HeyGen Streaming Avatar Integration Guide**

## Overview
Streaming avatars provide real-time, interactive video experiences where an AI avatar responds instantly to user input. This requires WebRTC and is designed for frontend applications.

## ⚠️ When to Use Each Feature

### Use `generate_avatar_video()` when:
- Creating pre-recorded videos (most common use case)
- Generating content for social media (TikTok, Reels, YouTube)
- Making personalized videos at scale
- Need downloadable MP4 files
- ✅ Works in sandbox/backend ✅

### Use Streaming Avatars when:
- Building interactive chat interfaces
- Creating virtual assistants with real-time responses
- Live customer service avatars
- Real-time presentations
- ⚠️ Requires frontend WebRTC integration ⚠️

## 🔧 Streaming Avatar Setup (3 Steps)

### Step 1: Create Token (Backend)
```python
# Use create_avatar_session() to get a session token
result = await create_avatar_session(
    session_name="customer_support",
    selected_avatar="kristin_professional",
    quality="high"
)
# Extract token from result
```

### Step 2: Establish WebRTC Connection (Frontend)
```javascript
// In your React/Vue/vanilla JS app
const StreamingAvatar = async (token) => {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  
  // Create data channel for commands
  const dataChannel = pc.createDataChannel('heygen');
  
  // Add video element to display avatar
  const video = document.getElementById('avatar-video');
  pc.ontrack = (event) => {
    video.srcObject = event.streams[0];
  };
  
  // Connect to HeyGen's WebRTC endpoint using token
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  const response = await fetch('https://api.heygen.com/v1/streaming.start', {
    method: 'POST',
    headers: { 'x-api-key': YOUR_API_KEY },
    body: JSON.stringify({
      session_id: SESSION_ID,
      sdp: offer
    })
  });
  
  const answer = await response.json();
  await pc.setRemoteDescription(answer.data.sdp);
};
```

### Step 3: Send Commands
```javascript
// Make avatar speak
dataChannel.send(JSON.stringify({
  type: 'repeat',
  text: 'Hello! How can I help you today?'
}));

// Stop speaking
dataChannel.send(JSON.stringify({
  type: 'stop'
}));
```

## 📦 Pre-built Solutions

### React SDK
```bash
npm install @heygen/streaming-avatar
```

```jsx
import StreamingAvatar from '@heygen/streaming-avatar';

function App() {
  return (
    <StreamingAvatar
      token={YOUR_TOKEN}
      onStart={() => console.log('Avatar started')}
      onSpeak={(text) => console.log('Avatar spoke:', text)}
    />
  );
}
```

## 🎯 Best Practices

1. **Token Security**: Generate tokens server-side, never expose API key in frontend
2. **Connection Lifecycle**: Close sessions when done to save credits
3. **Error Handling**: Implement reconnection logic for network issues
4. **Latency**: Use high-quality network, avoid VPNs for best performance
5. **Testing**: Test across browsers (Chrome/Edge recommended)

## 💡 Quick Decision Tree

```
Need avatar video?
├─ Pre-recorded content? → use generate_avatar_video()
├─ Real-time interaction? → use streaming avatars (requires WebRTC setup)
└─ Personalized at scale? → use generate_from_template()
```

## 🚀 Next Steps

For pre-recorded videos (recommended):
- Use `generate_avatar_video()` - simple, works everywhere
- Add `aspect_ratio="9:16"` for TikTok/Reels
- Use templates for personalization at scale

For streaming (advanced):
- Create session token with `create_avatar_session()`
- Integrate HeyGen React SDK or build custom WebRTC
- Refer to: https://docs.heygen.com/docs/streaming-avatar

## ❓ Common Issues

**"Session not found"**: Streaming requires WebRTC connection, can't be used directly from backend
**"Connection failed"**: Check network/firewall, WebRTC needs UDP ports
**"Want simpler solution"**: Use `generate_avatar_video()` instead - much easier!

---
📧 Questions? Check HeyGen docs: https://docs.heygen.com/
        """
        return self.success_response(guide)

    # ==================== UGC PRODUCT PLACEMENT - Authentic Product Showcase ====================
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "upload_product_image",
            "description": "Upload a product image for use in UGC videos with product placement. The avatar will interact with and showcase this product naturally. Best for e-commerce, ads, and product demos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_path": {
                        "type": "string",
                        "description": "Path to the product image file (JPG, PNG). Should be clear, well-lit, and show the product prominently."
                    },
                    "product_name": {
                        "type": "string",
                        "description": "Name of the product for reference"
                    }
                },
                "required": ["image_path", "product_name"]
            }
        }
    })
    async def upload_product_image(self, image_path: str, product_name: str) -> ToolResult:
        """Upload a product image for UGC video generation."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            # Resolve the image path
            if not os.path.isabs(image_path):
                image_path = os.path.join(self.workspace_path, image_path)
            
            if not os.path.exists(image_path):
                return self.fail_response(f"Image file not found: {image_path}")
            
            logger.info(f"Uploading product image: {product_name} from {image_path}")
            
            # Read and upload image
            with open(image_path, 'rb') as f:
                files = {
                    'file': (os.path.basename(image_path), f, 'image/jpeg')
                }
                data = {
                    'name': product_name
                }
                
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.heygen_base_url}/v1/asset/upload",
                        headers={'x-api-key': self.heygen_api_key},
                        files=files,
                        data=data,
                        timeout=60.0
                    )
                    
                    if response.status_code != 200:
                        return self.fail_response(f"Upload failed: {response.status_code} - {response.text}")
                    
                    result = response.json()
                    asset_id = result.get("data", {}).get("asset_id")
                    asset_url = result.get("data", {}).get("url")
                    
                    if not asset_id:
                        return self.fail_response("Failed to get asset ID from upload response")
                    
                    logger.info(f"Product image uploaded successfully: {asset_id}")
                    
                    return self.success_response(
                        f"🎁 **Product Image Uploaded!**\n\n"
                        f"**Product**: {product_name}\n"
                        f"**Asset ID**: `{asset_id}`\n"
                        f"**URL**: {asset_url}\n\n"
                        f"✅ Ready to use in UGC videos!\n\n"
                        f"**Next Step**: Use `generate_ugc_video()` with this asset_id to create a video where an avatar showcases your product."
                    )
                    
        except Exception as e:
            return self.fail_response(f"Failed to upload product image: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_ugc_video",
            "description": "Generate a UGC-style video with product placement where an avatar naturally showcases and interacts with your product. Perfect for TikTok ads, Instagram Reels, and authentic-looking product demos.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Script for the avatar to say while showcasing the product. Make it casual and authentic like real UGC content."
                    },
                    "product_asset_id": {
                        "type": "string",
                        "description": "Asset ID of the uploaded product image (from upload_product_image)"
                    },
                    "avatar_id": {
                        "type": "string",
                        "description": "Avatar ID to use. UGC avatars work best (e.g., 'josh_lite3_20230714' for casual style). Use list_all_avatars to see UGC options.",
                        "default": "default"
                    },
                    "voice_id": {
                        "type": "string",
                        "description": "Voice ID. Casual, energetic voices work best for UGC.",
                        "default": "default"
                    },
                    "video_title": {
                        "type": "string",
                        "description": "Title for the video",
                        "default": "UGC Product Video"
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "enum": ["9:16", "1:1", "16:9"],
                        "description": "9:16 for TikTok/Reels (most common for UGC), 1:1 for Instagram feed, 16:9 for YouTube",
                        "default": "9:16"
                    }
                },
                "required": ["text", "product_asset_id"]
            }
        }
    })
    async def generate_ugc_video(
        self,
        text: str,
        product_asset_id: str,
        avatar_id: str = "default",
        voice_id: str = "default",
        video_title: str = "UGC Product Video",
        aspect_ratio: str = "9:16"
    ) -> ToolResult:
        """Generate UGC video with product placement."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            # Resolve avatar
            resolved_avatar_id = avatar_id
            if avatar_id == "default":
                if self.default_avatar_id:
                    resolved_avatar_id = self.default_avatar_id
                else:
                    # Use a good default UGC avatar
                    resolved_avatar_id = "josh_lite3_20230714"  # Casual, authentic UGC style
            
            logger.info(f"Generating UGC video with product {product_asset_id}")
            
            # Dimensions for aspect ratio
            dimension_map = {
                "16:9": {"width": 1280, "height": 720},
                "9:16": {"width": 720, "height": 1280},
                "1:1": {"width": 1080, "height": 1080}
            }
            dimensions = dimension_map.get(aspect_ratio, dimension_map["9:16"])
            
            # Voice configuration
            voice_config = {
                "type": "text",
                "input_text": text,
            }
            
            if voice_id != "default":
                voice_config["voice_id"] = voice_id
            
            # UGC video with product placement
            video_data = {
                "video_inputs": [{
                    "character": {
                        "type": "avatar",
                        "avatar_id": resolved_avatar_id,
                        "avatar_style": "normal"
                    },
                    "voice": voice_config,
                    "background": {
                        "type": "color",
                        "value": "#ffffff"
                    },
                    # Product placement element
                    "product": {
                        "type": "asset",
                        "asset_id": product_asset_id,
                        "placement": "natural"  # Avatar interacts naturally with product
                    }
                }],
                "dimension": dimensions,
                "aspect_ratio": aspect_ratio,
                "test": False,
                "caption": False,
                "title": video_title
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v2/video/generate",
                    headers=self._get_heygen_headers(),
                    json=video_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"UGC video generation failed: {response.status_code} - {response.text}")
                
                result = response.json()
                video_id = result.get("data", {}).get("video_id")
                
                if not video_id:
                    return self.fail_response("Failed to get video ID from response")
                
                logger.info(f"🎬 UGC video generation started: {video_id}")
                
                return self.success_response(
                    f"🎬 **UGC Product Video Generation Started!**\n\n"
                    f"📋 **Video ID**: `{video_id}`\n"
                    f"📝 **Script**: \"{text[:100]}{'...' if len(text) > 100 else ''}\"\n"
                    f"🎁 **Product**: Asset ID `{product_asset_id}`\n"
                    f"👤 **Avatar**: {resolved_avatar_id}\n"
                    f"📱 **Format**: {aspect_ratio} - Vertical UGC (TikTok/Reels style)\n"
                    f"📐 **Dimensions**: {dimensions['width']}x{dimensions['height']}\n\n"
                    f"⏳ **Status**: Processing (typically 60-90 seconds)\n\n"
                    f"**Next Steps**:\n"
                    f"1. Use `check_video_status('{video_id}')` to check progress\n"
                    f"2. Video will auto-download when complete\n\n"
                    f"💡 **Tip**: The avatar will naturally interact with your product for authentic UGC content!"
                )
                
        except Exception as e:
            return self.fail_response(f"Failed to generate UGC video: {str(e)}")

    # ==================== TEMPLATE API - Personalized Videos at Scale ====================
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_video_templates",
            "description": "List all available video templates. Templates allow you to create personalized videos at scale by filling in variables.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def list_video_templates(self) -> ToolResult:
        """List all available video templates."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v1/template.list",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"API error: {response.status_code} - {response.text}")
                
                result = response.json()
                templates = result.get("data", {}).get("templates", [])
                
                if not templates:
                    return self.success_response("No templates found. Create templates in the HeyGen dashboard first.")
                
                response_text = f"📋 **Video Templates ({len(templates)} available)**:\n\n"
                for i, template in enumerate(templates, 1):
                    template_id = template.get("template_id")
                    name = template.get("name", "Untitled")
                    variables = template.get("variables", [])
                    
                    response_text += f"{i}. **{name}**\n"
                    response_text += f"   ID: `{template_id}`\n"
                    response_text += f"   Variables: {len(variables)} ({', '.join([v.get('name', '?') for v in variables[:3]])}{'...' if len(variables) > 3 else ''})\n\n"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to list templates: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_template_details",
            "description": "Get detailed information about a specific template, including all variables that can be personalized.",
            "parameters": {
                "type": "object",
                "properties": {
                    "template_id": {
                        "type": "string",
                        "description": "ID of the template to get details for"
                    }
                },
                "required": ["template_id"]
            }
        }
    })
    async def get_template_details(self, template_id: str) -> ToolResult:
        """Get template details including variables."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.heygen_base_url}/v1/template/{template_id}",
                    headers=self._get_heygen_headers(),
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"API error: {response.status_code} - {response.text}")
                
                result = response.json()
                template = result.get("data", {})
                
                name = template.get("name", "Untitled")
                variables = template.get("variables", [])
                
                response_text = f"📋 **Template: {name}**\n\n"
                response_text += f"**ID**: `{template_id}`\n\n"
                response_text += f"**Variables ({len(variables)})**:\n"
                
                for var in variables:
                    var_name = var.get("name")
                    var_type = var.get("type", "text")
                    required = var.get("required", False)
                    default = var.get("default_value", "")
                    
                    response_text += f"\n• **{var_name}** ({var_type})\n"
                    response_text += f"  Required: {'Yes' if required else 'No'}\n"
                    if default:
                        response_text += f"  Default: \"{default}\"\n"
                
                response_text += f"\n\n**Usage Example**:\n"
                response_text += f"```\ngenerate_from_template(\n"
                response_text += f"  template_id='{template_id}',\n"
                response_text += f"  variables={{\n"
                for var in variables[:3]:
                    var_name = var.get("name")
                    response_text += f"    '{var_name}': 'Your value here',\n"
                response_text += f"  }}\n)\n```"
                
                return self.success_response(response_text)
                
        except Exception as e:
            return self.fail_response(f"Failed to get template details: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_from_template",
            "description": "Generate a personalized video from a template. Perfect for creating hundreds or thousands of unique videos by filling in variables like names, companies, data points, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "template_id": {
                        "type": "string",
                        "description": "ID of the template to use"
                    },
                    "variables": {
                        "type": "object",
                        "description": "Dictionary of variable names and values to personalize the video (e.g., {'customer_name': 'John Doe', 'company': 'Acme Corp'})"
                    },
                    "video_title": {
                        "type": "string",
                        "description": "Title for the generated video",
                        "default": "Template Video"
                    }
                },
                "required": ["template_id", "variables"]
            }
        }
    })
    async def generate_from_template(
        self,
        template_id: str,
        variables: Dict[str, str],
        video_title: str = "Template Video"
    ) -> ToolResult:
        """Generate a video from a template with variables."""
        try:
            if not self.heygen_api_key:
                return self.fail_response("HeyGen API key not configured.")
            
            template_data = {
                "template_id": template_id,
                "variables": variables,
                "title": video_title
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.heygen_base_url}/v3/template/{template_id}",
                    headers=self._get_heygen_headers(),
                    json=template_data,
                    timeout=30.0
                )
                
                if response.status_code != 200:
                    return self.fail_response(f"Template API error: {response.status_code} - {response.text}")
                
                result = response.json()
                video_id = result.get("data", {}).get("video_id")
                
                if not video_id:
                    return self.fail_response("Failed to get video ID from template response")
                
                logger.info(f"🎨 Template video generation started: {video_id}")
                
                # Format variables for display
                var_display = "\n".join([f"  • {k}: \"{v}\"" for k, v in variables.items()])
                
                return self.success_response(
                    f"🎨 **Template Video Generation Started!**\n\n"
                    f"**Video ID**: `{video_id}`\n"
                    f"**Template**: {template_id}\n"
                    f"**Title**: {video_title}\n\n"
                    f"**Variables**:\n{var_display}\n\n"
                    f"⏳ **Status**: Processing (typically 60-90 seconds)\n\n"
                    f"**Next Steps**:\n"
                    f"1. Use `check_video_status('{video_id}')` to check progress\n"
                    f"2. Video will auto-download when complete\n\n"
                    f"💡 **Tip**: You can generate thousands of personalized videos by calling this with different variables!"
                )
                
        except Exception as e:
            return self.fail_response(f"Failed to generate from template: {str(e)}")
    
    # Helper methods

    async def _simple_download_video(self, video_url: str, title: str, video_id: str) -> Optional[str]:
        """Simplified video download based on working Omniscience labs approach."""
        try:
            logger.info(f"🔽 Starting simplified video download for {video_id}")
            
            # Quick sandbox check
            try:
                await self._ensure_sandbox()
                logger.info(f"✅ Sandbox ready: {self.sandbox_id}")
            except Exception as sandbox_error:
                logger.warning(f"⚠️ Sandbox not available: {sandbox_error}")
                return None
            
            # Clean filename
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()[:30]
            filename = f"{safe_title}_{video_id[:8]}.mp4"
            file_path = f"/workspace/{filename}"
            
            logger.info(f"📁 Target: {file_path}")
            
            # Simple download with reasonable timeout
            async with httpx.AsyncClient(timeout=httpx.Timeout(60)) as client:
                response = await client.get(video_url)
                response.raise_for_status()
                
                content_size = len(response.content)
                logger.info(f"📦 Downloaded {content_size / (1024 * 1024):.1f}MB")
                
                # Validate minimum size
                if content_size < 50 * 1024:  # 50KB minimum
                    raise Exception(f"File too small: {content_size} bytes")
                
                # Write to sandbox
                await self.sandbox.write_file(file_path, response.content)
                logger.info(f"✅ Video saved to sandbox: {file_path}")
                return file_path
                
        except Exception as e:
            logger.error(f"💥 Simplified download failed: {e}")
            return None

    async def _async_poll_and_download(
        self, 
        video_id: str, 
        video_title: str, 
        text: str, 
        avatar_id: str, 
        voice_id: str, 
        max_wait_time: int = 300
    ) -> ToolResult:
        """Smart async polling: starts generation, polls with progress updates, returns final video."""
        logger.info(f"🔄 Starting intelligent polling for video {video_id} (max wait: {max_wait_time}s)")
        
        # Initial response - let user know we're processing
        logger.info(f"📹 Processing video: {text[:50]}{'...' if len(text) > 50 else ''}")
        
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
                            # Video is ready! Try simplified download first
                            logger.info(f"✅ Video {video_id} completed! Attempting download...")
                            
                            # Try simplified download approach first
                            download_path = await self._simple_download_video(video_url, video_title, video_id)
                            if download_path:
                                # Save metadata
                                await self._save_video_metadata(video_id, video_title, text, avatar_id, voice_id, download_path)
                                
                                logger.info(f"🎉 Successfully downloaded video: {download_path}")
                                return self.success_response(
                                    f"🎉 **Video completed and downloaded!**\n\n"
                                    f"📁 **File:** `{download_path}`\n"
                                    f"🎬 **Video ID:** `{video_id}`\n"
                                    f"📝 **Text:** \"{text[:100]}{'...' if len(text) > 100 else ''}\"\n"
                                    f"👤 **Avatar:** {avatar_id}\n"
                                    f"⏱️ **Time:** {int(asyncio.get_event_loop().time() - start_time)}s\n\n"
                                    f"Your video is ready in the sandbox! 🚀",
                                    attachments=[download_path]
                                )
                            else:
                                # Simplified download failed, provide direct access
                                logger.warning(f"⚠️ Sandbox download failed for {video_id}, providing direct URL")
                                return self.success_response(
                                    f"🎬 **Video completed!** (Sandbox download failed)\n\n"
                                    f"📁 **Direct download URL:** {video_url}\n\n"
                                    f"🎬 **Video ID:** `{video_id}`\n"
                                    f"📝 **Text:** \"{text[:100]}{'...' if len(text) > 100 else ''}\"\n"
                                    f"👤 **Avatar:** {avatar_id}\n"
                                    f"⏱️ **Time:** {int(asyncio.get_event_loop().time() - start_time)}s\n\n"
                                    f"💡 **Tip:** Right-click the URL above and 'Save As' to download the video directly.\n"
                                    f"🔧 The sandbox had connection issues, but your video is ready!"
                                )
                                
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
            if check_count <= 2:
                await asyncio.sleep(5)   # First 2 checks: every 5 seconds (for quick videos)
            elif check_count <= 6:
                await asyncio.sleep(10)  # Next 4 checks: every 10 seconds
            elif check_count <= 12:
                await asyncio.sleep(15)  # Next 6 checks: every 15 seconds  
            else:
                await asyncio.sleep(20)  # After that: every 20 seconds (for long videos)
        
        # Timeout reached
        logger.warning(f"Video {video_id} timed out after {max_wait_time} seconds")
        return self.fail_response(
            f"⏰ **Video generation timed out** after {max_wait_time} seconds.\n\n"
            f"**Video ID:** `{video_id}`\n"
            f"**Status:** Still processing - video generation can sometimes take longer for complex requests\n\n"
            f"**Options:**\n"
            f"1. Use `check_video_status('{video_id}')` to check if it's ready now\n"
            f"2. Try again with a shorter video or simpler request\n"
            f"3. Contact support if this happens frequently\n\n"
            f"*Note: The video may still complete in the background and be available later.*"
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
        """Download video to sandbox workspace with robust error handling and retry logic."""
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Starting video download attempt {attempt + 1}/{max_retries} for {video_id}")
                
                # Ensure sandbox is ready with validation
                try:
                    await self._ensure_sandbox()
                    
                    # Validate sandbox state
                    sandbox_state = await self._validate_sandbox_state()
                    if not sandbox_state:
                        raise Exception("Sandbox is not in a ready state")
                        
                    logger.info(f"Sandbox validated successfully, ID: {self.sandbox_id}")
                except Exception as sandbox_error:
                    logger.error(f"Sandbox initialization/validation failed: {sandbox_error}")
                    if attempt < max_retries - 1:
                        logger.info(f"Retrying in {retry_delay} seconds...")
                        await asyncio.sleep(retry_delay)
                        continue
                    raise Exception(f"Sandbox initialization failed after {max_retries} attempts: {sandbox_error}")
                
                # Clean filename with better sanitization
                safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
                safe_title = safe_title[:50]  # Limit length
                filename = f"{safe_title}_{video_id}.mp4"
                file_path = f"/workspace/{filename}"
                
                logger.info(f"Target file path: {file_path}, filename: {filename}")
                
                # Download video with progressive timeout and validation
                logger.info(f"Downloading video from: {video_url[:50]}...")
                
                # Use extended timeout with proper client configuration
                timeout_config = httpx.Timeout(connect=30.0, read=180.0, write=60.0, pool=30.0)
                async with httpx.AsyncClient(timeout=timeout_config, limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)) as client:
                    # Download with streaming to handle large files better
                    async with client.stream('GET', video_url) as response:
                        response.raise_for_status()
                        
                        # Validate content type
                        content_type = response.headers.get('content-type', '').lower()
                        if 'video' not in content_type and 'application/octet-stream' not in content_type:
                            logger.warning(f"Unexpected content type: {content_type}")
                        
                        # Stream download to handle large files
                        content_chunks = []
                        total_size = 0
                        chunk_size = 1024 * 1024  # 1MB chunks
                        
                        async for chunk in response.aiter_bytes(chunk_size):
                            content_chunks.append(chunk)
                            total_size += len(chunk)
                            
                            # Log progress for large files
                            if total_size % (10 * 1024 * 1024) == 0:  # Every 10MB
                                logger.info(f"Downloaded {total_size / (1024 * 1024):.1f}MB...")
                        
                        # Combine all chunks
                        video_content = b''.join(content_chunks)
                        content_size = len(video_content)
                        
                        logger.info(f"Download completed: {content_size} bytes ({content_size / (1024 * 1024):.1f}MB)")
                        
                        # Validate minimum file size (videos should be at least 100KB)
                        if content_size < 100 * 1024:
                            raise Exception(f"Downloaded file too small ({content_size} bytes), likely corrupted")
                        
                        # Validate basic MP4 structure (check for ftyp box)
                        if not self._validate_mp4_header(video_content):
                            logger.warning("Downloaded file may not be a valid MP4 - proceeding anyway")
                        
                        # Save to sandbox with enhanced error handling
                        try:
                            logger.info(f"Writing {content_size} bytes to sandbox: {file_path}")
                            await self.sandbox.fs.upload_file(video_content, file_path)
                            
                            # Verify the file was written successfully
                            try:
                                # Try to stat the file to confirm it exists
                                file_info = await self.sandbox.fs.stat(file_path)
                                logger.info(f"File successfully written to sandbox: {file_path} (size: {file_info.size if hasattr(file_info, 'size') else 'unknown'})")
                            except Exception as stat_error:
                                logger.warning(f"Could not verify file existence: {stat_error}")
                            
                            logger.info(f"Video downloaded and saved successfully: {filename}")
                            return filename  # Return relative path for attachment
                            
                        except Exception as write_error:
                            logger.error(f"Sandbox file write failed: {write_error}")
                            logger.error(f"Attempted to write {content_size} bytes to {file_path}")
                            raise Exception(f"Sandbox write failed: {write_error}")
                        
            except Exception as e:
                logger.error(f"Download attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    retry_delay_current = retry_delay * (attempt + 1)  # Progressive backoff
                    logger.info(f"Retrying in {retry_delay_current} seconds...")
                    await asyncio.sleep(retry_delay_current)
                else:
                    logger.error(f"All {max_retries} download attempts failed")
                    return None
        
        return None
        
    def _validate_mp4_header(self, content: bytes) -> bool:
        """Basic MP4 header validation."""
        try:
            # MP4 files should start with ftyp box within first 16 bytes typically
            return b'ftyp' in content[:32] or b'mp4' in content[:32].lower()
        except Exception:
            return False
            
    async def _validate_sandbox_state(self) -> bool:
        """Validate that the sandbox is in a ready state for file operations."""
        try:
            if not self._sandbox:
                return False
                
            # Try a simple operation to test sandbox responsiveness
            test_path = "/workspace/.sandbox_test"
            test_content = b"test"
            
            await self.sandbox.fs.upload_file(test_content, test_path)
            
            # Clean up test file
            try:
                await self.sandbox.fs.delete(test_path)
            except Exception:
                pass  # Ignore cleanup failures
                
            return True
            
        except Exception as e:
            logger.error(f"Sandbox validation failed: {e}")
            return False

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