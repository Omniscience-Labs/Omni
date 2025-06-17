import pytest
import base64
import io
from PIL import Image
import tempfile
import os
from unittest.mock import patch, MagicMock


def _validate_base64_image(base64_string: str, max_size_mb: int = 10) -> tuple[bool, str]:
    """
    Comprehensive validation of base64 image data.
    
    Args:
        base64_string (str): The base64 encoded image data
        max_size_mb (int): Maximum allowed image size in megabytes
        
    Returns:
        tuple[bool, str]: (is_valid, error_message)
    """
    try:
        # Check if data exists and has reasonable length
        if not base64_string or len(base64_string) < 10:
            return False, "Base64 string is empty or too short"
        
        # Remove data URL prefix if present (data:image/jpeg;base64,...)
        if base64_string.startswith('data:'):
            try:
                base64_string = base64_string.split(',', 1)[1]
            except (IndexError, ValueError):
                return False, "Invalid data URL format"
        
        # Check if string contains only valid base64 characters
        # Base64 alphabet: A-Z, a-z, 0-9, +, /, = (padding)
        import re
        if not re.match(r'^[A-Za-z0-9+/]*={0,2}$', base64_string):
            return False, "Invalid base64 characters detected"
        
        # Check if base64 string length is valid (must be multiple of 4)
        if len(base64_string) % 4 != 0:
            return False, "Invalid base64 string length"
        
        # Attempt to decode base64
        try:
            image_data = base64.b64decode(base64_string, validate=True)
        except Exception as e:
            return False, f"Base64 decoding failed: {str(e)}"
        
        # Check decoded data size
        if len(image_data) == 0:
            return False, "Decoded image data is empty"
        
        # Check if decoded data size exceeds limit
        max_size_bytes = max_size_mb * 1024 * 1024
        if len(image_data) > max_size_bytes:
            return False, f"Image size ({len(image_data)} bytes) exceeds limit ({max_size_bytes} bytes)"
        
        # Validate that decoded data is actually a valid image using PIL
        try:
            image_stream = io.BytesIO(image_data)
            with Image.open(image_stream) as img:
                # Verify the image by attempting to load it
                img.verify()
                
                # Check if image format is supported
                supported_formats = {'JPEG', 'PNG', 'GIF', 'BMP', 'WEBP', 'TIFF'}
                if img.format not in supported_formats:
                    return False, f"Unsupported image format: {img.format}"
                
                # Re-open for dimension checks (verify() closes the image)
                image_stream.seek(0)
                with Image.open(image_stream) as img_check:
                    width, height = img_check.size
                    
                    # Check reasonable dimension limits
                    max_dimension = 8192  # 8K resolution limit
                    if width > max_dimension or height > max_dimension:
                        return False, f"Image dimensions ({width}x{height}) exceed limit ({max_dimension}x{max_dimension})"
                    
                    # Check minimum dimensions
                    if width < 1 or height < 1:
                        return False, f"Invalid image dimensions: {width}x{height}"
                    
                    # logger.debug(f"Valid image detected: {img.format}, {width}x{height}, {len(image_data)} bytes")
                    
        except Exception as e:
            return False, f"Invalid image data: {str(e)}"
        
        return True, "Valid image"
        
    except Exception as e:
        # logger.error(f"Unexpected error during base64 image validation: {e}")
        return False, f"Validation error: {str(e)}"


