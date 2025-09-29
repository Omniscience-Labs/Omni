import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel, Field, HttpUrl
from core.utils.auth_utils import verify_and_get_user_id_from_jwt, verify_and_get_agent_authorization, require_agent_access, AuthorizedAgentAccess
from core.services.supabase import DBConnection
from core.knowledge_base.file_processor import FileProcessor
from core.utils.logger import logger

# Constants
MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024  # 50MB total limit per user

db = DBConnection()

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])

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
        client = await db.client
        
        # Get total size of all current entries for this account
        result = await client.from_('knowledge_base_entries').select(
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
    """Get all folders for the current user"""
    try:
        client = await db.client
        
        # Get current account_id from user
        account_id = await get_user_account_id(client, user_id)
        
        # Get folders for this account
        result = await client.from_("knowledge_base_folders").select("*").eq("account_id", account_id).order("created_at", desc=True).execute()
        
        folders = []
        for folder in result.data:
            folders.append(FolderResponse(
                folder_id=folder["folder_id"],
                name=folder["name"],
                description=folder.get("description"),
                entry_count=folder.get("entry_count", 0),
                created_at=folder["created_at"]
            ))
        
        return folders
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folders: {str(e)}")
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
            'description': kb_data.description
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

@router.get("/folders/{folder_id}/entries")
async def get_folder_entries(
    folder_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all entries in a folder"""
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
        
        # Get entries
        result = await client.from_("knowledge_base_entries").select("*").eq("folder_id", folder_id).order("created_at", desc=True).execute()
        
        entries = result.data if result.data else []
        return {"entries": entries}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder entries: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve folder entries")

class KnowledgeBaseEntry(BaseModel):
    entry_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    content: str = Field(..., min_length=1)
    usage_context: str = Field(default="always", pattern="^(always|on_request|contextual)$")
    is_active: bool = True

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
    content: Optional[str] = Field(None, min_length=1)
    usage_context: Optional[str] = Field(None, pattern="^(always|on_request|contextual)$")
    is_active: Optional[bool] = None

class ProcessingJobResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    source_info: dict
    result_info: dict
    entries_created: int
    total_files: int
    created_at: str
    completed_at: Optional[str]
    error_message: Optional[str]

db = DBConnection()

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
        
        # Get LlamaCloud knowledge base entries using existing system
        llamacloud_result = await client.rpc('get_agent_llamacloud_knowledge_bases', {
            'p_agent_id': agent_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        llamacloud_entries = []
        
        for kb_data in llamacloud_result.data or []:
            kb = LlamaCloudKnowledgeBaseResponse(
                id=kb_data['id'],
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
        logger.error(f"Error getting knowledge base for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent knowledge base")

@router.post("/agents/{agent_id}", response_model=KnowledgeBaseEntryResponse)
async def create_agent_knowledge_base_entry(
    agent_id: str,
    entry_data: CreateKnowledgeBaseEntryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    
    """Create a new knowledge base entry for an agent"""
    try:
        client = await db.client
        
        # Verify agent access and get agent data
        agent_data = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_data['account_id']
        
        insert_data = {
            'agent_id': agent_id,
            'account_id': account_id,
            'name': entry_data.name,
            'description': entry_data.description,
            'content': entry_data.content,
            'usage_context': entry_data.usage_context
        }
        
        # For now, return an error since direct agent knowledge base creation was moved to the folder-based system
        raise HTTPException(status_code=400, detail="Agent knowledge base entries are now managed through the global folder system. Please use the knowledge base page to upload files and assign them to agents.")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating knowledge base entry for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create agent knowledge base entry")

@router.post("/agents/{agent_id}/upload-file")
async def upload_file_to_agent_kb(
    agent_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    
    """Upload and process a file for agent knowledge base"""
    try:
        client = await db.client
        
        # Verify agent access and get agent data
        agent_data = await verify_and_get_agent_authorization(client, agent_id, user_id)
        account_id = agent_data['account_id']
        
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
        
        if not job_id.data:
            raise HTTPException(status_code=500, detail="Failed to create processing job")
        
        job_id = job_id.data
        background_tasks.add_task(
            process_file_background,
            job_id,
            agent_id,
            account_id,
            file_content,
            file.filename,
            file.content_type or 'application/octet-stream'
        )
        
        return {
            "job_id": job_id,
            "message": "File upload started. Processing in background.",
            "filename": file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file to agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload file")


@router.put("/{entry_id}", response_model=KnowledgeBaseEntryResponse)
async def update_knowledge_base_entry(
    entry_id: str,
    entry_data: UpdateKnowledgeBaseEntryRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    
    """Update an agent knowledge base entry"""
    try:
        client = await db.client
        
        # Get the entry from the new schema
        entry_result = await client.from_('knowledge_base_entries').select('*').eq('entry_id', entry_id).execute()
            
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        entry = entry_result.data[0]
        
        # Check if user has access to this entry through their account
        account_id = await get_user_account_id(client, user_id)
        if entry['account_id'] != account_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Update logic for the entry (only filename and summary can be updated)
        update_data = {}
        if entry_data.name is not None:
            update_data['filename'] = entry_data.name
        if entry_data.description is not None:
            update_data['summary'] = entry_data.description
        if entry_data.usage_context is not None:
            update_data['usage_context'] = entry_data.usage_context
        if entry_data.is_active is not None:
            update_data['is_active'] = entry_data.is_active
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await client.from_('knowledge_base_entries').update(update_data).eq('entry_id', entry_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update knowledge base entry")
        
        updated_entry = result.data[0]
        
        logger.debug(f"Updated knowledge base entry {entry_id}")
        
        return KnowledgeBaseEntryResponse(
            entry_id=updated_entry['entry_id'],
            name=updated_entry['filename'],
            description=updated_entry['summary'],
            content=updated_entry['summary'],
            usage_context=updated_entry['usage_context'],
            is_active=updated_entry['is_active'],
            content_tokens=len(updated_entry.get('summary', '')) // 4,
            created_at=updated_entry['created_at'],
            updated_at=updated_entry['updated_at'],
            source_type=updated_entry.get('source_type'),
            source_metadata=updated_entry.get('source_metadata'),
            file_size=updated_entry.get('file_size'),
            file_mime_type=updated_entry.get('file_mime_type')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update knowledge base entry")

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
        logger.error(f"Error getting processing jobs for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get processing jobs")

async def process_file_background(
    job_id: str,
    agent_id: str,
    account_id: str,
    file_content: bytes,
    filename: str,
    mime_type: str
):
    """Background task to process uploaded files"""
    
    processor = FileProcessor()
    client = await processor.db.client
    try:
        await client.rpc('update_agent_kb_job_status', {
            'p_job_id': job_id,
            'p_status': 'processing'
        }).execute()
        
        result = await processor.process_file_upload(
            agent_id, account_id, file_content, filename, mime_type
        )
        
        if result['success']:
            await client.rpc('update_agent_kb_job_status', {
                'p_job_id': job_id,
                'p_status': 'completed',
                'p_result_info': result,
                'p_entries_created': 1,
                'p_total_files': 1
            }).execute()
        else:
            await client.rpc('update_agent_kb_job_status', {
                'p_job_id': job_id,
                'p_status': 'failed',
                'p_error_message': result.get('error', 'Unknown error')
            }).execute()
            
    except Exception as e:
        logger.error(f"Error in background file processing for job {job_id}: {str(e)}")
        try:
            await client.rpc('update_agent_kb_job_status', {
                'p_job_id': job_id,
                'p_status': 'failed',
                'p_error_message': str(e)
            }).execute()
        except:
            pass


@router.get("/agents/{agent_id}/context")
async def get_agent_knowledge_base_context(
    agent_id: str,
    max_tokens: int = 4000,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    
    """Get knowledge base context for agent prompts"""
    try:
        client = await db.client
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        result = await client.rpc('get_agent_knowledge_base_context', {
            'p_agent_id': agent_id,
            'p_max_tokens': max_tokens
        }).execute()
        
        context = result.data if result.data else None
        
        return {
            "context": context,
            "max_tokens": max_tokens,
            "agent_id": agent_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting knowledge base context for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent knowledge base context")


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

@router.get("/agents/{agent_id}/assignments")
async def get_agent_assignments(
    agent_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get current knowledge base assignments for an agent"""
    try:
        client = await db.client
        
        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)
        
        # Get specific file assignments only
        file_result = await client.from_("agent_knowledge_entry_assignments").select("entry_id, enabled").eq("agent_id", agent_id).execute()
        
        return {row['entry_id']: row['enabled'] for row in file_result.data}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting agent assignments for {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve agent assignments")

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
        
        # Get LlamaCloud KB assignments using existing system
        llamacloud_result = await client.rpc('get_agent_llamacloud_knowledge_bases', {
            'p_agent_id': agent_id,
            'p_include_inactive': False
        }).execute()
        
        llamacloud_assignments = {kb_data['id']: kb_data['is_active'] for kb_data in llamacloud_result.data or []}
        
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
        
        # Note: LlamaCloud KB assignments are currently managed through direct agent-specific creation
        # The existing system creates LlamaCloud KBs directly for agents rather than having a separate assignment system
        # For now, we'll keep the existing behavior and only update regular KB assignments
        
        return {"message": "Unified agent assignments updated successfully", "regular_count": len(request.regular_entry_ids), "llamacloud_count": len(request.llamacloud_kb_ids)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating unified assignments for agent {agent_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update unified agent assignments")

# =============================================================================
# LLAMACLOUD KNOWLEDGE BASE ENDPOINTS (LEGACY/ENTERPRISE SUPPORT)
# =============================================================================

@router.get("/llamacloud/agents/{agent_id}", response_model=LlamaCloudKnowledgeBaseListResponse)
async def get_agent_llamacloud_knowledge_bases(
    agent_id: str,
    include_inactive: bool = False,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """Get all LlamaCloud knowledge bases for an agent"""
    try:
        client = await db.client

        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)

        result = await client.rpc('get_agent_llamacloud_knowledge_bases', {
            'p_agent_id': agent_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        knowledge_bases = []
        
        for kb_data in result.data or []:
            kb = LlamaCloudKnowledgeBaseResponse(
                id=kb_data['id'],
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
    """Get all LlamaCloud knowledge bases for an agent"""
    try:
        client = await db.client

        # Verify agent access
        await verify_and_get_agent_authorization(client, agent_id, user_id)

        result = await client.rpc('get_agent_llamacloud_knowledge_bases', {
            'p_agent_id': agent_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        knowledge_bases = []
        
        for kb_data in result.data or []:
            kb = LlamaCloudKnowledgeBaseResponse(
                id=kb_data['id'],
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
        raise HTTPException(status_code=500, detail=f"Failed to test search: {str(e)}")

