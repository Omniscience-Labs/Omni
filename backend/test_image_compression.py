#!/usr/bin/env python3
"""Test script for image compression functionality in SeeImage tool."""

import os
import sys
from io import BytesIO
from PIL import Image
import base64

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent.tools.sb_vision_tool import SandboxVisionTool

def create_test_image(width=3000, height=2000, format='PNG'):
    """Create a test image with specified dimensions."""
    # Create a colorful test pattern
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    for x in range(width):
        for y in range(height):
            # Create a gradient pattern
            r = int((x / width) * 255)
            g = int((y / height) * 255)
            b = int(((x + y) / (width + height)) * 255)
            pixels[x, y] = (r, g, b)
    
    # Save to bytes
    output = BytesIO()
    img.save(output, format=format)
    return output.getvalue()

def test_compression():
    """Test the compression functionality."""
    # Create a mock SandboxVisionTool instance
    # We'll just test the compress_image method directly
    tool = SandboxVisionTool(project_id="test", thread_id="test", thread_manager=None)
    
    print("Testing image compression functionality...\n")
    
    # Test 1: Large PNG image
    print("Test 1: Large PNG image")
    png_bytes = create_test_image(3000, 2000, 'PNG')
    original_size = len(png_bytes)
    print(f"Original PNG size: {original_size / 1024:.1f}KB")
    
    compressed_bytes, mime_type = tool.compress_image(png_bytes, 'image/png', 'test.png')
    compressed_size = len(compressed_bytes)
    print(f"Compressed size: {compressed_size / 1024:.1f}KB")
    print(f"Compression ratio: {(1 - compressed_size / original_size) * 100:.1f}%")
    print(f"Output MIME type: {mime_type}\n")
    
    # Test 2: JPEG image
    print("Test 2: JPEG image")
    jpeg_bytes = create_test_image(2000, 1500, 'JPEG')
    original_size = len(jpeg_bytes)
    print(f"Original JPEG size: {original_size / 1024:.1f}KB")
    
    compressed_bytes, mime_type = tool.compress_image(jpeg_bytes, 'image/jpeg', 'test.jpg')
    compressed_size = len(compressed_bytes)
    print(f"Compressed size: {compressed_size / 1024:.1f}KB")
    print(f"Compression ratio: {(1 - compressed_size / original_size) * 100:.1f}%")
    print(f"Output MIME type: {mime_type}\n")
    
    # Test 3: Small image (should not be resized)
    print("Test 3: Small image (800x600)")
    small_bytes = create_test_image(800, 600, 'PNG')
    original_size = len(small_bytes)
    print(f"Original size: {original_size / 1024:.1f}KB")
    
    compressed_bytes, mime_type = tool.compress_image(small_bytes, 'image/png', 'small.png')
    compressed_size = len(compressed_bytes)
    print(f"Compressed size: {compressed_size / 1024:.1f}KB")
    print(f"Compression ratio: {(1 - compressed_size / original_size) * 100:.1f}%")
    print(f"Output MIME type: {mime_type}\n")
    
    # Test 4: Verify image quality after compression
    print("Test 4: Verifying image quality")
    # Open the compressed image to check it's valid
    try:
        compressed_img = Image.open(BytesIO(compressed_bytes))
        print(f"Compressed image dimensions: {compressed_img.size}")
        print(f"Compressed image mode: {compressed_img.mode}")
        print("✓ Compressed image is valid and can be opened")
    except Exception as e:
        print(f"✗ Error opening compressed image: {e}")
    
    print("\nAll tests completed!")

if __name__ == "__main__":
    test_compression() 