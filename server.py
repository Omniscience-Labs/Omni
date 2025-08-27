#!/usr/bin/env python3
"""
Dedicated Podcast Service Server
This is the server.py file for the varnica-dev-podcastfy.onrender.com service
"""

import os
import httpx
import asyncio
import uuid
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Podcastfy Service", version="1.0.0")

# In-memory storage for jobs (in production, use Redis)
job_storage = {}

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class PodcastGenerateRequest(BaseModel):
    text: Optional[str] = None
    urls: Optional[List[str]] = None
    title: str = "Generated Podcast"
    tts_model: str = "openai"
    voice_id: str = "alloy"
    conversation_style: str = "informative"
    agent_run_id: Optional[str] = None
    include_thinking: bool = False

class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    version: str

class PodcastResponse(BaseModel):
    success: bool
    podcast_url: Optional[str] = None
    podcast_id: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None

class AsyncJobResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    message: str

class JobStatusResponse(BaseModel):
    success: bool
    job_id: str
    status: str  # pending, processing, completed, failed
    podcast_url: Optional[str] = None
    audio_url: Optional[str] = None
    error: Optional[str] = None
    progress: Optional[int] = None  # 0-100%

# Health check endpoint
@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        service="podcastfy",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0"
    )

@app.get("/")
async def root():
    """Root endpoint with API documentation"""
    return {
        "service": "Podcastfy Backend API",
        "status": "running", 
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/health",
            "generate": "/api/generate", 
            "generate_async": "/api/generate/async",
            "job_status": "/api/status/<job_id>",
            "audio": "/api/audio/<filename>",
            "transcript": "/api/transcript/<filename>"
        },
        "frontend": "https://podcastfy-opxm6bilx-latent-labs1.vercel.app"
    }

