import os
import json
import tempfile
import openai
from typing import Optional, List, Tuple
from agentpress.tool import Tool, ToolResult, openapi_schema
from agentpress.thread_manager import ThreadManager
from sandbox.tool_base import SandboxToolsBase
from utils.logger import logger



class AudioTranscriptionTool(SandboxToolsBase):
    """Tool for transcribing audio files, including long recordings up to 2 hours.
    
    Handles chunking of large files that exceed OpenAI's 25MB limit and
    merges the results into a continuous transcript.
    
    Provides clean, concise transcription results without technical details.
    """

    def __init__(self, project_id: str, thread_manager: Optional[ThreadManager] = None):
        super().__init__(project_id, thread_manager)
        self.client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.max_file_size = 20 * 1024 * 1024  # 20MB to be safe (OpenAI limit is 25MB)
        self.chunk_duration = 10 * 60 * 1000  # 10 minutes in milliseconds

    def _file_exists(self, path: str) -> bool:
        """Check if a file exists in the sandbox"""
        try:
            self.sandbox.fs.get_file_info(path)
            return True
        except Exception:
            return False

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "transcribe_audio",
            "description": "Transcribe an audio file to text. Supports files up to 2 hours in length and handles chunking for large files automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the audio file to transcribe (e.g., '/workspace/meeting-recording.webm')"
                    },
                    "language": {
                        "type": "string",
                        "description": "Optional language code (e.g., 'en' for English, 'es' for Spanish). If not provided, the language will be auto-detected."
                    },
                    "prompt": {
                        "type": "string",
                        "description": "Optional prompt to guide the transcription style or provide context."
                    },
                    "concise": {
                        "type": "boolean", 
                        "description": "If true, returns only the transcription text without technical details. Default: true",
                        "default": True
                    }
                },
                "required": ["file_path"]
            }
        }
    })

    async def transcribe_audio(
        self,
        file_path: str,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        concise: bool = True
    ) -> ToolResult:
        """Transcribe an audio file to text.
        
        Args:
            file_path: Path to the audio file
            language: Optional language code for transcription
            prompt: Optional context prompt
            concise: If true, returns only the transcription without technical details
            
        Returns:
            ToolResult with the transcribed text or error
        """
        try:
            # Ensure sandbox is initialized
            await self._ensure_sandbox()
            
            # Clean and validate the file path
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            # Check if file exists using the sandbox filesystem
            if not self._file_exists(full_path):
                return self.fail_response(f"File not found: {file_path}")
            
            # Download the file to a temporary location
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file_path)[1]) as temp_file:
                temp_path = temp_file.name
                
            try:
                # Read file content from sandbox using proper method
                content = self.sandbox.fs.download_file(full_path)
                with open(temp_path, 'wb') as f:
                    f.write(content)
                
                # Check file size
                file_size = os.path.getsize(temp_path)
                logger.info(f"Audio file size: {file_size / (1024*1024):.2f}MB")
                
                if file_size <= self.max_file_size:
                    # File is small enough, transcribe directly
                    transcript = await self._transcribe_file(temp_path, language, prompt)
                else:
                    # File is too large, need to chunk it
                    logger.info("File exceeds size limit, chunking for transcription...")
                    transcript = await self._transcribe_chunked(temp_path, language, prompt)
                
                # Save transcript to a text file
                transcript_path = file_path.rsplit('.', 1)[0] + '_transcript.txt'
                full_transcript_path = f"{self.workspace_path}/{transcript_path}"
                self.sandbox.fs.upload_file(transcript.encode(), full_transcript_path)
                
                if concise:
                    # Return just the transcript text for concise mode
                    return self.success_response(f"**Transcription:** {transcript}")
                else:
                    # Return detailed response with metadata
                    response_message = f"**Transcription:**\n\n{transcript}\n\n"
                    response_message += f"*Transcript saved to: {transcript_path}*\n"
                    response_message += f"*File size: {round(file_size / (1024*1024), 2)} MB*"
                    return self.success_response(response_message)
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temporary file {temp_path}: {e}")
                    
        except Exception as e:
            logger.error(f"Error transcribing audio file {file_path}: {str(e)}")
            return self.fail_response(f"Transcription failed: {str(e)}")
    
    async def _transcribe_file(self, file_path: str, language: Optional[str] = None, prompt: Optional[str] = None) -> str:
        """Transcribe a single audio file using OpenAI Whisper API."""
        try:
            with open(file_path, 'rb') as audio_file:
                transcription_params = {
                    "model": "whisper-1",  # Using correct Whisper model for Omni
                    "file": audio_file,
                    "response_format": "text"
                }
                
                if language:
                    transcription_params["language"] = language
                if prompt:
                    # Limit prompt to 224 tokens as per OpenAI's limit
                    transcription_params["prompt"] = prompt[:800]  # Rough character limit
                
                transcript = self.client.audio.transcriptions.create(**transcription_params)
                return transcript
        except Exception as e:
            logger.error(f"Error in direct transcription: {str(e)}")
            raise
    
    async def _transcribe_chunked(self, file_path: str, language: Optional[str] = None, prompt: Optional[str] = None) -> str:
        """Transcribe a large audio file by chunking it into smaller segments using sandbox."""
        try:
            # Upload the file to sandbox for processing
            logger.info(f"Uploading audio file to sandbox for chunking: {file_path}")
            
            # Read the local file and upload to sandbox
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            sandbox_file_path = f"{self.workspace_path}/temp_audio{os.path.splitext(file_path)[1]}"
            self.sandbox.fs.upload_file(file_content, sandbox_file_path)
            
            # Create chunks directory in sandbox
            chunks_dir = f"{self.workspace_path}/audio_chunks"
            await self.sandbox.process.exec(f"mkdir -p {chunks_dir}")
            
            # First, ensure ffmpeg and pydub are installed in the sandbox
            ffmpeg_check = await self.sandbox.process.exec("which ffmpeg", timeout=30)
            if ffmpeg_check.exit_code != 0:
                logger.info("Installing ffmpeg in sandbox...")
                ffmpeg_install = await self.sandbox.process.exec("sudo apt-get update && sudo apt-get install -y ffmpeg", timeout=180)
                if ffmpeg_install.exit_code != 0:
                    logger.warning(f"Failed to install ffmpeg: {ffmpeg_install.result}")
            
            install_cmd = "pip install pydub==0.25.1"
            install_response = await self.sandbox.process.exec(install_cmd, timeout=120)
            if install_response.exit_code != 0:
                logger.warning(f"Failed to install pydub in sandbox: {install_response.result}")
            
            # Create the audio processor script in the sandbox
            audio_processor_script = '''#!/usr/bin/env python3
import os
import sys
import json
import tempfile
from pydub import AudioSegment

def chunk_audio(input_file, output_dir, chunk_duration_ms=600000):
    try:
        audio = AudioSegment.from_file(input_file)
        duration_ms = len(audio)
        num_chunks = (duration_ms + chunk_duration_ms - 1) // chunk_duration_ms
        chunk_files = []
        
        for i in range(num_chunks):
            start_ms = i * chunk_duration_ms
            end_ms = min(start_ms + chunk_duration_ms, duration_ms)
            chunk = audio[start_ms:end_ms]
            chunk_filename = f"chunk_{i:03d}.mp3"
            chunk_path = os.path.join(output_dir, chunk_filename)
            chunk.export(chunk_path, format="mp3", bitrate="128k")
            chunk_files.append({
                "path": chunk_path,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": end_ms - start_ms
            })
        
        return {
            "success": True,
            "total_duration_ms": duration_ms,
            "num_chunks": num_chunks,
            "chunks": chunk_files
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

if len(sys.argv) >= 4 and sys.argv[1] == "chunk":
    input_file = sys.argv[2]
    output_dir = sys.argv[3]
    chunk_duration_ms = int(sys.argv[4]) if len(sys.argv) > 4 else 600000
    os.makedirs(output_dir, exist_ok=True)
    result = chunk_audio(input_file, output_dir, chunk_duration_ms)
    print(json.dumps(result))
else:
    print(json.dumps({"success": False, "error": "Usage: python audio_processor.py chunk <input_file> <output_dir> [chunk_duration_ms]"}))
'''
            
            # Upload the script to sandbox
            script_path = f"{self.workspace_path}/audio_processor.py"
            self.sandbox.fs.upload_file(audio_processor_script.encode(), script_path)
            
            # Run audio processing in sandbox to chunk the file
            chunk_cmd = f"cd {self.workspace_path} && python audio_processor.py chunk {sandbox_file_path} {chunks_dir} {self.chunk_duration}"
            response = await self.sandbox.process.exec(chunk_cmd, timeout=300)
            
            if response.exit_code != 0:
                raise Exception(f"Audio chunking failed: {response.result}")
            
            # Parse the chunking result
            import json
            chunk_result = json.loads(response.result)
            
            if not chunk_result.get("success"):
                raise Exception(f"Audio chunking failed: {chunk_result.get('error')}")
            
            chunks = chunk_result["chunks"]
            duration_min = chunk_result["total_duration_ms"] / (1000 * 60)
            logger.info(f"Audio duration: {duration_min:.2f} minutes, created {len(chunks)} chunks")
            
            transcripts = []
            context_prompt = prompt or ""
            
            for i, chunk_info in enumerate(chunks):
                # Download chunk from sandbox
                chunk_content = self.sandbox.fs.download_file(chunk_info["path"])
                
                # Create temporary file for transcription
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as chunk_file:
                    chunk_file.write(chunk_content)
                    chunk_path = chunk_file.name
                
                try:
                    # Transcribe chunk with context from previous chunks
                    start_s = chunk_info["start_ms"] / 1000
                    end_s = chunk_info["end_ms"] / 1000
                    logger.info(f"Transcribing chunk {i+1}/{len(chunks)} ({start_s:.1f}s - {end_s:.1f}s)")
                    
                    # Use the last part of previous transcript as context
                    if i > 0 and transcripts:
                        # Get last ~100 words from previous transcript for context
                        prev_text = transcripts[-1].split()
                        context = " ".join(prev_text[-100:]) if len(prev_text) > 100 else transcripts[-1]
                        chunk_prompt = f"{context_prompt}\n\nPrevious context: {context}"
                    else:
                        chunk_prompt = context_prompt
                    
                    chunk_transcript = await self._transcribe_file(chunk_path, language, chunk_prompt)
                    transcripts.append(chunk_transcript.strip())
                    
                finally:
                    # Clean up local chunk file
                    try:
                        os.unlink(chunk_path)
                    except Exception as e:
                        logger.warning(f"Failed to delete chunk file {chunk_path}: {e}")
            
            # Clean up sandbox files
            try:
                await self.sandbox.process.exec(f"rm -rf {sandbox_file_path} {chunks_dir}")
            except Exception as e:
                logger.warning(f"Failed to clean up sandbox files: {e}")
            
            # Merge transcripts with proper spacing
            full_transcript = "\n\n".join(transcripts)
            
            # Post-process to remove potential duplicates at chunk boundaries
            full_transcript = self._clean_transcript(full_transcript)
            
            return full_transcript
            
        except Exception as e:
            logger.error(f"Error in chunked transcription: {str(e)}")
            raise
    
    def _clean_transcript(self, transcript: str) -> str:
        """Clean up the merged transcript to remove artifacts from chunking."""
        # Remove potential duplicate sentences at chunk boundaries
        lines = transcript.split('\n')
        cleaned_lines = []
        
        for i, line in enumerate(lines):
            if i == 0 or not line.strip():
                cleaned_lines.append(line)
            else:
                # Check if this line is very similar to the end of the previous line
                prev_line = cleaned_lines[-1] if cleaned_lines else ""
                if not self._is_duplicate_content(prev_line, line):
                    cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines)
    
    def _is_duplicate_content(self, text1: str, text2: str) -> bool:
        """Check if two text segments are duplicates (handling minor variations)."""
        # Simple check: if the beginning of text2 appears at the end of text1
        if not text1 or not text2:
            return False
            
        # Get the last 50 characters of text1 and first 50 of text2
        overlap_check_len = min(50, len(text1), len(text2))
        text1_end = text1[-overlap_check_len:].lower().strip()
        text2_start = text2[:overlap_check_len].lower().strip()
        
        # Check if there's significant overlap
        return text2_start in text1_end or text1_end in text2_start
