#!/usr/bin/env python3
"""
Debug script for Omni integration with Podcastfy service
Run this in your Omni agent environment to identify issues
"""

import asyncio
import sys
import os
import json
from typing import Dict, Any, Optional

# Add paths that might be needed
sys.path.extend([
    '/workspace',
    '/workspace/backend', 
    './backend',
    '.'
])

async def debug_omni_integration():
    """Comprehensive debug test for Omni integration"""
    
    print("🔍 OMNI INTEGRATION DEBUG TEST")
    print("=" * 60)
    
    # Step 1: Test Python Environment
    print("\n📋 STEP 1: Python Environment Check")
    print(f"✅ Python Version: {sys.version}")
    print(f"✅ Current Working Directory: {os.getcwd()}")
    print(f"✅ Python Path: {sys.path[:3]}...")
    
    # Step 2: Test Import Capabilities
    print("\n📋 STEP 2: Import Dependencies")
    try:
        import httpx
        print("✅ httpx: Available")
    except ImportError as e:
        print(f"❌ httpx: Missing - {e}")
        
    try:
        import aiohttp
        print("✅ aiohttp: Available")
    except ImportError as e:
        print(f"❌ aiohttp: Missing - {e}")
        
    try:
        import requests
        print("✅ requests: Available")
    except ImportError as e:
        print(f"❌ requests: Missing - {e}")
    
    # Step 3: Test Network Connectivity
    print("\n📋 STEP 3: Network Connectivity")
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Test basic internet
            response = await client.get("https://httpbin.org/ip")
            print(f"✅ Internet: {response.status_code} - IP: {response.json().get('origin', 'N/A')}")
            
            # Test podcastfy service health
            response = await client.get("https://varnica-dev-podcastfy.onrender.com/api/health")
            print(f"✅ Podcastfy Health: {response.status_code} - {response.json()}")
            
    except Exception as e:
        print(f"❌ Network Test Failed: {e}")
    
    # Step 4: Test Simple Podcast Generation
    print("\n📋 STEP 4: Podcast Generation Test")
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "text": "This is a test from the Omni integration debug script.",
                "title": "Omni Debug Test",
                "tts_model": "openai"
            }
            
            response = await client.post(
                "https://varnica-dev-podcastfy.onrender.com/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"📊 Generation Status: {response.status_code}")
            if response.status_code == 200:
                result = response.json()
                print("✅ SUCCESS! Podcast generated successfully")
                print(f"🎵 Audio URL: {result.get('audio_url', 'N/A')}")
                print(f"📝 Transcript URL: {result.get('transcript_url', 'N/A')}")
            else:
                print(f"❌ Generation Failed: {response.text}")
                
    except Exception as e:
        print(f"❌ Podcast Generation Failed: {e}")
    
    # Step 5: Test File Path Access
    print("\n📋 STEP 5: File Path Analysis")
    potential_paths = [
        "./backend/agent/tools/podcast_tool.py",
        "/workspace/backend/agent/tools/podcast_tool.py", 
        "./podcast_tool.py",
        "../backend/agent/tools/podcast_tool.py"
    ]
    
    for path in potential_paths:
        if os.path.exists(path):
            print(f"✅ Found: {path}")
        else:
            print(f"❌ Missing: {path}")
    
    print("\n🎯 DEBUG COMPLETE")
    print("\nIf you see any ❌ errors above, that's what needs to be fixed!")
    print("Share this output and I'll provide the exact solutions.")

if __name__ == "__main__":
    asyncio.run(debug_omni_integration())