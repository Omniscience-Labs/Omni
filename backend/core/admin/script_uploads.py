"""
Script folder upload endpoint for Cold Chain Enterprise.
Handles uploading script archives and extracting them to /workspace/
"""
import os
import tarfile
import zipfile
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from typing import Optional
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.admin.users_admin import require_any_admin

router = APIRouter(prefix="/admin/script-uploads", tags=["admin-script-uploads"])


@router.post("/{user_id}/upload")
async def upload_script_folder(
    user_id: str,
    script_type: str = Form(...),  # "sdk" or "scripts"
    file: UploadFile = File(...),
    admin: dict = Depends(require_any_admin)
):
    """
    Upload and extract script folder archive (tar.gz or zip) for a user.
    
    For script_type="sdk": Extracts to /workspace/inbound_mcp/
    For script_type="scripts": Extracts to /workspace/stagehand-test/
    
    Args:
        user_id: User ID to upload scripts for
        script_type: "sdk" or "scripts"
        file: tar.gz or zip archive file
        admin: Admin user (from require_any_admin)
    """
    if script_type not in ["sdk", "scripts"]:
        raise HTTPException(status_code=400, detail="script_type must be 'sdk' or 'scripts'")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    is_tar_gz = file.filename.endswith('.tar.gz') or file.filename.endswith('.tgz')
    is_zip = file.filename.endswith('.zip')
    
    if not (is_tar_gz or is_zip):
        raise HTTPException(status_code=400, detail="File must be a .tar.gz, .tgz, or .zip archive")
    
    # Determine extract path based on script type
    if script_type == "sdk":
        extract_path = Path("/workspace/inbound_mcp")
    else:  # scripts
        extract_path = Path("/workspace/stagehand-test")
    
    try:
        # Create extract directory if it doesn't exist
        extract_path.mkdir(parents=True, exist_ok=True)
        
        # Read uploaded file content
        content = await file.read()
        
        # Write to temporary file
        suffix = '.tar.gz' if is_tar_gz else '.zip'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Extract archive based on type
            if is_tar_gz:
                with tarfile.open(tmp_path, 'r:gz') as tar:
                    # Extract all files, preserving directory structure
                    tar.extractall(path=extract_path)
            else:  # zip
                with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
                    # Extract all files, preserving directory structure
                    zip_ref.extractall(path=extract_path)
            
            logger.info(
                f"Script folder extracted",
                user_id=user_id,
                script_type=script_type,
                extract_path=str(extract_path),
                admin_user_id=admin['user_id']
            )
            
            # Verify extraction - check for common files
            if script_type == "sdk":
                # Check for SDK structure (should have __init__.py or setup.py)
                has_init = any(extract_path.rglob("__init__.py"))
                has_setup = (extract_path / "setup.py").exists()
                if not has_init and not has_setup:
                    logger.warning(f"SDK extraction may be incomplete - no __init__.py or setup.py found")
            else:  # scripts
                # Check for common script files
                has_py_files = any(extract_path.rglob("*.py"))
                if not has_py_files:
                    logger.warning(f"Scripts extraction may be incomplete - no .py files found")
            
            return {
                "status": "success",
                "message": f"Script folder extracted successfully",
                "script_type": script_type,
                "extract_path": str(extract_path),
                "user_id": user_id
            }
            
        finally:
            # Clean up temporary file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except (tarfile.TarError, zipfile.BadZipFile) as e:
        logger.error(f"Failed to extract archive: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid archive: {str(e)}")
    except Exception as e:
        logger.error(f"Error uploading script folder: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload and extract scripts: {str(e)}")


@router.get("/{user_id}/status")
async def get_script_folder_status(
    user_id: str,
    admin: dict = Depends(require_any_admin)
):
    """
    Check status of script folders for a user.
    Returns whether SDK and scripts folders exist and have content.
    """
    sdk_path = Path("/workspace/inbound_mcp")
    scripts_path = Path("/workspace/stagehand-test")
    
    def check_script_folder(path: Path, folder_type: str) -> dict:
        """Check if script folder exists and has required files"""
        exists = path.exists()
        has_py_files = any(path.rglob("*.py")) if exists else False
        
        if folder_type == "sdk":
            has_init = any(path.rglob("__init__.py")) if exists else False
            has_setup = (path / "setup.py").exists() if exists else False
            return {
                "exists": exists,
                "has_python_files": has_py_files,
                "has_init": has_init,
                "has_setup": has_setup,
                "path": str(path)
            }
        else:  # scripts
            return {
                "exists": exists,
                "has_python_files": has_py_files,
                "path": str(path)
            }
    
    return {
        "sdk": check_script_folder(sdk_path, "sdk"),
        "scripts": check_script_folder(scripts_path, "scripts"),
        "user_id": user_id
    }

