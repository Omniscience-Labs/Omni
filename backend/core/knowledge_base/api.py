from typing import List, Optional
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel, Field, HttpUrl, field_validator, validator
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, verify_and_get_agent_authorization, require_agent_access, AuthorizedAgentAccess
from core.services.supabase import DBConnection
from .file_processor import FileProcessor
from core.utils.logger import logger
from .validation import FileNameValidator, ValidationError, validate_folder_name_unique, validate_file_name_unique_in_folder

# Constants
MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024  # 50MB total limit per user

# Constants
MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024  # 50MB total limit per user
ENTRY_TYPE_FILE = 'file'
ENTRY_TYPE_CLOUD_KB = 'cloud_kb'

db = DBConnection()

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])

# Helper function to validate UUID
def validate_uuid(uuid_string: str, field_name: str = "ID") -> str:
    """Validate that a string is a valid UUID format."""
    try:
        UUID(uuid_string)
        return uuid_string
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} format")

# LlamaCloud Knowledge Base Models
class LlamaCloudKnowledgeBase(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255, description="Tool function name (auto-formatted)")
    index_name: str = Field(..., min_length=1, max_length=255, description="LlamaCloud index identifier")
    description: Optional[str] = Field(None, description="What this knowledge base contains")
    is_active: bool = True

class LlamaCloudKnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    index_name: str
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str

class LlamaCloudKnowledgeBaseListResponse(BaseModel):
    knowledge_bases: List[LlamaCloudKnowledgeBaseResponse]
    total_count: int

class CreateLlamaCloudKnowledgeBaseRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tool function name")
    index_name: str = Field(..., min_length=1, max_length=255, description="LlamaCloud index identifier")
    description: Optional[str] = Field(None, description="What this knowledge base contains")

class UpdateLlamaCloudKnowledgeBaseRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    index_name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    is_active: Optional[bool] = None

# Unified Knowledge Base Models
class UnifiedKnowledgeBaseEntry(BaseModel):
    id: str
    name: str
    description: Optional[str]
    type: str  # 'regular' or 'llamacloud'
    is_active: bool
    created_at: str
    updated_at: str
    
    # Fields for regular KB entries
    entry_id: Optional[str] = None
    content: Optional[str] = None
    usage_context: Optional[str] = None
    content_tokens: Optional[int] = None
    source_type: Optional[str] = None
    source_metadata: Optional[dict] = None
    file_size: Optional[int] = None
    file_mime_type: Optional[str] = None
    
    # Fields for LlamaCloud KB entries
    index_name: Optional[str] = None

# Global LlamaCloud Knowledge Base Models
class GlobalLlamaCloudKnowledgeBase(BaseModel):
    kb_id: str
    name: str
    index_name: str
    description: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str

class GlobalLlamaCloudKnowledgeBaseListResponse(BaseModel):
    knowledge_bases: List[GlobalLlamaCloudKnowledgeBase]
    total_count: int

class CreateGlobalLlamaCloudKnowledgeBaseRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Knowledge base name")
    index_name: str = Field(..., min_length=1, max_length=255, description="LlamaCloud index identifier")
    description: Optional[str] = Field(None, description="What this knowledge base contains")

# Note: UnifiedKnowledgeBaseListResponse moved after KnowledgeBaseEntryResponse definition

def format_knowledge_base_name(name: str) -> str:
    """Format knowledge base name for tool function generation."""
    return (name.lower()
            .replace(' ', '-')
            .replace('_', '-')
            .strip('-')
            .replace('--', '-'))
# Helper function to check total file size limit
async def check_total_file_size_limit(account_id: str, new_file_size: int):
    """Check if adding a new file would exceed the total file size limit."""
    try:
        client = await DBConnection().client
        
        # Get total size of all current entries for this account
        result = await client.table('knowledge_base_entries').select(
            'file_size'
        ).eq('account_id', account_id).eq('is_active', True).execute()
        
        current_total_size = sum(entry['file_size'] for entry in result.data)
        new_total_size = current_total_size + new_file_size
        
        if new_total_size > MAX_TOTAL_FILE_SIZE:
            current_mb = current_total_size / (1024 * 1024)
            new_mb = new_file_size / (1024 * 1024)
            limit_mb = MAX_TOTAL_FILE_SIZE / (1024 * 1024)
            
            raise HTTPException(
                status_code=413,
                detail=f"File size limit exceeded. Current total: {current_mb:.1f}MB, New file: {new_mb:.1f}MB, Limit: {limit_mb}MB"
            )
            
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking file size limit: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check file size limit")

# Folder management
class CreateFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class FolderResponse(BaseModel):
    folder_id: str
    name: str
    description: Optional[str]
    entry_count: int
    created_at: str

async def get_user_account_id(client, user_id: str) -> str:
    """Get account_id for a user from the account_user table"""
    account_user_result = await client.schema('basejump').from_('account_user').select('account_id').eq('user_id', user_id).execute()
    
    if not account_user_result.data or len(account_user_result.data) == 0:
        raise HTTPException(status_code=404, detail="User account not found")
    
    return account_user_result.data[0]['account_id']


