# SeeImage Tool - Image Compression Feature

## Overview

The SeeImage tool has been enhanced with automatic image compression to reduce the size of images before sending them to the LLM. This helps to:

1. Reduce token usage and costs
2. Improve performance by sending smaller payloads
3. Handle larger images that might otherwise exceed size limits

## Implementation Details

### Compression Algorithm

The compression feature includes:

1. **Automatic Resizing**: Images larger than 1920x1080 pixels are automatically resized while maintaining aspect ratio
2. **Format Optimization**: 
   - PNG images are compressed with optimization level 6
   - JPEG images are compressed with quality level 85
   - Other formats are converted to JPEG for better compression
   - GIF images are preserved to maintain animation
3. **Color Mode Handling**: RGBA images are converted to RGB with a white background for JPEG compatibility

### Configuration

The following constants control the compression behavior:

```python
MAX_IMAGE_SIZE = 10 * 1024 * 1024          # 10MB max for original image
MAX_COMPRESSED_SIZE = 5 * 1024 * 1024      # 5MB max for compressed image
DEFAULT_MAX_WIDTH = 1920                    # Maximum width in pixels
DEFAULT_MAX_HEIGHT = 1080                   # Maximum height in pixels
DEFAULT_JPEG_QUALITY = 85                   # JPEG compression quality (0-100)
DEFAULT_PNG_COMPRESS_LEVEL = 6              # PNG compression level (0-9)
```

### Usage

The tool usage remains the same - no changes are required in how you call the tool:

```xml
<see-image file_path="screenshots/large_image.png"></see-image>
```

The compression happens automatically behind the scenes.

### Output

The tool now provides feedback about the compression:

```
Successfully loaded and compressed the image 'screenshots/large_image.png' (reduced from 2048.5KB to 156.3KB).
```

### Error Handling

- If compression fails, the original image is used
- If the compressed image is still too large (>5MB), an error is returned
- All compression errors are logged but don't prevent the tool from functioning

## Testing

A test script is provided at `backend/test_image_compression.py` to verify the compression functionality:

```bash
cd backend
python test_image_compression.py
```

This script tests:
1. Large PNG compression
2. JPEG compression
3. Small image handling (no resizing)
4. Image validity after compression

## Dependencies

The feature requires the Pillow library, which has been added to:
- `requirements.txt`
- `pyproject.toml`

Install with:
```bash
pip install Pillow>=10.0.0
```

## Performance Impact

- Compression adds minimal latency (typically <100ms for most images)
- Memory usage is temporary and released after compression
- Significant reduction in network payload size (typically 50-90% reduction)

## Future Enhancements

Potential improvements could include:
- Configurable compression settings per project
- Support for WebP format output
- Progressive JPEG encoding
- Smart cropping for very large images
- Caching of compressed images 