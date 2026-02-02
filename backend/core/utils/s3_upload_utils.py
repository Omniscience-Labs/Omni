
import base64
import uuid
import logging
from typing import Optional
from core.services.supabase import DBConnection

logger = logging.getLogger(__name__)

async def upload_base64_image(base64_string: str, bucket_name: str = "customer-request-images") -> Optional[str]:
    """
    Decodes a base64 image string and uploads it to Supabase Storage.
    Returns the public URL of the uploaded file.
    """
    try:
        # Check if string has header (data:image/png;base64,...) and strip it
        if "," in base64_string:
            header, encoded = base64_string.split(",", 1)
        else:
            encoded = base64_string
            
        # Decode base64
        file_data = base64.b64decode(encoded)
        
        # Generate unique filename
        filename = f"{uuid.uuid4()}.png" # Defaulting to png, ideally detect mime type from header
        
        db = DBConnection()
        client = await db.client
        
        # Upload to Supabase Storage
        # Note: using await for upload method as we are using AsyncClient
        res = await client.storage.from_(bucket_name).upload(
            path=filename,
            file=file_data,
            file_options={"content-type": "image/png"}
        )
        
        # Get public URL
        public_url_res = client.storage.from_(bucket_name).get_public_url(filename)
        
        return public_url_res
        
    except Exception as e:
        logger.error(f"Failed to upload base64 image: {e}")
        return None