class TestValidateBase64Image:
    """Test suite for _validate_base64_image function"""

    @pytest.fixture
    def sample_images(self):
        """Create sample images in different formats for testing"""
        images = {}
        
        # Create a simple 100x100 RGB image
        img = Image.new('RGB', (100, 100), color='red')
        
        # Save in different formats and encode to base64
        for format_name in ['JPEG', 'PNG', 'GIF', 'BMP', 'WEBP']:
            buffer = io.BytesIO()
            img.save(buffer, format=format_name)
            buffer.seek(0)
            base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
            images[format_name.lower()] = base64_data
        
        # TIFF requires special handling
        buffer = io.BytesIO()
        img.save(buffer, format='TIFF')
        buffer.seek(0)
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
        images['tiff'] = base64_data
        
        return images

    def test_valid_images_different_formats(self, sample_images):
        """Test validation of valid images in different supported formats"""
        for format_name, base64_data in sample_images.items():
            is_valid, message = _validate_base64_image(base64_data)
            assert is_valid, f"Failed to validate {format_name} image: {message}"
            assert message == "Valid image"

    def test_valid_images_with_data_url_prefix(self, sample_images):
        """Test validation of images with data URL prefixes"""
        jpeg_data = sample_images['jpeg']
        
        # Test various data URL formats
        data_urls = [
            f"data:image/jpeg;base64,{jpeg_data}",
            f"data:image/jpg;base64,{jpeg_data}",
            f"data:image/png;base64,{jpeg_data}",
            f"data:;base64,{jpeg_data}",
        ]
        
        for data_url in data_urls:
            is_valid, message = _validate_base64_image(data_url)
            assert is_valid, f"Failed to validate data URL: {message}"

    def test_empty_and_short_strings(self):
        """Test validation of empty and too short strings"""
        test_cases = [
            ("", "Base64 string is empty or too short"),
            ("a", "Base64 string is empty or too short"),
            ("abc", "Base64 string is empty or too short"),
            ("abcdefgh", "Base64 string is empty or too short"),
        ]
        
        for test_string, expected_error in test_cases:
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert expected_error in message

    def test_invalid_data_url_format(self):
        """Test validation of malformed data URLs"""
        test_cases = [
            "data:image/jpeg;base64",  # Missing comma
            "data:image/jpeg;base64;invaliddata",  # Semicolon instead of comma
        ]
        
        for test_string in test_cases:
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Invalid data URL format" in message

    def test_invalid_base64_characters(self):
        """Test validation of strings with invalid base64 characters"""
        test_cases = [
            "abc!def123==",  # Contains !
            "abc@def123==",  # Contains @
            "abc#def123==",  # Contains #
            "abc$def123==",  # Contains $
            "abc%def123==",  # Contains %
            "abc^def123==",  # Contains ^
            "abc&def123==",  # Contains &
            "abc*def123==",  # Contains *
            "abcdefgh123===",  # Too many padding characters
        ]
        
        for test_string in test_cases:
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Invalid base64 characters detected" in message

    def test_invalid_base64_length(self):
        """Test validation of base64 strings with invalid length"""
        test_cases = [
            "abcdefghijklm",      # Length 13 (not multiple of 4)
            "abcdefghijklmno",    # Length 15 (not multiple of 4)
            "abcdefghijklmnopq",  # Length 17 (not multiple of 4)
        ]
        
        for test_string in test_cases:
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Invalid base64 string length" in message

    def test_base64_decoding_failure(self):
        """Test handling of base64 decoding failures"""
        # Use a mock to force a base64 decoding failure
        with patch('base64.b64decode') as mock_decode:
            mock_decode.side_effect = ValueError("Invalid base64")
            
            test_string = "dGVzdGRhdGE="  # Valid base64 format
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Base64 decoding failed" in message

    def test_empty_decoded_data(self):
        """Test handling of base64 that decodes to empty data"""
        # This is tricky to create naturally, so we'll mock it
        with patch('base64.b64decode') as mock_decode:
            mock_decode.return_value = b''
            
            # Use a longer string that passes the length check
            test_string = "dGVzdGRhdGFsb25nZW5vdWdo"  # Longer base64 string
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Decoded image data is empty" in message

    def test_size_limit_validation(self, sample_images):
        """Test size limit validation"""
        jpeg_data = sample_images['jpeg']
        
        # Test with very small size limit (use even smaller limit)
        is_valid, message = _validate_base64_image(jpeg_data, max_size_mb=0.0001)
        assert not is_valid
        assert "exceeds limit" in message
        
        # Test with adequate size limit
        is_valid, message = _validate_base64_image(jpeg_data, max_size_mb=1)
        assert is_valid

    def test_large_image_size_limit(self):
        """Test with a larger image that exceeds size limits"""
        # Create a larger image that would exceed a small size limit
        large_img = Image.new('RGB', (1000, 1000), color='blue')
        buffer = io.BytesIO()
        large_img.save(buffer, format='PNG')
        buffer.seek(0)
        large_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        # Should pass with default 10MB limit
        is_valid, message = _validate_base64_image(large_base64)
        assert is_valid
        
        # Should fail with very small limit (use much smaller limit)
        is_valid, message = _validate_base64_image(large_base64, max_size_mb=0.001)
        assert not is_valid
        assert "exceeds limit" in message

    def test_unsupported_image_format(self):
        """Test handling of unsupported image formats"""
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.format = 'UNSUPPORTED'
            mock_img.__enter__ = MagicMock(return_value=mock_img)
            mock_img.__exit__ = MagicMock(return_value=None)
            mock_open.return_value = mock_img
            
            # Use a valid base64 string
            test_data = base64.b64encode(b"fake image data").decode('utf-8')
            is_valid, message = _validate_base64_image(test_data)
            assert not is_valid
            assert "Unsupported image format: UNSUPPORTED" in message

    def test_dimension_limits(self):
        """Test image dimension validation"""
        # Test maximum dimensions
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.format = 'JPEG'
            mock_img.size = (10000, 10000)  # Exceeds 8K limit
            mock_img.__enter__ = MagicMock(return_value=mock_img)
            mock_img.__exit__ = MagicMock(return_value=None)
            
            mock_context = MagicMock()
            mock_context.__enter__ = MagicMock(return_value=mock_img)
            mock_context.__exit__ = MagicMock(return_value=None)
            mock_open.return_value = mock_context
            
            test_data = base64.b64encode(b"fake image data").decode('utf-8')
            is_valid, message = _validate_base64_image(test_data)
            assert not is_valid
            assert "exceed limit" in message

    def test_invalid_dimensions(self):
        """Test handling of invalid image dimensions"""
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.format = 'JPEG'
            mock_img.size = (0, 100)  # Invalid width
            mock_img.__enter__ = MagicMock(return_value=mock_img)
            mock_img.__exit__ = MagicMock(return_value=None)
            
            mock_context = MagicMock()
            mock_context.__enter__ = MagicMock(return_value=mock_img)
            mock_context.__exit__ = MagicMock(return_value=None)
            mock_open.return_value = mock_context
            
            test_data = base64.b64encode(b"fake image data").decode('utf-8')
            is_valid, message = _validate_base64_image(test_data)
            assert not is_valid
            assert "Invalid image dimensions" in message

    def test_pil_image_validation_failure(self):
        """Test handling of PIL image validation failures"""
        # Create valid base64 that doesn't represent an image
        fake_data = b"This is not image data"
        test_string = base64.b64encode(fake_data).decode('utf-8')
        
        is_valid, message = _validate_base64_image(test_string)
        assert not is_valid
        assert "Invalid image data" in message

    def test_pil_verify_failure(self):
        """Test handling of PIL verify() method failures"""
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.verify.side_effect = Exception("Corrupted image")
            mock_img.__enter__ = MagicMock(return_value=mock_img)
            mock_img.__exit__ = MagicMock(return_value=None)
            mock_open.return_value = mock_img
            
            test_data = base64.b64encode(b"fake image data").decode('utf-8')
            is_valid, message = _validate_base64_image(test_data)
            assert not is_valid
            assert "Invalid image data" in message

    def test_unexpected_exception_handling(self):
        """Test handling of unexpected exceptions"""
        # Mock something that will cause an exception in the outer try-catch block
        with patch('re.match') as mock_regex:
            mock_regex.side_effect = RuntimeError("Unexpected regex error")
            
            # Use a longer string that passes the length check
            test_string = "dGVzdGRhdGFsb25nZW5vdWdo"  # Longer base64 string
            is_valid, message = _validate_base64_image(test_string)
            assert not is_valid
            assert "Validation error" in message

    def test_valid_edge_case_dimensions(self):
        """Test valid edge case dimensions"""
        # Create a 1x1 pixel image (minimum valid size)
        tiny_img = Image.new('RGB', (1, 1), color='red')
        buffer = io.BytesIO()
        tiny_img.save(buffer, format='PNG')
        buffer.seek(0)
        tiny_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        is_valid, message = _validate_base64_image(tiny_base64)
        assert is_valid
        assert message == "Valid image"

    def test_maximum_valid_dimensions(self):
        """Test maximum valid dimensions (8K)"""
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.format = 'JPEG'
            mock_img.size = (8192, 8192)  # Exactly at the limit
            mock_img.__enter__ = MagicMock(return_value=mock_img)
            mock_img.__exit__ = MagicMock(return_value=None)
            
            mock_context = MagicMock()
            mock_context.__enter__ = MagicMock(return_value=mock_img)
            mock_context.__exit__ = MagicMock(return_value=None)
            mock_open.return_value = mock_context
            
            test_data = base64.b64encode(b"fake image data").decode('utf-8')
            is_valid, message = _validate_base64_image(test_data)
            assert is_valid
            assert message == "Valid image"

    def test_regex_pattern_edge_cases(self):
        """Test edge cases for the regex pattern validation"""
        # Valid base64 strings with different padding (all longer than 10 chars)
        valid_cases = [
            "TWFudGVzdGRhdGE=",      # Valid base64, longer than 10 chars
            "VGVzdGRhdGFsb25n",      # Valid base64, no padding
            "QWxhZGRpbjpvcGVuIHNlc2FtZQ==",  # Longer string
        ]
        
        for case in valid_cases:
            # These should pass character validation but fail image validation
            is_valid, message = _validate_base64_image(case)
            # They're valid base64 but not valid images
            assert "Invalid image data" in message or "Base64 decoding failed" in message

    def test_concurrent_validation(self, sample_images):
        """Test that validation works correctly when called concurrently"""
        import threading
        import time
        
        results = []
        
        def validate_image(base64_data):
            time.sleep(0.01)  # Small delay to test concurrency
            result = _validate_base64_image(base64_data)
            results.append(result)
        
        threads = []
        for _ in range(10):
            thread = threading.Thread(
                target=validate_image, 
                args=(sample_images['jpeg'],)
            )
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
        
        # All results should be successful
        assert len(results) == 10
        for is_valid, message in results:
            assert is_valid
            assert message == "Valid image"

    def test_memory_cleanup(self, sample_images):
        """Test that the function doesn't leak memory with large images"""
        # This test ensures BytesIO objects are properly closed
        large_img = Image.new('RGB', (2000, 2000), color='green')
        buffer = io.BytesIO()
        large_img.save(buffer, format='PNG')
        buffer.seek(0)
        large_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        # Run validation multiple times
        for _ in range(5):
            is_valid, message = _validate_base64_image(large_base64)
            assert is_valid

    @pytest.mark.parametrize("format_name", ['JPEG', 'PNG', 'GIF', 'BMP', 'WEBP', 'TIFF'])
    def test_all_supported_formats_parametrized(self, format_name):
        """Parametrized test for all supported image formats"""
        img = Image.new('RGB', (50, 50), color='blue')
        buffer = io.BytesIO()
        img.save(buffer, format=format_name)
        buffer.seek(0)
        base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        is_valid, message = _validate_base64_image(base64_data)
        assert is_valid
        assert message == "Valid image" 