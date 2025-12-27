"""
Browser profile archive upload and extraction endpoint for Cold Chain Enterprise.
Handles uploading tar.gz archives and extracting them to /workspace/contexts/
"""
import os
import tarfile
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.admin.users_admin import require_any_admin

router = APIRouter(prefix="/admin/browser-profiles", tags=["admin-browser-profiles"])


@router.post("/{user_id}/upload")
async def upload_browser_profile(
    user_id: str,
    profile_type: str = Form(...),  # "arcadia" or "gmail"
    file: UploadFile = File(...),
    admin: dict = Depends(require_any_admin)
):
    """
    Upload and extract browser profile archive (tar.gz) for a user.
    Extracts to /workspace/contexts/{profile_type}_profile/
    
    Args:
        user_id: User ID to upload profile for
        profile_type: "arcadia" or "gmail"
        file: tar.gz archive file
        admin: Admin user (from require_any_admin)
    """
    if profile_type not in ["arcadia", "gmail"]:
        raise HTTPException(status_code=400, detail="profile_type must be 'arcadia' or 'gmail'")
    
    if not file.filename or not file.filename.endswith('.tar.gz'):
        raise HTTPException(status_code=400, detail="File must be a .tar.gz archive")
    
    # Extract to /workspace/contexts/{profile_type}_profile/
    extract_path = Path(f"/workspace/contexts/{profile_type}_profile")
    
    try:
        # Create extract directory if it doesn't exist
        extract_path.mkdir(parents=True, exist_ok=True)
        
        # Read uploaded file content
        content = await file.read()
        
        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tar.gz') as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Extract tar.gz archive
            with tarfile.open(tmp_path, 'r:gz') as tar:
                # Extract all files, preserving directory structure
                tar.extractall(path=extract_path)
            
            logger.info(
                f"Browser profile extracted",
                user_id=user_id,
                profile_type=profile_type,
                extract_path=str(extract_path),
                admin_user_id=admin['user_id']
            )
            
            # Verify extraction - check for Default directory or Cookies file
            default_dir = extract_path / "Default"
            cookies_file = extract_path / "Default" / "Cookies"
            
            if not default_dir.exists() and not cookies_file.exists():
                # Check if files were extracted to a subdirectory
                subdirs = [d for d in extract_path.iterdir() if d.is_dir()]
                if subdirs:
                    logger.info(f"Profile extracted to subdirectory: {subdirs[0]}")
            
            return {
                "status": "success",
                "message": f"Browser profile extracted successfully",
                "profile_type": profile_type,
                "extract_path": str(extract_path),
                "user_id": user_id
            }
            
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except tarfile.TarError as e:
        logger.error(f"Failed to extract tar.gz archive: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid tar.gz archive: {str(e)}")
    except Exception as e:
        logger.error(f"Error uploading browser profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload and extract profile: {str(e)}")


@router.get("/{user_id}/status")
async def get_browser_profile_status(
    user_id: str,
    admin: dict = Depends(require_any_admin)
):
    """
    Check status of browser profiles for a user.
    Returns whether arcadia_profile and gmail_profile exist.
    """
    arcadia_path = Path("/workspace/contexts/arcadia_profile")
    gmail_path = Path("/workspace/contexts/gmail_profile")
    
    def check_profile(path: Path) -> dict:
        """Check if profile exists and has required files"""
        exists = path.exists()
        has_default = (path / "Default").exists()
        has_cookies = (path / "Default" / "Cookies").exists()
        
        return {
            "exists": exists,
            "has_default_dir": has_default,
            "has_cookies": has_cookies,
            "path": str(path)
        }
    
    return {
        "arcadia_profile": check_profile(arcadia_path),
        "gmail_profile": check_profile(gmail_path),
        "user_id": user_id
    }