@router.get("/folders", response_model=List[FolderResponse])
async def get_folders(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all folders for the current user with correct entry counts (files + cloud KBs)"""
    try:
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        # Get folders for this account
        result = await client.from_("knowledge_base_folders").select("*").eq("account_id", account_id).order("created_at", desc=True).execute()
        
        folders = []
        for folder in result.data:
            # Get correct entry count using SQL function (includes both files and cloud KBs)
            count_result = await client.rpc(
                'get_folder_entry_count',
                {
                    'p_folder_id': folder["folder_id"],
                    'p_account_id': account_id
                }
            ).execute()
            
            entry_count = count_result.data if count_result.data is not None else 0
            
            folders.append(FolderResponse(
                folder_id=folder["folder_id"],
                name=folder["name"],
                description=folder.get("description"),
                entry_count=entry_count,
                created_at=folder["created_at"]
            ))
        
        return folders
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folders for account {account_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve folders")

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    request: CreateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Create a new folder"""
    try:
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        # Create folder
        result = await client.from_("knowledge_base_folders").insert({
            "name": request.name,
            "description": request.description,
            "account_id": account_id
        }).execute()
        
        if result.data:
            folder = result.data[0]
            return FolderResponse(
                folder_id=folder["folder_id"],
                name=folder["name"],
                description=folder.get("description"),
                entry_count=0,
                created_at=folder["created_at"]
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create folder")

class UpdateFolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    request: UpdateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update/rename a folder"""
    try:
        client = await db.client
        
        # Verify folder access
        folder_result = await client.from_("knowledge_base_folders").select("account_id").eq("folder_id", folder_id).single().execute()
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Get current account_id from user
        user_account_id = await get_user_account_id(client, user_id)
        if user_account_id != folder_result.data["account_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update folder
        result = await client.from_("knowledge_base_folders").update({
            "name": request.name,
            "description": request.description
        }).eq("folder_id", folder_id).select().execute()
        
        if result.data:
            folder = result.data[0]
            return FolderResponse(
                folder_id=folder["folder_id"],
                name=folder["name"],
                description=folder.get("description"),
                entry_count=folder.get("entry_count", 0),
                created_at=folder["created_at"]
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to update folder")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update folder")

# =============================================================================
# GLOBAL LLAMACLOUD KNOWLEDGE BASE ENDPOINTS
# =============================================================================

@router.get("/llamacloud", response_model=GlobalLlamaCloudKnowledgeBaseListResponse)
async def get_global_llamacloud_knowledge_bases(
    include_inactive: bool = False,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all global LlamaCloud knowledge bases for the current user's account"""
    try:
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        result = await client.rpc('get_global_llamacloud_knowledge_bases', {
            'p_account_id': account_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        knowledge_bases = []
        
        for kb_data in result.data or []:
            kb = GlobalLlamaCloudKnowledgeBase(
                kb_id=kb_data['kb_id'],
                name=kb_data['name'],
                index_name=kb_data['index_name'],
                description=kb_data['description'],
                is_active=kb_data['is_active'],
                created_at=kb_data['created_at'],
                updated_at=kb_data['updated_at']
            )
            knowledge_bases.append(kb)
        
        return GlobalLlamaCloudKnowledgeBaseListResponse(
            knowledge_bases=knowledge_bases,
            total_count=len(knowledge_bases)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting global LlamaCloud knowledge bases: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve global LlamaCloud knowledge bases")

@router.post("/llamacloud", response_model=GlobalLlamaCloudKnowledgeBase)
async def create_global_llamacloud_knowledge_base(
    kb_data: CreateGlobalLlamaCloudKnowledgeBaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Create a new global LlamaCloud knowledge base"""
    try:
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        insert_data = {
            'account_id': account_id,
            'name': kb_data.name,
            'index_name': kb_data.index_name,
            'description': kb_data.description,
            'folder_id': None,  # Explicitly set to None for root level
            'is_active': True   # Explicitly set to True
        }
        
        result = await client.table('llamacloud_knowledge_bases').insert(insert_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create LlamaCloud knowledge base")
        
        created_kb = result.data[0]
        
        logger.info(f"Created global LlamaCloud knowledge base {created_kb['kb_id']}")
        
        return GlobalLlamaCloudKnowledgeBase(
            kb_id=created_kb['kb_id'],
            name=created_kb['name'],
            index_name=created_kb['index_name'],
            description=created_kb['description'],
            is_active=created_kb['is_active'],
            created_at=created_kb['created_at'],
            updated_at=created_kb['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating global LlamaCloud knowledge base: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create global LlamaCloud knowledge base")

# Move LlamaCloud knowledge base to folder
class CloudKBMoveRequest(BaseModel):
    folder_id: Optional[str] = None  # None means move to root level
    
    @field_validator('folder_id')
    @classmethod
    def validate_folder_id(cls, v):
        if v is not None:
            try:
                UUID(v)
            except (ValueError, AttributeError):
                raise ValueError('Invalid folder_id format')
        return v

@router.put("/llamacloud/{kb_id}/move")
async def move_llamacloud_kb_to_folder(
    kb_id: str,
    request: CloudKBMoveRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Move a LlamaCloud knowledge base to a folder or root level."""
    try:
        # Validate UUID format
        validate_uuid(kb_id, "kb_id")
        
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        # Verify the LlamaCloud KB belongs to the user
        kb_result = await client.table('llamacloud_knowledge_bases').select(
            'kb_id, account_id, folder_id, name'
        ).eq('kb_id', kb_id).execute()
        
        if not kb_result.data:
            raise HTTPException(status_code=404, detail="LlamaCloud knowledge base not found")
        
        kb = kb_result.data[0]
        if kb['account_id'] != account_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # If folder_id is provided, verify it belongs to the user
        if request.folder_id:
            folder_result = await client.table('knowledge_base_folders').select(
                'folder_id, account_id'
            ).eq('folder_id', request.folder_id).eq('account_id', account_id).execute()
            
            if not folder_result.data:
                raise HTTPException(status_code=404, detail="Target folder not found")
        
        # Check if already in target location
        current_folder_id = kb.get('folder_id')
        if current_folder_id == request.folder_id:
            return {"success": True, "message": "Knowledge base is already in the target location"}
        
        # Update the folder_id with proper timestamp
        update_result = await client.table('llamacloud_knowledge_bases').update({
            'folder_id': request.folder_id,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('kb_id', kb_id).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to move knowledge base")
        
        location = f"folder" if request.folder_id else "root level"
        logger.info(f"Moved cloud KB '{kb['name']}' ({kb_id}) to {location} for account {account_id}")
        
        return {
            "success": True, 
            "message": f"LlamaCloud knowledge base moved to {location} successfully",
            "kb_id": kb_id,
            "folder_id": request.folder_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving LlamaCloud knowledge base {kb_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to move LlamaCloud knowledge base: {str(e)}")

@router.get("/folders/{folder_id}/entries")
async def get_folder_entries(
    folder_id: str,
    include_inactive: bool = False,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all entries in a folder (both regular files and cloud knowledge bases)"""
    try:
        # Validate UUID format
        validate_uuid(folder_id, "folder_id")
        
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        # Verify folder belongs to account
        folder_check = await client.from_('knowledge_base_folders').select('folder_id').eq(
            'folder_id', folder_id
        ).eq('account_id', account_id).execute()
        
        if not folder_check.data:
            raise HTTPException(status_code=404, detail="Folder not found or access denied")
        
        # Fetch regular file entries from knowledge_base_entries table
        files_query = client.from_('knowledge_base_entries').select(
            'entry_id, filename, summary, usage_context, is_active, created_at, updated_at, file_size, mime_type, account_id, folder_id'
        ).eq('folder_id', folder_id).eq('account_id', account_id)
        
        if not include_inactive:
            files_query = files_query.eq('is_active', True)
        
        files_result = await files_query.order('created_at', desc=True).execute()
        
        # Fetch cloud KB entries from llamacloud_knowledge_bases table
        cloud_query = client.from_('llamacloud_knowledge_bases').select(
            'kb_id, name, description, summary, index_name, usage_context, is_active, created_at, updated_at, account_id, folder_id'
        ).eq('folder_id', folder_id).eq('account_id', account_id)
        
        if not include_inactive:
            cloud_query = cloud_query.eq('is_active', True)
        
        cloud_result = await cloud_query.order('created_at', desc=True).execute()
        
        # Transform and merge entries into unified format
        entries = []
        
        # Add file entries
        for file_entry in (files_result.data or []):
            entries.append({
                'entry_id': file_entry['entry_id'],
                'entry_type': 'file',
                'name': file_entry['filename'],
                'filename': file_entry['filename'],
                'summary': file_entry.get('summary'),
                'description': None,
                'usage_context': file_entry.get('usage_context'),
                'is_active': file_entry.get('is_active', True),
                'created_at': file_entry['created_at'],
                'updated_at': file_entry['updated_at'],
                'file_size': file_entry.get('file_size'),
                'mime_type': file_entry.get('mime_type'),
                'index_name': None,
                'account_id': file_entry['account_id'],
                'folder_id': file_entry['folder_id']
            })
        
        # Add cloud KB entries
        for cloud_entry in (cloud_result.data or []):
            entries.append({
                'entry_id': cloud_entry['kb_id'],
                'entry_type': 'cloud_kb',
                'name': cloud_entry['name'],
                'filename': None,
                'summary': cloud_entry.get('summary') or cloud_entry.get('description'),
                'description': cloud_entry.get('description'),
                'usage_context': cloud_entry.get('usage_context'),
                'is_active': cloud_entry.get('is_active', True),
                'created_at': cloud_entry['created_at'],
                'updated_at': cloud_entry['updated_at'],
                'file_size': None,
                'mime_type': None,
                'index_name': cloud_entry.get('index_name'),
                'account_id': cloud_entry['account_id'],
                'folder_id': cloud_entry['folder_id']
            })
        
        # Sort by created_at descending
        entries.sort(key=lambda x: x['created_at'], reverse=True)
        
        return {"entries": entries}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder entries for folder {folder_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve folder entries")

# Get cloud knowledge bases at root level (not in any folder)
@router.get("/llamacloud/root")
async def get_root_cloud_knowledge_bases(
    include_inactive: bool = False,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get cloud knowledge bases at root level (not in any folder)"""
    account_id = None
    try:
        logger.info(f"Starting fetch of root cloud KBs for user {user_id}")
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        logger.info(f"Got account_id: {account_id}")
        
        # Query llamacloud_knowledge_bases table directly for root-level entries
        query = client.table('llamacloud_knowledge_bases').select('*').eq('account_id', account_id).is_('folder_id', 'null')
        
        if not include_inactive:
            query = query.eq('is_active', True)
        
        result = await query.order('created_at', desc=True).execute()

        # Log successful query result (Supabase doesn't have result.error attribute)
        logger.info(f"Query result: count={len(result.data) if result.data else 0}")

        cloud_kbs = result.data if result.data else []
        
        # Transform to match the unified entry format expected by frontend
        entries = []
        for kb in cloud_kbs:
            entry = {
                'entry_id': kb['kb_id'],
                'entry_type': 'cloud_kb',
                'name': kb['name'],
                'summary': kb.get('summary') or kb.get('description'),
                'description': kb.get('description'),
                'usage_context': kb.get('usage_context', 'always'),
                'is_active': kb.get('is_active', True),
                'created_at': kb['created_at'],
                'updated_at': kb['updated_at'],
                'filename': None,
                'file_size': None,
                'mime_type': None,
                'index_name': kb['index_name'],
                'account_id': kb['account_id'],
                'folder_id': kb.get('folder_id'),
            }
            entries.append(entry)
        
        logger.info(f"Successfully returning {len(entries)} cloud knowledge bases for account {account_id}")
        
        return {"entries": entries}
        
    except HTTPException:
        raise
    except Exception as e:
        # Use safe logging without exc_info to avoid structlog serialization issues
        error_msg = f"Error getting root cloud knowledge bases: {str(e)}"
        if account_id:
            error_msg = f"Error getting root cloud knowledge bases for account {account_id}: {str(e)}"
        logger.error(error_msg)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve root cloud knowledge bases: {str(e)}")

class KnowledgeBaseEntry(BaseModel):
    entry_id: Optional[str] = None
    entry_type: Optional[str] = None

# Models
class FolderRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    
    @validator('name')
    def validate_folder_name(cls, v):
        is_valid, error_message = FileNameValidator.validate_name(v, "folder")
        if not is_valid:
            raise ValueError(error_message)
        return FileNameValidator.sanitize_name(v)

class KnowledgeBaseEntryResponse(BaseModel):
    entry_id: str
    name: str
    description: Optional[str]
    content: str
    usage_context: str
    is_active: bool
    content_tokens: Optional[int]
    created_at: str
    updated_at: str
    source_type: Optional[str] = None
    source_metadata: Optional[dict] = None
    file_size: Optional[int] = None
    file_mime_type: Optional[str] = None

class UnifiedKnowledgeBaseListResponse(BaseModel):
    regular_entries: List[KnowledgeBaseEntryResponse]
    llamacloud_entries: List[LlamaCloudKnowledgeBaseResponse]
    total_regular_count: int
    total_llamacloud_count: int
    total_tokens: Optional[int] = None

class KnowledgeBaseListResponse(BaseModel):
    entries: List[KnowledgeBaseEntryResponse]
    total_count: int
    total_tokens: int

class CreateKnowledgeBaseEntryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    content: str = Field(..., min_length=1)
    usage_context: str = Field(default="always", pattern="^(always|on_request|contextual)$")

class UpdateKnowledgeBaseEntryRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    usage_context: Optional[str] = None
    is_active: Optional[bool] = None

class UpdateFolderRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    
    @validator('name')
    def validate_folder_name(cls, v):
        if v is not None:
            is_valid, error_message = FileNameValidator.validate_name(v, "folder")
            if not is_valid:
                raise ValueError(error_message)
            return FileNameValidator.sanitize_name(v)
        return v

class FolderResponse(BaseModel):
    folder_id: str
    name: str
    description: Optional[str]
    entry_count: int
    created_at: str

class EntryResponse(BaseModel):
    entry_id: str
    filename: str
    summary: str
    file_size: int
    created_at: str

class UpdateEntryRequest(BaseModel):
    summary: str = Field(..., min_length=1, max_length=1000)

class AgentAssignmentRequest(BaseModel):
    folder_ids: List[str]

db = DBConnection()
file_processor = FileProcessor()

@router.get("/agents/{agent_id}/unified", response_model=UnifiedKnowledgeBaseListResponse)
async def get_agent_unified_knowledge_base(
    agent_id: str,
    include_inactive: bool = False,
    auth: AuthorizedAgentAccess = Depends(require_agent_access)
):
    """Get all knowledge base entries (both regular and LlamaCloud) for an agent in a unified response"""
    try:
        client = await db.client
        user_id = auth.user_id
        agent_data = auth.agent_data
        
        # Get assigned entries for this agent from the new schema
        assignment_result = await client.from_('agent_knowledge_entry_assignments').select('entry_id').eq('agent_id', agent_id).eq('enabled', True).execute()
        
        regular_entries = []
        total_tokens = 0
        
        # Get entry details for each assigned entry
        for assignment in assignment_result.data or []:
            entry_result = await client.from_('knowledge_base_entries').select('''
                entry_id,
                filename,
                summary,
                usage_context,
                is_active,
                file_size,
                mime_type,
                created_at,
                updated_at
            ''').eq('entry_id', assignment['entry_id']).single().execute()
            
            if entry_result.data:
                entry_data = entry_result.data
                # Estimate tokens from summary length
                estimated_tokens = len(entry_data.get('summary', '')) // 4
                
                entry = KnowledgeBaseEntryResponse(
                    entry_id=entry_data['entry_id'],
                    name=entry_data['filename'],
                    description=entry_data['summary'],
                    content=entry_data['summary'],  # Use summary as content for now
                    usage_context=entry_data.get('usage_context', 'always'),
                    is_active=entry_data['is_active'],
                    content_tokens=estimated_tokens,
                    created_at=entry_data['created_at'],
                    updated_at=entry_data.get('updated_at', entry_data['created_at']),
                    source_type='file',
                    source_metadata={'filename': entry_data['filename']},
                    file_size=entry_data.get('file_size'),
                    file_mime_type=entry_data.get('mime_type')
                )
                regular_entries.append(entry)
                total_tokens += estimated_tokens
        
        # Get LlamaCloud knowledge base entries using the assignment system
        # This ensures agents can ONLY access KBs explicitly assigned to them
        llamacloud_result = await client.rpc('get_agent_assigned_llamacloud_kbs', {
            'p_agent_id': agent_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        llamacloud_entries = []
        
        for kb_data in llamacloud_result.data or []:
            kb = LlamaCloudKnowledgeBaseResponse(
                id=kb_data['kb_id'],  # get_agent_assigned_llamacloud_kbs returns 'kb_id' not 'id'
                name=kb_data['name'],
                index_name=kb_data['index_name'],
                description=kb_data['description'],
                is_active=kb_data['is_active'],
                created_at=kb_data['created_at'],
                updated_at=kb_data['updated_at']
            )
            llamacloud_entries.append(kb)
        
        return UnifiedKnowledgeBaseListResponse(
            regular_entries=regular_entries,
            llamacloud_entries=llamacloud_entries,
            total_regular_count=len(regular_entries),
            total_llamacloud_count=len(llamacloud_entries),
            total_tokens=total_tokens
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unified knowledge base for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve unified agent knowledge base")

@router.get("/agents/{agent_id}", response_model=KnowledgeBaseListResponse)
async def get_agent_knowledge_base(
    agent_id: str,
    include_inactive: bool = False,
    auth: AuthorizedAgentAccess = Depends(require_agent_access)
):
    
    """Get all knowledge base entries for an agent"""
    try:
        client = await db.client
        user_id = auth.user_id        # Already authenticated and authorized!
        agent_data = auth.agent_data  # Agent data already fetched during authorization

        # No need for manual authorization - it's already done in the dependency!

        # Get assigned entries for this agent from the new schema
        assignment_result = await client.from_('agent_knowledge_entry_assignments').select('entry_id').eq('agent_id', agent_id).eq('enabled', True).execute()
        
        entries = []
        total_tokens = 0
        
        # Get entry details for each assigned entry
        for assignment in assignment_result.data or []:
            entry_result = await client.from_('knowledge_base_entries').select('''
                entry_id,
                filename,
                summary,
                usage_context,
                is_active,
                file_size,
                mime_type,
                created_at,
                updated_at
            ''').eq('entry_id', assignment['entry_id']).single().execute()
            
            if entry_result.data:
                entry_data = entry_result.data
                # Estimate tokens from summary length
                estimated_tokens = len(entry_data.get('summary', '')) // 4
                
                entry = KnowledgeBaseEntryResponse(
                    entry_id=entry_data['entry_id'],
                    name=entry_data['filename'],
                    description=entry_data['summary'],
                    content=entry_data['summary'],  # Use summary as content for now
                    usage_context=entry_data.get('usage_context', 'always'),
                    is_active=entry_data['is_active'],
                    content_tokens=estimated_tokens,
                    created_at=entry_data['created_at'],
                    updated_at=entry_data.get('updated_at', entry_data['created_at']),
                    source_type='file',
                    source_metadata={'filename': entry_data['filename']},
                    file_size=entry_data.get('file_size'),
                    file_mime_type=entry_data.get('mime_type')
                )
                entries.append(entry)
                total_tokens += estimated_tokens
        
        return KnowledgeBaseListResponse(
            entries=entries,
            total_count=len(entries),
            total_tokens=total_tokens
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting agent knowledge base for {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent knowledge base")

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder_data: FolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Create a new knowledge base folder."""
    try:
        client = await db.client
        account_id = user_id
        
        # Get existing folder names to check for conflicts
        existing_result = await client.table('knowledge_base_folders').select('name').eq('account_id', account_id).execute()
        existing_names = [folder['name'] for folder in existing_result.data]
        
        # Generate unique name if there's a conflict
        final_name = FileNameValidator.generate_unique_name(folder_data.name, existing_names, "folder")
        
        insert_data = {
            'account_id': account_id,
            'name': final_name,
            'description': folder_data.description
        }
        
        result = await client.table('knowledge_base_folders').insert(insert_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create folder")
        
        created_folder = result.data[0]
        
        return FolderResponse(
            folder_id=created_folder['folder_id'],
            name=created_folder['name'],
            description=created_folder['description'],
            entry_count=0,
            created_at=created_folder['created_at']
        )
        
    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create folder")

@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    folder_data: UpdateFolderRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update a knowledge base folder."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify ownership and get current folder
        folder_result = await client.table('knowledge_base_folders').select(
            'folder_id, name, description, created_at'
        ).eq('folder_id', folder_id).eq('account_id', account_id).execute()
        
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        current_folder = folder_result.data[0]
        
        # Build update data with only provided fields
        update_data = {}
        if folder_data.name is not None:
            # Validate name uniqueness (excluding current folder)
            await validate_folder_name_unique(folder_data.name, account_id, folder_id)
            update_data['name'] = folder_data.name
        if folder_data.description is not None:
            update_data['description'] = folder_data.description
            
        # If no fields to update, return current folder
        if not update_data:
            # Count entries in folder
            count_result = await client.table('knowledge_base_entries').select(
                'entry_id', count='exact'
            ).eq('folder_id', folder_id).execute()
            
            return FolderResponse(
                folder_id=current_folder['folder_id'],
                name=current_folder['name'],
                description=current_folder['description'],
                entry_count=count_result.count or 0,
                created_at=current_folder['created_at']
            )
        
        # Update folder
        result = await client.table('knowledge_base_folders').update(
            update_data
        ).eq('folder_id', folder_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update folder")
        
        updated_folder = result.data[0]
        
        # Count entries in folder
        count_result = await client.table('knowledge_base_entries').select(
            'entry_id', count='exact'
        ).eq('folder_id', folder_id).execute()
        
        return FolderResponse(
            folder_id=updated_folder['folder_id'],
            name=updated_folder['name'],
            description=updated_folder['description'],
            entry_count=count_result.count or 0,
            created_at=updated_folder['created_at']
        )
        
    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update folder")

@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Delete a knowledge base folder and all its entries."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify ownership
        folder_result = await client.table('knowledge_base_folders').select(
            'folder_id'
        ).eq('folder_id', folder_id).eq('account_id', account_id).execute()
        
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Get all entries in the folder to delete their files from S3
        entries_result = await client.table('knowledge_base_entries').select(
            'entry_id, file_path'
        ).eq('folder_id', folder_id).execute()
        
        # Delete all files from S3 storage
        if entries_result.data:
            file_paths = [entry['file_path'] for entry in entries_result.data]
            try:
                await client.storage.from_('file-uploads').remove(file_paths)
                logger.info(f"Deleted {len(file_paths)} files from S3 for folder {folder_id}")
            except Exception as e:
                logger.warning(f"Failed to delete some files from S3: {str(e)}")
        
        # Delete folder (cascade will handle entries and assignments in DB)
        await client.table('knowledge_base_folders').delete().eq('folder_id', folder_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting folder: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete folder")

# File upload
@router.post("/folders/{folder_id}/upload")
async def upload_file(
    folder_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Upload a file to a knowledge base folder."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify folder ownership
        folder_result = await client.table('knowledge_base_folders').select(
            'folder_id'
        ).eq('folder_id', folder_id).eq('account_id', account_id).execute()
        
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Validate and sanitize filename
        if not file.filename:
            raise ValidationError("Filename is required")
        
        is_valid, error_message = FileNameValidator.validate_name(file.filename, "file")
        if not is_valid:
            raise ValidationError(error_message)
        
        # Read file content
        file_content = await file.read()
        
        # Check total file size limit before processing
        await check_total_file_size_limit(account_id, len(file_content))
        
        job_id = await client.rpc('create_agent_kb_processing_job', {
            'p_agent_id': agent_id,
            'p_account_id': account_id,
            'p_job_type': 'file_upload',
            'p_source_info': {
                'filename': file.filename,
                'mime_type': file.content_type,
                'file_size': len(file_content)
            }
        }).execute()
        
        # Generate unique filename if there's a conflict
        final_filename = await validate_file_name_unique_in_folder(file.filename, folder_id)
        
        # Process file
        result = await file_processor.process_file(
            account_id=account_id,
            folder_id=folder_id,
            file_content=file_content,
            filename=final_filename,
            mime_type=file.content_type or 'application/octet-stream'
        )
        
        if not result['success']:
            raise HTTPException(status_code=400, detail=result['error'])
        
        # Add info about filename changes
        if final_filename != file.filename:
            result['filename_changed'] = True
            result['original_filename'] = file.filename
            result['final_filename'] = final_filename
        
        return result
        
    except ValidationError:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload file")

# Entries
@router.get("/folders/{folder_id}/entries", response_model=List[EntryResponse])
async def get_folder_entries(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all entries in a folder."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify folder ownership
        folder_result = await client.table('knowledge_base_folders').select(
            'folder_id'
        ).eq('folder_id', folder_id).eq('account_id', account_id).execute()
        
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        result = await client.table('knowledge_base_entries').select(
            'entry_id, filename, summary, file_size, created_at'
        ).eq('folder_id', folder_id).eq('is_active', True).order('created_at', desc=True).execute()
        
        return [
            EntryResponse(
                entry_id=entry['entry_id'],
                filename=entry['filename'],
                summary=entry['summary'],
                file_size=entry['file_size'],
                created_at=entry['created_at']
            )
            for entry in result.data
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve entries")

@router.delete("/{entry_id}")
async def delete_knowledge_base_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):

    """Delete an agent knowledge base entry"""
    try:
        client = await db.client
        
        # Get the entry from the new schema
        entry_result = await client.from_('knowledge_base_entries').select('entry_id, account_id').eq('entry_id', entry_id).execute()
            
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        entry = entry_result.data[0]
        
        # Check if user has access to this entry through their account
        account_id = await get_user_account_id(client, user_id)
        if entry['account_id'] != account_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        result = await client.from_('knowledge_base_entries').delete().eq('entry_id', entry_id).execute()
        
        logger.debug(f"Deleted knowledge base entry {entry_id}")
        
        return {"message": "Knowledge base entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete knowledge base entry")


@router.get("/{entry_id}", response_model=KnowledgeBaseEntryResponse)
async def get_knowledge_base_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get a specific agent knowledge base entry"""
    try:
        client = await db.client
        
        # Get the entry from the new schema
        result = await client.from_('knowledge_base_entries').select('*').eq('entry_id', entry_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        entry = result.data[0]
        
        # Check if user has access to this entry through their account
        account_id = await get_user_account_id(client, user_id)
        if entry['account_id'] != account_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        logger.debug(f"Retrieved knowledge base entry {entry_id}")
        
        return KnowledgeBaseEntryResponse(
            entry_id=entry['entry_id'],
            name=entry['filename'],
            description=entry['summary'],
            content=entry['summary'],
            usage_context=entry['usage_context'],
            is_active=entry['is_active'],
            content_tokens=len(entry.get('summary', '')) // 4,
            created_at=entry['created_at'],
            updated_at=entry['updated_at'],
            source_type=entry.get('source_type'),
            source_metadata=entry.get('source_metadata'),
            file_size=entry.get('file_size'),
            file_mime_type=entry.get('file_mime_type')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve knowledge base entry")


@router.get("/agents/{agent_id}/processing-jobs", response_model=List[ProcessingJobResponse])
async def get_agent_processing_jobs(
    agent_id: str,
    limit: int = 10,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    
    """Get processing jobs for an agent"""
    try:
        client = await db.client

        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        # Since the old processing jobs table was dropped, return empty for now
        # TODO: Implement new processing jobs system if needed
        return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting processing jobs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve processing jobs")

@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Delete a knowledge base entry."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify ownership
        entry_result = await client.table('knowledge_base_entries').select(
            'entry_id, file_path'
        ).eq('entry_id', entry_id).eq('account_id', account_id).execute()
        
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        entry = entry_result.data[0]
        
        # Delete from S3
        try:
            await client.storage.from_('file-uploads').remove([entry['file_path']])
        except Exception as e:
            logger.warning(f"Failed to delete file from S3: {str(e)}")
        
        # Delete from database
        await client.table('knowledge_base_entries').delete().eq('entry_id', entry_id).execute()
        
        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete entry")

# =============================================================================
# SUNA'S NEW KNOWLEDGE BASE SYSTEM - Agent Assignment Management  
# =============================================================================

class UnifiedAssignmentRequest(BaseModel):
    regular_entry_ids: list[str] = Field(default=[], description="List of regular knowledge base entry IDs")
    llamacloud_kb_ids: list[str] = Field(default=[], description="List of LlamaCloud knowledge base IDs")

class UnifiedAssignmentResponse(BaseModel):
    regular_assignments: dict[str, bool] = Field(default={}, description="Entry ID to enabled status mapping")
    llamacloud_assignments: dict[str, bool] = Field(default={}, description="LlamaCloud KB ID to enabled status mapping")
    total_regular_count: int
    total_llamacloud_count: int

@router.get("/agents/{agent_id}/assignments/unified", response_model=UnifiedAssignmentResponse)
async def get_agent_unified_assignments(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get unified knowledge base assignments for an agent (both regular and LlamaCloud)"""
    try:
        client = await db.client
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        # Get regular KB assignments
        regular_result = await client.from_("agent_knowledge_entry_assignments").select("entry_id, enabled").eq("agent_id", agent_id).execute()
        regular_assignments = {row['entry_id']: row['enabled'] for row in regular_result.data}
        
        # Get LlamaCloud KB assignments from the new assignment table
        llamacloud_result = await client.from_("agent_llamacloud_kb_assignments").select(
            "kb_id, enabled"
        ).eq("agent_id", agent_id).execute()
        
        llamacloud_assignments = {row['kb_id']: row['enabled'] for row in llamacloud_result.data}
        
        return UnifiedAssignmentResponse(
            regular_assignments=regular_assignments,
            llamacloud_assignments=llamacloud_assignments,
            total_regular_count=len(regular_assignments),
            total_llamacloud_count=len(llamacloud_assignments)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unified assignments for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve unified agent assignments")

@router.post("/agents/{agent_id}/assignments/unified")
async def update_agent_unified_assignments(
    agent_id: str,
    request: UnifiedAssignmentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update unified knowledge base assignments for an agent (both regular and LlamaCloud)"""
    try:
        client = await db.client
        
        # Verify agent access
        agent_auth = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_auth['account_id']
        
        # Update regular KB assignments
        # Delete existing regular assignments for this agent
        await client.from_("agent_knowledge_entry_assignments").delete().eq("agent_id", agent_id).execute()
        
        # Insert new regular entry assignments
        for entry_id in request.regular_entry_ids:
            await client.from_("agent_knowledge_entry_assignments").insert({
                "agent_id": agent_id,
                "entry_id": entry_id,
                "account_id": account_id,
                "enabled": True
            }).execute()
        
        # Update LlamaCloud KB assignments
        # Delete existing LlamaCloud KB assignments for this agent
        await client.from_("agent_llamacloud_kb_assignments").delete().eq("agent_id", agent_id).execute()
        
        # Insert new LlamaCloud KB assignments
        for kb_id in request.llamacloud_kb_ids:
            # Verify the KB exists and belongs to the account
            kb_check = await client.from_('llamacloud_knowledge_bases').select('kb_id').eq(
                'kb_id', kb_id
            ).eq('account_id', account_id).execute()
            
            if kb_check.data:
                await client.from_("agent_llamacloud_kb_assignments").insert({
                    "agent_id": agent_id,
                    "kb_id": kb_id,
                    "account_id": account_id,
                    "enabled": True
                }).execute()
        
        return {"message": "Unified agent assignments updated successfully", "regular_count": len(request.regular_entry_ids), "llamacloud_count": len(request.llamacloud_kb_ids)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating unified assignments for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update unified agent assignments")

@router.patch("/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    entry_id: str,
    request: UpdateEntryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update a knowledge base entry summary."""
    try:
        client = await db.client
        account_id = user_id
        
        # Verify ownership and get current entry
        entry_result = await client.table('knowledge_base_entries').select(
            'entry_id, filename, summary, file_size, created_at, account_id'
        ).eq('entry_id', entry_id).eq('account_id', account_id).execute()
        
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        
        # Update the summary
        update_result = await client.table('knowledge_base_entries').update({
            'summary': request.summary
        }).eq('entry_id', entry_id).execute()
        
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update entry")
        
        # Return the updated entry
        updated_entry = update_result.data[0]
        return EntryResponse(
            entry_id=updated_entry['entry_id'],
            filename=updated_entry['filename'],
            summary=updated_entry['summary'],
            file_size=updated_entry['file_size'],
            created_at=updated_entry['created_at']
        )
        
    except HTTPException:
        logger.error(f"Error updating entry: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update entry")

# Agent assignments
@router.get("/agents/{agent_id}/assignments")
async def get_agent_assignments(
    agent_id: str,
    auth: AuthorizedAgentAccess = Depends(require_agent_access)
):
    """Get entry assignments for an agent."""
    try:
        client = await DBConnection().client
        
        # Get file-level assignments only
        file_result = await client.table('agent_knowledge_entry_assignments').select(
            'entry_id, enabled'
        ).eq('agent_id', agent_id).execute()
        
        return {row['entry_id']: row['enabled'] for row in file_result.data}
        
    except Exception as e:
        logger.error(f"Error getting agent assignments: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent assignments")

# =============================================================================
# SUNA'S NEW KNOWLEDGE BASE SYSTEM - Agent Assignment Management  
# =============================================================================

class AgentAssignmentRequest(BaseModel):
    assignments: dict = Field(..., description="Dictionary of folder assignments")

class AgentAssignmentResponse(BaseModel):
    folder_id: str
    enabled: bool
    file_assignments: dict

# Unified Assignment Models
class UnifiedAssignmentRequest(BaseModel):
    regular_entry_ids: list[str] = Field(default=[], description="List of regular knowledge base entry IDs")
    llamacloud_kb_ids: list[str] = Field(default=[], description="List of LlamaCloud knowledge base IDs")

class UnifiedAssignmentResponse(BaseModel):
    regular_assignments: dict[str, bool] = Field(default={}, description="Entry ID to enabled status mapping")
    llamacloud_assignments: dict[str, bool] = Field(default={}, description="LlamaCloud KB ID to enabled status mapping")
    total_regular_count: int
    total_llamacloud_count: int

@router.get("/agents/{agent_id}/assignments/unified")
async def get_agent_unified_assignments(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get unified knowledge base assignments for an agent (both regular and LlamaCloud)"""
    try:
        client = await db.client
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        # Get regular KB assignments
        regular_result = await client.from_("agent_knowledge_entry_assignments").select("entry_id, enabled").eq("agent_id", agent_id).execute()
        regular_assignments = {row['entry_id']: row['enabled'] for row in regular_result.data}
        
        # Get LlamaCloud KB assignments
        llamacloud_result = await client.from_("agent_llamacloud_kb_assignments").select("kb_id, enabled").eq("agent_id", agent_id).execute()
        llamacloud_assignments = {row['kb_id']: row['enabled'] for row in llamacloud_result.data}
        
        return UnifiedAssignmentResponse(
            regular_assignments=regular_assignments,
            llamacloud_assignments=llamacloud_assignments,
            total_regular_count=len(regular_assignments),
            total_llamacloud_count=len(llamacloud_assignments)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unified assignments for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve unified agent assignments")

@router.post("/agents/{agent_id}/assignments/unified")
async def update_agent_unified_assignments(
    agent_id: str,
    request: UnifiedAssignmentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update unified knowledge base assignments for an agent (both regular and LlamaCloud)"""
    try:
        client = await db.client
        
        # Verify agent access
        agent_auth = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_auth['account_id']
        
        # Update regular KB assignments
        # Delete existing regular assignments for this agent
        await client.from_("agent_knowledge_entry_assignments").delete().eq("agent_id", agent_id).execute()
        
        # Insert new regular entry assignments
        for entry_id in request.regular_entry_ids:
            await client.from_("agent_knowledge_entry_assignments").insert({
                "agent_id": agent_id,
                "entry_id": entry_id,
                "account_id": account_id,
                "enabled": True
            }).execute()
        
        # Update LlamaCloud KB assignments
        # Delete existing LlamaCloud KB assignments for this agent
        await client.from_("agent_llamacloud_kb_assignments").delete().eq("agent_id", agent_id).execute()
        
        # Insert new LlamaCloud KB assignments
        for kb_id in request.llamacloud_kb_ids:
            # Verify the KB exists and belongs to the account
            kb_check = await client.from_('llamacloud_knowledge_bases').select('kb_id').eq(
                'kb_id', kb_id
            ).eq('account_id', account_id).execute()
            
            if kb_check.data:
                await client.from_("agent_llamacloud_kb_assignments").insert({
                    "agent_id": agent_id,
                    "kb_id": kb_id,
                    "account_id": account_id,
                    "enabled": True
                }).execute()
        
        return {"message": "Unified agent assignments updated successfully", "regular_count": len(request.regular_entry_ids), "llamacloud_count": len(request.llamacloud_kb_ids)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating unified assignments for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update unified agent assignments")

@router.post("/agents/{agent_id}/assignments")
async def update_agent_assignments(
    agent_id: str,
    request: AgentAssignmentRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update knowledge base assignments for an agent"""
    try:
        client = await db.client
        
        # Verify agent access
        agent_auth = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_auth.account_id
        
        # Delete existing assignments for this agent
        await client.from_("agent_knowledge_entry_assignments").delete().eq("agent_id", agent_id).execute()
        
        # Insert new entry assignments - expect entry_ids list
        entry_ids = request.assignments.get('entry_ids', [])
        for entry_id in entry_ids:
            await client.from_("agent_knowledge_entry_assignments").insert({
                "agent_id": agent_id,
                "entry_id": entry_id,
                "account_id": account_id,
                "enabled": True
            }).execute()
        
        return {"message": "Agent assignments updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating agent assignments for {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update agent assignments")


@router.get("/entries/{entry_id}/download")
async def download_file(
    entry_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Download the actual file content from S3"""
    try:
        client = await db.client
        
        # Get the entry from knowledge_base_entries table
        result = await client.from_("knowledge_base_entries").select("file_path, filename, mime_type, account_id").eq("entry_id", entry_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        entry = result.data
        
        # Verify user has access to this entry (check account_id)
        user_account_id = await get_user_account_id(client, user_id)
        if user_account_id != entry['account_id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get file content from S3
        file_response = await client.storage.from_('file-uploads').download(entry['file_path'])
        
        if not file_response:
            raise HTTPException(status_code=404, detail="File content not found in storage")
        
        # For text files, return as text
        if entry['mime_type'] and entry['mime_type'].startswith('text/'):
            return {"content": file_response.decode('utf-8'), "is_binary": False}
        else:
            # For binary files (including PDFs), return base64 encoded content
            import base64
            return {"content": base64.b64encode(file_response).decode('utf-8'), "is_binary": True}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading file {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to download file")


# =============================================================================
# LLAMACLOUD KNOWLEDGE BASE ENDPOINTS (LEGACY SUPPORT)
# =============================================================================

@router.get("/llamacloud/agents/{agent_id}", response_model=LlamaCloudKnowledgeBaseListResponse)
async def get_agent_llamacloud_knowledge_bases(
    agent_id: str,
    include_inactive: bool = False,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all LlamaCloud knowledge bases assigned to an agent (respects assignments only)"""
    try:
        client = await db.client

        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)

        # Use assignment-based RPC to ensure agents only access assigned KBs
        result = await client.rpc('get_agent_assigned_llamacloud_kbs', {
            'p_agent_id': agent_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        knowledge_bases = []
        
        for kb_data in result.data or []:
            kb = LlamaCloudKnowledgeBaseResponse(
                id=kb_data['kb_id'],  # get_agent_assigned_llamacloud_kbs returns 'kb_id' not 'id'
                name=kb_data['name'],
                index_name=kb_data['index_name'],
                description=kb_data['description'],
                is_active=kb_data['is_active'],
                created_at=kb_data['created_at'],
                updated_at=kb_data['updated_at']
            )
            knowledge_bases.append(kb)
        
        return LlamaCloudKnowledgeBaseListResponse(
            knowledge_bases=knowledge_bases,
            total_count=len(knowledge_bases)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting LlamaCloud knowledge bases for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent LlamaCloud knowledge bases")

@router.post("/llamacloud/agents/{agent_id}", response_model=LlamaCloudKnowledgeBaseResponse)
async def create_agent_llamacloud_knowledge_base(
    agent_id: str,
    kb_data: CreateLlamaCloudKnowledgeBaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Create a new LlamaCloud knowledge base for an agent"""
    try:
        client = await db.client
        
        # Verify agent access and get agent data
        agent_data = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_data['account_id']
        
        # Format the name for tool function generation
        formatted_name = format_knowledge_base_name(kb_data.name)
        
        insert_data = {
            'agent_id': agent_id,
            'account_id': account_id,
            'name': formatted_name,
            'index_name': kb_data.index_name,
            'description': kb_data.description
        }
        
        result = await client.table('agent_llamacloud_knowledge_bases').insert(insert_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create LlamaCloud knowledge base")
        
        created_kb = result.data[0]
        
        logger.info(f"Created LlamaCloud knowledge base {created_kb['id']} for agent {agent_id}")
        
        return LlamaCloudKnowledgeBaseResponse(
            id=created_kb['id'],
            name=created_kb['name'],
            index_name=created_kb['index_name'],
            description=created_kb['description'],
            is_active=created_kb['is_active'],
            created_at=created_kb['created_at'],
            updated_at=created_kb['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating LlamaCloud knowledge base for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create LlamaCloud knowledge base")

@router.put("/llamacloud/{kb_id}", response_model=LlamaCloudKnowledgeBaseResponse)
async def update_llamacloud_knowledge_base(
    kb_id: str,
    kb_data: UpdateLlamaCloudKnowledgeBaseRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Update a LlamaCloud knowledge base"""
    try:
        client = await db.client
        
        # Get the knowledge base and verify it exists
        kb_result = await client.table('agent_llamacloud_knowledge_bases').select('*').eq('id', kb_id).execute()
            
        if not kb_result.data:
            raise HTTPException(status_code=404, detail="LlamaCloud knowledge base not found")
        
        kb = kb_result.data[0]
        agent_id = kb['agent_id']
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        update_data = {}
        if kb_data.name is not None:
            update_data['name'] = format_knowledge_base_name(kb_data.name)
        if kb_data.index_name is not None:
            update_data['index_name'] = kb_data.index_name
        if kb_data.description is not None:
            update_data['description'] = kb_data.description
        if kb_data.is_active is not None:
            update_data['is_active'] = kb_data.is_active
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await client.table('agent_llamacloud_knowledge_bases').update(update_data).eq('id', kb_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update LlamaCloud knowledge base")
        
        updated_kb = result.data[0]
        
        logger.info(f"Updated LlamaCloud knowledge base {kb_id} for agent {agent_id}")
        
        return LlamaCloudKnowledgeBaseResponse(
            id=updated_kb['id'],
            name=updated_kb['name'],
            index_name=updated_kb['index_name'],
            description=updated_kb['description'],
            is_active=updated_kb['is_active'],
            created_at=updated_kb['created_at'],
            updated_at=updated_kb['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating LlamaCloud knowledge base {kb_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update LlamaCloud knowledge base")

@router.delete("/llamacloud/{kb_id}")
async def delete_llamacloud_knowledge_base(
    kb_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Delete a LlamaCloud knowledge base"""
    try:
        client = await db.client
        
        # Get the knowledge base and verify it exists
        kb_result = await client.table('agent_llamacloud_knowledge_bases').select('id, agent_id').eq('id', kb_id).execute()
            
        if not kb_result.data:
            raise HTTPException(status_code=404, detail="LlamaCloud knowledge base not found")
        
        kb = kb_result.data[0]
        agent_id = kb['agent_id']
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        result = await client.table('agent_llamacloud_knowledge_bases').delete().eq('id', kb_id).execute()
        
        logger.info(f"Deleted LlamaCloud knowledge base {kb_id} for agent {agent_id}")
        
        return {"message": "LlamaCloud knowledge base deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting LlamaCloud knowledge base {kb_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete LlamaCloud knowledge base")

@router.post("/llamacloud/agents/{agent_id}/test-search")
async def test_llamacloud_search(
    agent_id: str,
    test_data: dict,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Test search functionality for a LlamaCloud index"""
    try:
        client = await db.client
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        index_name = test_data.get('index_name')
        query = test_data.get('query')
        
        if not index_name or not query:
            raise HTTPException(status_code=400, detail="Both index_name and query are required")
        
        # Check if required environment variables are set
        import os
        if not os.getenv("LLAMA_CLOUD_API_KEY"):
            raise HTTPException(
                status_code=400, 
                detail="LLAMA_CLOUD_API_KEY environment variable not configured"
            )
        
        # Import LlamaCloud client
        try:
            from llama_index.indices.managed.llama_cloud import LlamaCloudIndex
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="LlamaCloud client not installed. Please install llama-index-indices-managed-llama-cloud"
            )
        
        # Set the API key
        os.environ["LLAMA_CLOUD_API_KEY"] = os.getenv("LLAMA_CLOUD_API_KEY")
        
        project_name = os.getenv("LLAMA_CLOUD_PROJECT_NAME", "Default")
        
        logger.info(f"Testing search on index '{index_name}' with query: {query}")
        
        # Connect to the index
        index = LlamaCloudIndex(index_name, project_name=project_name)
        
        # Configure retriever
        retriever = index.as_retriever(
            dense_similarity_top_k=3,
            sparse_similarity_top_k=3,
            alpha=0.5,
            enable_reranking=True,
            rerank_top_n=3,
            retrieval_mode="chunks"
        )
        
        # Perform the search
        nodes = retriever.retrieve(query)
        
        if not nodes:
            return {
                "success": True,
                "message": f"No results found in '{index_name}' for query: {query}",
                "results": [],
                "index_name": index_name,
                "query": query
            }
        
        # Format the results
        results = []
        for i, node in enumerate(nodes):
            result = {
                "rank": i + 1,
                "score": node.score,
                "text": node.text[:500] + "..." if len(node.text) > 500 else node.text,  # Truncate for testing
                "metadata": node.metadata if hasattr(node, 'metadata') else {}
            }
            results.append(result)
        
        return {
            "success": True,
            "message": f"Found {len(results)} results in '{index_name}'",
            "results": results,
            "index_name": index_name,
            "query": query
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing LlamaCloud search: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to test search")

class FolderMoveRequest(BaseModel):
    folder_id: str

# File operations
@router.put("/entries/{entry_id}/move")
async def move_file(
    entry_id: str,
    request: FolderMoveRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Move a file to a different folder."""
    try:
        client = await db.client
        account_id = user_id
        
        # Get current entry details including file path and filename
        entry_result = await client.table('knowledge_base_entries').select(
            'entry_id, folder_id, file_path, filename'
        ).eq('entry_id', entry_id).execute()
        
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="File not found")
        
        entry = entry_result.data[0]
        current_folder_id = entry['folder_id']
        current_file_path = entry['file_path']
        filename = entry['filename']
        
        # If already in the target folder, no need to move
        if current_folder_id == request.folder_id:
            return {"success": True, "message": "File is already in the target folder"}
        
        # Verify target folder belongs to user
        folder_result = await client.table('knowledge_base_folders').select(
            'folder_id'
        ).eq('folder_id', request.folder_id).eq('account_id', account_id).execute()
        
        if not folder_result.data:
            raise HTTPException(status_code=404, detail="Target folder not found")
        
        # Sanitize filename for storage (same logic as file processor)
        sanitized_filename = file_processor.sanitize_filename(filename)
        
        # Create new file path
        new_file_path = f"knowledge-base/{request.folder_id}/{entry_id}/{sanitized_filename}"
        
        # Move file in storage
        try:
            # Copy file to new location
            copy_result = await client.storage.from_('file-uploads').copy(
                current_file_path, new_file_path
            )
            
            # Remove old file
            await client.storage.from_('file-uploads').remove([current_file_path])
            
        except Exception as storage_error:
            logger.error(f"Error moving file in storage: {str(storage_error)}")
            raise HTTPException(status_code=500, detail="Failed to move file in storage")
        
        # Update the database with new folder and file path
        await client.table('knowledge_base_entries').update({
            'folder_id': request.folder_id,
            'file_path': new_file_path
        }).eq('entry_id', entry_id).execute()
        
        return {"success": True, "message": "File moved successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving file: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to move file")
