#!/usr/bin/env python3
"""
Simple podcast client for Omni integration
Use this as a replacement for the complex integration
"""

import asyncio
import httpx
import json
from typing import Dict, Any, Optional, List

class SimplePodcastClient:
    """Simplified podcast client that works reliably"""
    
    def __init__(self, service_url: str = "https://varnica-dev-podcastfy.onrender.com"):
        self.service_url = service_url
        
    async def health_check(self) -> Dict[str, Any]:
        """Check if the podcast service is available"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.service_url}/api/health")
                return {
                    "success": True,
                    "status_code": response.status_code,
                    "data": response.json() if response.status_code == 200 else response.text
                }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def generate_podcast_simple(
        self,
        text: Optional[str] = None,
        urls: Optional[List[str]] = None,
        title: str = "Generated Podcast",
        tts_model: str = "openai",  # Changed default to cost-effective OpenAI
        voice_id: str = "alloy",    # OpenAI voice, fallback for ElevenLabs
        max_timeout: int = 180  # Increased for OpenAI TTS
    ) -> Dict[str, Any]:
        """Generate a podcast with simple parameters"""
        
        if not text and not urls:
            return {
                "success": False,
                "error": "Either text or urls must be provided"
            }
        
        payload = {
            "title": title,
            "tts_model": tts_model,
            "voice_id": voice_id
        }
        
        if text:
            payload["text"] = text
        if urls:
            payload["urls"] = urls
            
        try:
            async with httpx.AsyncClient(timeout=max_timeout) as client:
                response = await client.post(
                    f"{self.service_url}/api/generate",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return {
                        "success": True,
                        "audio_url": result.get("audio_url"),
                        "transcript_url": result.get("transcript_url"),
                        "message": result.get("message"),
                        "full_response": result
                    }
                else:
                    # Handle specific HTTP error codes
                    error_message = f"HTTP {response.status_code}: {response.reason_phrase}"
                    if response.status_code == 502:
                        error_message += " - Service temporarily unavailable (Bad Gateway)"
                    elif response.status_code == 503:
                        error_message += " - Service temporarily unavailable"
                    elif response.status_code == 500:
                        error_message += " - Internal server error"
                    
                    try:
                        error_text = response.text
                        if error_text and len(error_text.strip()) > 0:
                            error_message += f" - Response: {error_text[:200]}"
                    except:
                        pass
                        
                    return {
                        "success": False,
                        "status_code": response.status_code,
                        "error": error_message
                    }
                    
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Request timed out - podcast generation may take longer than expected"
            }
        except httpx.HTTPStatusError as e:
            return {
                "success": False,
                "status_code": e.response.status_code,
                "error": f"HTTP {e.response.status_code}: {getattr(e.response, 'reason_phrase', 'Unknown')}"
            }
        except httpx.RequestError as e:
            error_details = str(e) if str(e) else f"{type(e).__name__} occurred"
            return {
                "success": False,
                "error": f"Network request failed: {error_details}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {type(e).__name__}: {str(e)}"
            }

    async def generate_from_conversation(
        self,
        conversation_messages: List[Dict[str, str]],
        title: str = "Agent Conversation Podcast",
        include_thinking: bool = False
    ) -> Dict[str, Any]:
        """Generate podcast from agent conversation messages"""
        
        # Format conversation for podcast
        formatted_text = self._format_conversation(conversation_messages, include_thinking)
        
        return await self.generate_podcast_simple(
            text=formatted_text,
            title=title,
            tts_model="openai"
        )
    
    def _format_conversation(self, messages: List[Dict[str, str]], include_thinking: bool = False) -> str:
        """Format conversation messages for podcast generation with proper speaker labels"""
        
        formatted_parts = []
        formatted_parts.append("This is an AI agent conversation formatted for podcast generation.")
        formatted_parts.append("\nHost: Welcome to this AI conversation podcast! Today we're exploring an interaction between a user and an AI assistant.")
        formatted_parts.append("Co-host: Let's dive into this fascinating conversation!\n")
        
        for i, message in enumerate(messages):
            role = message.get("role", "unknown")
            content = message.get("content", "")
            
            if role == "user":
                formatted_parts.append(f"Host: The user asked: {content}")
                formatted_parts.append("Co-host: That's an interesting question! What did the AI assistant respond?")
            elif role == "assistant":
                if include_thinking and "thinking" in message:
                    formatted_parts.append(f"Host: The AI assistant reasoned through this by thinking: {message['thinking']}")
                formatted_parts.append(f"Co-host: The AI assistant responded: {content}")
                formatted_parts.append("Host: That's a comprehensive response!")
            elif role == "system":
                formatted_parts.append(f"Host: The system provided this guidance: {content}")
        
        formatted_parts.append("\nHost: That concludes this AI conversation!")
        formatted_parts.append("Co-host: Thanks for listening to this AI interaction podcast!")
        
        return "\n\n".join(formatted_parts)

# Test function
async def test_simple_client():
    """Test the simple podcast client"""
    print("🧪 Testing Simple Podcast Client")
    
    client = SimplePodcastClient()
    
    # Test 1: Health check
    print("\n🔍 Test 1: Health Check")
    health = await client.health_check()
    print(f"Result: {health}")
    
    # Test 2: Simple text podcast
    print("\n🔍 Test 2: Simple Text Podcast")
    result = await client.generate_podcast_simple(
        text="This is a test of the simple podcast client integration.",
        title="Simple Test",
        tts_model="openai"
    )
    print(f"Result: {result}")
    
    # Test 3: Working news source
    print("\n🔍 Test 3: Working News Source")
    result = await client.generate_podcast_simple(
        urls=["https://httpbin.org/json"],
        title="JSON Test",
        tts_model="openai"
    )
    print(f"Result: {result}")

if __name__ == "__main__":
    asyncio.run(test_simple_client())