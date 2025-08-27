#!/usr/bin/env python3
"""
Improved Omni Agent Podcast Integration
Copy this to your Omni agent directory and use instead of the complex integration
"""

import asyncio
import httpx
import json
import sys
import os
from typing import Dict, Any, Optional, List

class OmniPodcastTool:
    """Simplified podcast tool for Omni agents"""
    
    def __init__(self):
        # Use the working service URL
        self.service_url = "https://varnica-dev-podcastfy.onrender.com"
        self.timeout = 90  # Increased timeout for podcast generation
        
    async def check_podcast_status(self) -> Dict[str, Any]:
        """Check if the Podcastfy service is available"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.service_url}/api/health")
                
                if response.status_code == 200:
                    service_info = response.json()
                    return {
                        "success": True,
                        "status": "Podcastfy service is available",
                        "service_url": self.service_url,
                        "response_code": response.status_code,
                        "service_info": service_info
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Service returned {response.status_code}: {response.text}"
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to check service: {str(e)}"
            }
    
    async def generate_podcast_from_agent_run(
        self,
        agent_run_id: str,
        podcast_title: str = "",
        include_thinking: bool = False
    ) -> Dict[str, Any]:
        """Generate podcast from agent run - implement this in your Omni environment"""
        
        # This would need to be implemented with your specific agent run data access
        return {
            "success": False,
            "error": "This method needs to be implemented with your Omni agent run data access"
        }
    
    async def generate_podcast_from_url(
        self,
        url: str,
        title: str = "Web Content Podcast",
        max_length: int = 8000
    ) -> Dict[str, Any]:
        """Generate podcast from web URL"""
        
        # Working alternatives to NYT
        working_sources = [
            "wikipedia.org",
            "httpbin.org", 
            "jsonplaceholder.typicode.com",
            "en.wikipedia.org"
        ]
        
        is_protected_source = any(blocked in url for blocked in ["nytimes.com", "reuters.com", "wsj.com"])
        
        payload = {
            "urls": [url],
            "title": title,
            "tts_model": "openai",
            "voice_id": "alloy",
            "max_tokens": max_length
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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
                        "message": result.get("message", "Podcast generated successfully"),
                        "source_url": url
                    }
                else:
                    error_data = response.text
                    
                    # Provide helpful guidance for protected sources
                    if is_protected_source and "403" in error_data:
                        return {
                            "success": False,
                            "error": f"Content source '{url}' blocks automated access. Try manual content extraction or alternative sources.",
                            "suggested_alternatives": working_sources
                        }
                    
                    return {
                        "success": False,
                        "error": f"Generation failed: {error_data}",
                        "status_code": response.status_code
                    }
                    
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": f"Request timed out after {self.timeout} seconds. Podcast generation may take longer for complex content."
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}"
            }
    
    async def generate_podcast_from_text(
        self,
        text: str,
        title: str = "Custom Podcast",
        conversation_style: str = "informative"
    ) -> Dict[str, Any]:
        """Generate podcast from text content - WORKING METHOD"""
        
        payload = {
            "text": text,
            "title": title,
            "tts_model": "openai",
            "voice_id": "alloy",
            "conversation_style": conversation_style
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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
                        "message": result.get("message", "Podcast generated successfully")
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Generation failed: {response.text}",
                        "status_code": response.status_code
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}"
            }

# Test function for NYT content workaround
async def test_nyt_workaround():
    """Test the NYT content workaround"""
    
    print("🧪 TESTING NYT CONTENT WORKAROUND")
    print("=" * 50)
    
    tool = OmniPodcastTool()
    
    # Test 1: NYT-style political content (manual extraction)
    nyt_style_content = """
    European leaders are closely watching the evolving dynamics between Donald Trump, Volodymyr Zelensky, and Vladimir Putin as the Ukraine conflict continues to shape global politics. Recent diplomatic developments suggest that complex negotiations may be on the horizon, with European capitals particularly concerned about potential changes to NATO support and military aid to Ukraine.
    
    The relationship between these three leaders has profound implications for European security architecture. Trump has previously indicated he could resolve the Ukraine conflict quickly through negotiations, while Zelensky continues to advocate for sustained Western support. Putin, meanwhile, has shown limited flexibility in meaningful peace discussions.
    
    European allies are preparing for various scenarios, including potential shifts in American foreign policy, diplomatic pressure for territorial concessions, and the sustainability of current aid levels. The stakes for European security and the transatlantic alliance have never been higher.
    """
    
    print("\n🔍 Test 1: NYT-Style Political Content")
    result = await tool.generate_podcast_from_text(
        text=nyt_style_content,
        title="Europe Monitors Trump-Zelensky-Putin Dynamics",
        conversation_style="news_analysis"
    )
    
    if result["success"]:
        print("✅ SUCCESS! Political content podcast generated")
        print(f"🎵 Audio: {result['audio_url']}")
        print(f"📝 Transcript: {result['transcript_url']}")
    else:
        print(f"❌ Failed: {result['error']}")
    
    # Test 2: Alternative news sources
    print("\n🔍 Test 2: Alternative News Sources")
    alternative_sources = [
        "https://en.wikipedia.org/wiki/2022_Russian_invasion_of_Ukraine",
        "https://httpbin.org/json"
    ]
    
    for url in alternative_sources:
        print(f"\n   Testing: {url}")
        result = await tool.generate_podcast_from_url(url, f"News Test - {url.split('/')[-1]}")
        
        status = "✅ SUCCESS" if result["success"] else "❌ FAILED"
        print(f"   {status}: {result.get('message', result.get('error', 'Unknown'))}")

if __name__ == "__main__":
    asyncio.run(test_nyt_workaround())