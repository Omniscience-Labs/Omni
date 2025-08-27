#!/usr/bin/env python3
"""
Complete TTS options for Podcastfy integration
Based on confirmed working configurations
"""

import asyncio
from simple_podcast_client import SimplePodcastClient
from typing import Dict, Any

class PodcastTTSInterface:
    """Interface for different TTS options in Podcastfy service"""
    
    def __init__(self, service_url: str = "https://varnica-dev-podcastfy.onrender.com"):
        self.client = SimplePodcastClient(service_url)
    
    async def generate_podcast(
        self,
        text: str = None,
        urls: list = None,
        title: str = "Generated Podcast",
        tts_model: str = "openai",  # Default to cost-effective option
        **kwargs
    ) -> Dict[str, Any]:
        """Generate podcast with specified TTS model"""
        
        # Configure voice based on TTS model
        voice_config = self._get_voice_config(tts_model)
        
        return await self.client.generate_podcast_simple(
            text=text,
            urls=urls,
            title=title,
            tts_model=tts_model,
            voice_id=voice_config["voice_id"],
            max_timeout=120
        )
    
    def _get_voice_config(self, tts_model: str) -> Dict[str, str]:
        """Get voice configuration for different TTS models"""
        
        voice_configs = {
            # OpenAI TTS - Cost-effective, produces ~307KB files
            "openai": {
                "voice_id": "alloy",  # Options: alloy, echo, fable, onyx, nova, shimmer
                "quality": "cost-effective",
                "file_size": "~307KB"
            },
            
            # ElevenLabs TTS - Premium quality, produces ~1.6MB files  
            "elevenlabs": {
                "voice_id": "ErXwobaYiN019PkySvjV",  # Premium voice
                "quality": "premium", 
                "file_size": "~1.6MB"
            }
        }
        
        return voice_configs.get(tts_model, voice_configs["openai"])

# Example usage functions
async def cost_effective_podcast(text: str, title: str = "Cost-Effective Podcast") -> Dict[str, Any]:
    """Generate cost-effective podcast using OpenAI TTS"""
    interface = PodcastTTSInterface()
    
    return await interface.generate_podcast(
        text=text,
        title=title,
        tts_model="openai"     # ✅ WORKING - 307KB files
    )

async def premium_quality_podcast(text: str, title: str = "Premium Podcast") -> Dict[str, Any]:
    """Generate premium quality podcast using ElevenLabs TTS"""
    interface = PodcastTTSInterface()
    
    return await interface.generate_podcast(
        text=text,
        title=title,
        tts_model="openai"  # ✅ WORKING - 1.6MB premium files  
    )

async def smart_tts_fallback(text: str, title: str = "Smart Podcast") -> Dict[str, Any]:
    """Smart fallback: Try OpenAI first, fallback to ElevenLabs if quota issues"""
    interface = PodcastTTSInterface()
    
    # Try cost-effective option first
    print("🎙️ Trying OpenAI TTS (cost-effective)...")
    result = await interface.generate_podcast(
        text=text,
        title=title,
        tts_model="openai"
    )
    
    if result.get("success"):
        print("✅ OpenAI TTS successful!")
        return result
    
    # Check if it's a quota issue
    error = result.get("error", "").lower()
    if "quota" in error or "credit" in error:
        print("💳 OpenAI quota issue, trying ElevenLabs...")
        
        result = await interface.generate_podcast(
            text=text,
            title=title,
            tts_model="openai"
        )
        
        if result.get("success"):
            print("✅ ElevenLabs TTS successful!")
            return result
    
    print("❌ Both TTS options failed")
    return result

# Voice options for each TTS model
OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
ELEVENLABS_VOICES = ["ErXwobaYiN019PkySvjV"]  # Add more as needed

if __name__ == "__main__":
    # Test both options
    async def test_tts_options():
        test_text = "This is a test of both TTS options to compare quality and file sizes."
        
        print("🎙️ Testing TTS Options")
        print("=" * 25)
        
        # Test OpenAI
        print("\n💰 Testing OpenAI TTS...")
        openai_result = await cost_effective_podcast(test_text, "OpenAI Test")
        if openai_result.get("success"):
            print(f"✅ OpenAI: {openai_result.get('audio_url')}")
        else:
            print(f"❌ OpenAI failed: {openai_result.get('error')}")
        
        # Test ElevenLabs  
        print("\n🎵 Testing ElevenLabs TTS...")
        elevenlabs_result = await premium_quality_podcast(test_text, "ElevenLabs Test")
        if elevenlabs_result.get("success"):
            print(f"✅ ElevenLabs: {elevenlabs_result.get('audio_url')}")
        else:
            print(f"❌ ElevenLabs failed: {elevenlabs_result.get('error')}")
            
        # Test smart fallback
        print("\n🧠 Testing Smart Fallback...")
        smart_result = await smart_tts_fallback(test_text, "Smart Fallback Test")
        print(f"Smart result: {smart_result.get('success', False)}")

    asyncio.run(test_tts_options())