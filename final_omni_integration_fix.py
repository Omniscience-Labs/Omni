#!/usr/bin/env python3
"""
FINAL OMNI INTEGRATION FIX
This is your complete working solution for Omni agents + Podcastfy

USAGE IN YOUR OMNI AGENT:
1. Copy this file to your Omni agent directory
2. Import: from final_omni_integration_fix import OmniPodcastToolFixed
3. Use: tool = OmniPodcastToolFixed()
4. Call: result = await tool.generate_podcast(...)
"""

import asyncio
import httpx
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

class OmniPodcastToolFixed:
    """Production-ready podcast tool for Omni agents"""
    
    def __init__(self):
        # FIXED: Use the working service URL
        self.service_url = "https://varnica-dev-podcastfy.onrender.com"
        self.timeout = 90
        
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
    
    async def generate_podcast(
        self,
        agent_run_id: Optional[str] = None,
        text: Optional[str] = None,
        urls: Optional[List[str]] = None,
        title: str = "AI Agent Podcast",
        include_thinking: bool = False,
        conversation_style: str = "informative"
    ) -> Dict[str, Any]:
        """
        Main podcast generation method - handles all use cases
        
        Args:
            agent_run_id: For agent conversation podcasts (implement with your DB access)
            text: Direct text content (WORKING - best for NYT content)
            urls: Web URLs (LIMITED - NYT/Reuters block access)
            title: Podcast title
            include_thinking: Include agent reasoning
            conversation_style: Style of conversation
        """
        
        try:
            # Priority 1: Direct text content (always works)
            if text:
                return await self._generate_from_text(text, title, conversation_style)
            
            # Priority 2: URLs (works for accessible sources)
            elif urls:
                return await self._generate_from_urls(urls, title)
            
            # Priority 3: Agent run data (needs implementation)
            elif agent_run_id:
                return await self._generate_from_agent_run(agent_run_id, title, include_thinking)
            
            else:
                return {
                    "success": False,
                    "error": "No content provided. Specify text, urls, or agent_run_id."
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Podcast generation failed: {str(e)}"
            }
    
    async def _generate_from_text(self, text: str, title: str, style: str) -> Dict[str, Any]:
        """Generate podcast from text content - MOST RELIABLE METHOD"""
        
        payload = {
            "text": text,
            "title": title,
            "tts_model": "openai",
            "voice_id": "alloy",
            "conversation_style": style,
            "metadata": {
                "source": "omni_agent_text",
                "generated_at": datetime.now().isoformat()
            }
        }
        
        return await self._make_request(payload)
    
    async def _generate_from_urls(self, urls: List[str], title: str) -> Dict[str, Any]:
        """Generate podcast from URLs - LIMITED BY SITE PROTECTION"""
        
        # Check for protected sources
        protected_domains = ["nytimes.com", "reuters.com", "wsj.com", "ft.com"]
        protected_urls = [url for url in urls if any(domain in url for domain in protected_domains)]
        
        if protected_urls:
            return {
                "success": False,
                "error": f"Protected sources detected: {protected_urls}. Use manual text extraction instead.",
                "suggestion": "Copy article content and use generate_podcast(text=content) instead"
            }
        
        payload = {
            "urls": urls,
            "title": title,
            "tts_model": "openai",
            "voice_id": "alloy",
            "max_tokens": 8000,  # Prevent context window issues
            "metadata": {
                "source": "omni_agent_urls",
                "generated_at": datetime.now().isoformat()
            }
        }
        
        return await self._make_request(payload)
    
    async def _generate_from_agent_run(self, agent_run_id: str, title: str, include_thinking: bool) -> Dict[str, Any]:
        """Generate podcast from agent run data - IMPLEMENT WITH YOUR DB ACCESS"""
        
        # This is where you'd implement your agent run data retrieval
        # Example structure:
        
        try:
            # TODO: Implement with your specific database access
            # agent_data = await self._fetch_agent_run_data(agent_run_id)
            # messages = await self._fetch_thread_messages(agent_data['thread_id'])
            # formatted_content = self._format_conversation(messages, include_thinking)
            
            return {
                "success": False,
                "error": "Agent run podcast generation needs to be implemented with your specific database access",
                "suggestion": "Use generate_podcast(text=your_conversation_text) as a workaround"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Agent run processing failed: {str(e)}"
            }
    
    async def _make_request(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make the actual request to the podcast service"""
        
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
                        "full_response": result
                    }
                else:
                    return {
                        "success": False,
                        "error": response.text,
                        "status_code": response.status_code
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}"
            }

# WORKING EXAMPLES FOR YOUR OMNI AGENT
async def working_examples():
    """Examples of what works in your Omni agent"""
    
    tool = OmniPodcastToolFixed()
    
    print("🚀 WORKING EXAMPLES FOR OMNI AGENT")
    print("=" * 50)
    
    # Example 1: Manual NYT content (RECOMMENDED)
    print("\n📰 Example 1: NYT Content (Manual)")
    nyt_content = """
    European leaders are intensely monitoring the diplomatic relationship between Trump, Zelensky, and Putin as geopolitical tensions escalate. The complex dynamics between these three leaders represent one of the most consequential diplomatic situations of our time, with profound implications for European security and the future of NATO.
    """
    
    result = await tool.generate_podcast(
        text=nyt_content,
        title="Europe Watches Trump-Zelensky-Putin Dynamic",
        conversation_style="news_analysis"
    )
    
    if result["success"]:
        print("✅ SUCCESS! NYT-style content works perfectly")
        print(f"🎵 Audio: {result['audio_url']}")
    else:
        print(f"❌ Failed: {result['error']}")
    
    # Example 2: Working URL sources
    print("\n🌐 Example 2: Working URL Sources")
    working_urls = ["https://httpbin.org/json"]
    
    result = await tool.generate_podcast(
        urls=working_urls,
        title="JSON Data Podcast Test"
    )
    
    if result["success"]:
        print("✅ SUCCESS! URL processing works")
        print(f"🎵 Audio: {result['audio_url']}")
    else:
        print(f"❌ Failed: {result['error']}")
    
    # Example 3: Protected source handling
    print("\n🛡️ Example 3: Protected Source Handling")
    result = await tool.generate_podcast(
        urls=["https://www.nytimes.com/2025/08/17/us/politics/europe-trump-zelensky-putin.html"],
        title="Protected Source Test"
    )
    
    print(f"Protected source result: {result}")

if __name__ == "__main__":
    asyncio.run(working_examples())