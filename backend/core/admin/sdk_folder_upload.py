"""
Unified SDK folder upload endpoint for Cold Chain Enterprise.
Handles uploading a single zip/tar.gz archive containing the entire SDK folder structure:
- inbound_mcp/ (SDK)
- stagehand-test/ (Scripts)
  - contexts/ (Browser profiles)
    - arcadia_profile/
    - gmail_profile/

Extracts to /workspace/omni_inbound_mcp_sdk/ preserving the folder structure.
"""
import os
import tarfile
import zipfile
import tempfile
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from core.utils.logger import logger
from core.admin.users_admin import require_any_admin

router = APIRouter(prefix="/admin/sdk-folder-upload", tags=["admin-sdk-folder-upload"])


@router.post("/{user_id}/upload")
async def upload_sdk_folder(
    user_id: str,
    file: UploadFile = File(...),
    admin: dict = Depends(require_any_admin)
):
    """
    Upload and extract complete SDK folder archive (zip or tar.gz) for a user.
    
    Expected structure in archive:
    omni_inbound_mcp_sdk/
    ├── inbound_mcp/              ← SDK
    └── stagehand-test/           ← Scripts
        └── contexts/            ← Browser profiles
            ├── arcadia_profile/
            └── gmail_profile/
    
    Extracts to: /workspace/omni_inbound_mcp_sdk/
    
    Args:
        user_id: User ID to upload SDK folder for
        file: zip or tar.gz archive file containing the complete folder structure
        admin: Admin user (from require_any_admin)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    # Normalize filename to lowercase for comparison (case-insensitive)
    filename_lower = file.filename.lower()
    is_tar_gz = filename_lower.endswith('.tar.gz') or filename_lower.endswith('.tgz')
    is_zip = filename_lower.endswith('.zip')
    
    if not (is_tar_gz or is_zip):
        raise HTTPException(
            status_code=400, 
            detail=f"File must be a .tar.gz, .tgz, or .zip archive. Received: {file.filename}"
        )
    
    # Extract to /workspace/omni_inbound_mcp_sdk/
    base_extract_path = Path("/workspace/omni_inbound_mcp_sdk")
    
    try:
        # Create base extract directory if it doesn't exist
        base_extract_path.mkdir(parents=True, exist_ok=True)
        
        # Read uploaded file content
        content = await file.read()
        
        # Write to temporary file
        suffix = '.tar.gz' if is_tar_gz else '.zip'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Create temporary extraction directory
            with tempfile.TemporaryDirectory() as temp_extract_dir:
                temp_extract_path = Path(temp_extract_dir)
                
                # Extract archive to temporary location first
                if is_tar_gz:
                    with tarfile.open(tmp_path, 'r:gz') as tar:
                        tar.extractall(path=temp_extract_path)
                else:  # zip
                    with zipfile.ZipFile(tmp_path, 'r') as zip_ref:
                        zip_ref.extractall(path=temp_extract_path)
                
                # Find the root folder (could be omni_inbound_mcp_sdk or just the contents)
                extracted_items = list(temp_extract_path.iterdir())
                
                if len(extracted_items) == 1 and extracted_items[0].is_dir():
                    # Archive contains a single root folder
                    root_folder = extracted_items[0]
                    # Check if it's the expected structure
                    if (root_folder / "inbound_mcp").exists() and (root_folder / "stagehand-test").exists():
                        # Move the entire folder to workspace
                        final_path = base_extract_path / root_folder.name
                        if final_path.exists():
                            shutil.rmtree(final_path)
                        shutil.move(str(root_folder), str(final_path))
                        extract_path = final_path
                    else:
                        # Root folder doesn't match expected structure, move contents
                        extract_path = base_extract_path
                        for item in root_folder.iterdir():
                            dest = extract_path / item.name
                            if dest.exists():
                                if dest.is_dir():
                                    shutil.rmtree(dest)
                                else:
                                    dest.unlink()
                            shutil.move(str(item), str(dest))
                else:
                    # Archive contains multiple items or files at root
                    # Check if inbound_mcp and stagehand-test are at root level
                    has_inbound_mcp = any(item.name == "inbound_mcp" and item.is_dir() for item in extracted_items)
                    has_stagehand_test = any(item.name == "stagehand-test" and item.is_dir() for item in extracted_items)
                    
                    if has_inbound_mcp and has_stagehand_test:
                        # Move items directly to workspace
                        extract_path = base_extract_path
                        for item in extracted_items:
                            dest = extract_path / item.name
                            if dest.exists():
                                if dest.is_dir():
                                    shutil.rmtree(dest)
                                else:
                                    dest.unlink()
                            shutil.move(str(item), str(dest))
                    else:
                        # Unexpected structure, extract everything to workspace
                        extract_path = base_extract_path
                        for item in extracted_items:
                            dest = extract_path / item.name
                            if dest.exists():
                                if dest.is_dir():
                                    shutil.rmtree(dest)
                                else:
                                    dest.unlink()
                            shutil.move(str(item), str(dest))
                
                # Verify extraction - check for expected structure
                inbound_mcp_path = extract_path / "inbound_mcp"
                stagehand_test_path = extract_path / "stagehand-test"
                contexts_path = stagehand_test_path / "contexts" if stagehand_test_path.exists() else None
                
                has_sdk = inbound_mcp_path.exists() and any(inbound_mcp_path.rglob("__init__.py"))
                has_scripts = stagehand_test_path.exists() and any(stagehand_test_path.rglob("*.py"))
                has_contexts = contexts_path.exists() if contexts_path else False
                
                logger.info(
                    f"SDK folder extracted",
                    user_id=user_id,
                    extract_path=str(extract_path),
                    has_sdk=has_sdk,
                    has_scripts=has_scripts,
                    has_contexts=has_contexts,
                    admin_user_id=admin['user_id']
                )
                
                if not has_sdk:
                    logger.warning(f"SDK extraction may be incomplete - inbound_mcp folder not found or missing __init__.py")
                if not has_scripts:
                    logger.warning(f"Scripts extraction may be incomplete - stagehand-test folder not found or missing .py files")
                if not has_contexts:
                    logger.warning(f"Browser profiles context folder not found - expected at {extract_path}/stagehand-test/contexts/")
                
                return {
                    "status": "success",
                    "message": f"SDK folder extracted successfully",
                    "extract_path": str(extract_path),
                    "sdk_path": str(inbound_mcp_path) if inbound_mcp_path.exists() else None,
                    "scripts_path": str(stagehand_test_path) if stagehand_test_path.exists() else None,
                    "contexts_path": str(contexts_path) if contexts_path and contexts_path.exists() else None,
                    "has_sdk": has_sdk,
                    "has_scripts": has_scripts,
                    "has_contexts": has_contexts,
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
        logger.error(f"Error uploading SDK folder: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload and extract SDK folder: {str(e)}")


@router.get("/{user_id}/status")
async def get_sdk_folder_status(
    user_id: str,
    admin: dict = Depends(require_any_admin)
):
    """
    Check status of SDK folder for a user.
    Returns whether the SDK folder structure exists and has required content.
    """
    base_path = Path("/workspace/omni_inbound_mcp_sdk")
    inbound_mcp_path = base_path / "inbound_mcp"
    stagehand_test_path = base_path / "stagehand-test"
    contexts_path = stagehand_test_path / "contexts" if stagehand_test_path.exists() else None
    
    def check_folder(path: Path, folder_type: str) -> dict:
        """Check if folder exists and has required files"""
        if not path.exists():
            return {
                "exists": False,
                "path": str(path)
            }
        
        if folder_type == "sdk":
            has_init = any(path.rglob("__init__.py"))
            has_setup = (path / "setup.py").exists()
            has_py_files = any(path.rglob("*.py"))
            return {
                "exists": True,
                "has_python_files": has_py_files,
                "has_init": has_init,
                "has_setup": has_setup,
                "path": str(path)
            }
        elif folder_type == "scripts":
            has_py_files = any(path.rglob("*.py"))
            return {
                "exists": True,
                "has_python_files": has_py_files,
                "path": str(path)
            }
        elif folder_type == "contexts":
            arcadia_profile = path / "arcadia_profile"
            gmail_profile = path / "gmail_profile"
            return {
                "exists": True,
                "has_arcadia_profile": arcadia_profile.exists(),
                "has_gmail_profile": gmail_profile.exists(),
                "arcadia_profile_path": str(arcadia_profile) if arcadia_profile.exists() else None,
                "gmail_profile_path": str(gmail_profile) if gmail_profile.exists() else None,
                "path": str(path)
            }
        else:
            return {
                "exists": True,
                "path": str(path)
            }
    
    return {
        "base_path": str(base_path),
        "sdk": check_folder(inbound_mcp_path, "sdk"),
        "scripts": check_folder(stagehand_test_path, "scripts"),
        "contexts": check_folder(contexts_path, "contexts") if contexts_path else {"exists": False, "path": str(contexts_path) if contexts_path else None},
        "user_id": user_id
    }

