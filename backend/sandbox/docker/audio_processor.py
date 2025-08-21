#!/usr/bin/env python3
"""
Audio processing script for running inside the sandbox container.
This script handles pydub operations that require ffmpeg.
"""
import os
import sys
import json
import tempfile
from pydub import AudioSegment

def chunk_audio(input_file, output_dir, chunk_duration_ms=600000):
    """
    Chunk an audio file into smaller segments.
    
    Args:
        input_file: Path to the input audio file
        output_dir: Directory to save chunks
        chunk_duration_ms: Duration of each chunk in milliseconds (default 10 minutes)
    
    Returns:
        List of chunk file paths
    """
    try:
        # Load audio file
        audio = AudioSegment.from_file(input_file)
        duration_ms = len(audio)
        
        # Calculate number of chunks
        num_chunks = (duration_ms + chunk_duration_ms - 1) // chunk_duration_ms
        
        chunk_files = []
        
        for i in range(num_chunks):
            start_ms = i * chunk_duration_ms
            end_ms = min(start_ms + chunk_duration_ms, duration_ms)
            
            # Extract chunk
            chunk = audio[start_ms:end_ms]
            
            # Save chunk
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
        return {
            "success": False,
            "error": str(e)
        }

def get_audio_info(input_file):
    """
    Get information about an audio file.
    
    Args:
        input_file: Path to the audio file
        
    Returns:
        Audio file information
    """
    try:
        audio = AudioSegment.from_file(input_file)
        
        return {
            "success": True,
            "duration_ms": len(audio),
            "duration_seconds": len(audio) / 1000,
            "frame_rate": audio.frame_rate,
            "channels": audio.channels,
            "sample_width": audio.sample_width,
            "file_size": os.path.getsize(input_file)
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command specified"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "chunk":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: python audio_processor.py chunk <input_file> <output_dir> [chunk_duration_ms]"}))
            sys.exit(1)
        
        input_file = sys.argv[2]
        output_dir = sys.argv[3]
        chunk_duration_ms = int(sys.argv[4]) if len(sys.argv) > 4 else 600000
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        result = chunk_audio(input_file, output_dir, chunk_duration_ms)
        print(json.dumps(result))
        
    elif command == "info":
        if len(sys.argv) < 3:
            print(json.dumps({"success": False, "error": "Usage: python audio_processor.py info <input_file>"}))
            sys.exit(1)
        
        input_file = sys.argv[2]
        result = get_audio_info(input_file)
        print(json.dumps(result))
        
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