# Main podcast generation endpoint
@app.post("/api/generate", response_model=PodcastResponse)
async def generate_podcast(request: PodcastGenerateRequest):
    """Generate podcast from text, URLs, or agent run data"""
    try:
        logger.info(f"Podcast generation request: title='{request.title}', tts_model='{request.tts_model}'")
        
        # Validate input
        if not request.text and not request.urls and not request.agent_run_id:
            raise HTTPException(
                status_code=400, 
                detail="Must provide either text, URLs, or agent_run_id"
            )
        
        # Get the actual Podcastfy service URL from environment
        podcastfy_service_url = os.getenv("PODCASTFY_SERVICE_URL", "https://varnica-dev-podcastfy.onrender.com")
        
        # Prepare the payload for the actual Podcastfy service
        payload = {
            "tts_model": request.tts_model,
            "voice_id": request.voice_id,
            "conversation_style": request.conversation_style
        }
        
        if request.text:
            payload["text"] = request.text
        if request.urls:
            payload["urls"] = request.urls
        if request.title:
            payload["title"] = request.title
        if request.agent_run_id:
            payload["agent_run_id"] = request.agent_run_id
        if request.include_thinking is not None:
            payload["include_thinking"] = request.include_thinking
        
        # Call the actual Podcastfy service
        async with httpx.AsyncClient(timeout=180.0) as client:
            logger.info(f"Calling Podcastfy service at: {podcastfy_service_url}")
            
            response = await client.post(
                f"{podcastfy_service_url}/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info("Podcast generation successful")
                
                return PodcastResponse(
                    success=True,
                    podcast_url=result.get("podcast_url"),
                    podcast_id=result.get("podcast_id"),
                    status=result.get("status", "completed")
                )
            else:
                error_text = response.text
                logger.error(f"Podcastfy service error: {response.status_code} - {error_text}")
                
                return PodcastResponse(
                    success=False,
                    error=f"Podcast generation failed: HTTP {response.status_code}"
                )
                
    except httpx.TimeoutException:
        logger.error("Podcastfy service timeout")
        return PodcastResponse(
            success=False,
            error="Podcast generation timed out"
        )
    except Exception as e:
        logger.error(f"Podcast generation error: {str(e)}")
        return PodcastResponse(
            success=False,
            error=f"Internal server error: {str(e)}"
        )

# Async job submission endpoint
@app.post("/api/generate/async", response_model=AsyncJobResponse)
async def generate_podcast_async(request: PodcastGenerateRequest):
    """Submit podcast generation job and return job ID immediately"""
    try:
        logger.info(f"Async podcast job submission: title='{request.title}', tts_model='{request.tts_model}'")
        
        # Validate input
        if not request.text and not request.urls and not request.agent_run_id:
            raise HTTPException(
                status_code=400, 
                detail="Must provide either text, URLs, or agent_run_id"
            )
        
        # Generate unique job ID
        job_id = str(uuid.uuid4())
        
        # Store job in memory with pending status
        job_storage[job_id] = {
            "status": "pending",
            "request": request.dict(),
            "created_at": datetime.utcnow().isoformat(),
            "progress": 0
        }
        
        # Start background task for actual processing
        asyncio.create_task(_process_podcast_job(job_id, request))
        
        return AsyncJobResponse(
            success=True,
            job_id=job_id,
            status="pending",
            message=f"Podcast job {job_id} submitted successfully"
        )
        
    except Exception as e:
        logger.error(f"Error submitting async podcast job: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to submit job: {str(e)}")

# Job status checking endpoint
@app.get("/api/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Check the status of a podcast generation job"""
    try:
        if job_id not in job_storage:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        
        job = job_storage[job_id]
        
        return JobStatusResponse(
            success=True,
            job_id=job_id,
            status=job["status"],
            podcast_url=job.get("podcast_url"),
            audio_url=job.get("audio_url"),
            error=job.get("error"),
            progress=job.get("progress", 0)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking job status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to check job status: {str(e)}")

# Background job processor
async def _process_podcast_job(job_id: str, request: PodcastGenerateRequest):
    """Background task to process podcast generation"""
    try:
        logger.info(f"Processing podcast job: {job_id}")
        
        # Update job status to processing
        job_storage[job_id]["status"] = "processing"
        job_storage[job_id]["progress"] = 10
        
        # Get the actual Podcastfy service URL from environment
        podcastfy_service_url = os.getenv("PODCASTFY_SERVICE_URL", "https://varnica-dev-podcastfy.onrender.com")
        
        # Prepare the payload for the actual Podcastfy service
        payload = {
            "tts_model": request.tts_model,
            "voice_id": request.voice_id,
            "conversation_style": request.conversation_style
        }
        
        if request.text:
            payload["text"] = request.text
        if request.urls:
            payload["urls"] = request.urls
        if request.title:
            payload["title"] = request.title
        if request.agent_run_id:
            payload["agent_run_id"] = request.agent_run_id
        if request.include_thinking is not None:
            payload["include_thinking"] = request.include_thinking
        
        # Update progress
        job_storage[job_id]["progress"] = 25
        
        # Call the actual Podcastfy service
        async with httpx.AsyncClient(timeout=180.0) as client:
            logger.info(f"Calling Podcastfy service at: {podcastfy_service_url}")
            
            job_storage[job_id]["progress"] = 50
            
            # Try primary TTS model first
            response = await client.post(
                f"{podcastfy_service_url}/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            job_storage[job_id]["progress"] = 75
            
            # Check if we need to try fallback due to quota issues
            if response.status_code != 200:
                error_text = response.text.lower()
                if "quota" in error_text or "credit" in error_text or "rate" in error_text:
                    logger.info(f"TTS quota issue detected for {request.tts_model}, trying fallback...")
                    
                    # Switch to alternative TTS model
                    fallback_model = "elevenlabs" if request.tts_model == "openai" else "openai"
                    fallback_voice = "ErXwobaYiN019PkySvjV" if fallback_model == "elevenlabs" else "alloy"
                    
                    fallback_payload = payload.copy()
                    fallback_payload["tts_model"] = fallback_model
                    fallback_payload["voice_id"] = fallback_voice
                    
                    logger.info(f"Trying fallback TTS model: {fallback_model}")
                    response = await client.post(
                        f"{podcastfy_service_url}/api/generate",
                        json=fallback_payload,
                        headers={"Content-Type": "application/json"}
                    )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"Podcast job {job_id} completed successfully")
                
                # Update job with success
                job_storage[job_id].update({
                    "status": "completed",
                    "podcast_url": result.get("podcast_url"),
                    "audio_url": result.get("audio_url"),
                    "podcast_id": result.get("podcast_id"),
                    "progress": 100,
                    "completed_at": datetime.utcnow().isoformat()
                })
            else:
                error_text = response.text
                logger.error(f"Podcast job {job_id} failed: {response.status_code} - {error_text}")
                
                # Update job with failure
                job_storage[job_id].update({
                    "status": "failed",
                    "error": f"Podcast generation failed: HTTP {response.status_code}",
                    "progress": 100,
                    "completed_at": datetime.utcnow().isoformat()
                })
                    
    except httpx.TimeoutException:
        logger.error(f"Podcast job {job_id} timed out")
        job_storage[job_id].update({
            "status": "failed",
            "error": "Podcast generation timed out",
            "progress": 100,
            "completed_at": datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Podcast job {job_id} error: {str(e)}")
        job_storage[job_id].update({
            "status": "failed",
            "error": f"Internal server error: {str(e)}",
            "progress": 100,
            "completed_at": datetime.utcnow().isoformat()
        })

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=404,
        content={"error": "Endpoint not found", "detail": "Please check the API documentation"}
    )

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    logger.error(f"Internal server error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": "Please try again later"}
    )

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting Podcastfy service on port {port}")
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
