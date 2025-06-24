import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from utils.auth_utils import get_current_user_id_from_jwt
from services.supabase import DBConnection
from utils.logger import logger
from flags.flags import is_enabled

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])

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

db = DBConnection()

@router.get("/threads/{thread_id}", response_model=KnowledgeBaseListResponse)
async def get_thread_knowledge_base(
    thread_id: str,
    include_inactive: bool = False,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Get all knowledge base entries for a thread"""
    try:
        client = await db.client

        thread_result = await client.table('threads').select('*').eq('thread_id', thread_id).execute()
        if not thread_result.data:
            raise HTTPException(status_code=404, detail="Thread not found")

        result = await client.rpc('get_thread_knowledge_base', {
            'p_thread_id': thread_id,
            'p_include_inactive': include_inactive
        }).execute()
        
        entries = []
        total_tokens = 0
        
        for entry_data in result.data or []:
            entry = KnowledgeBaseEntryResponse(
                entry_id=entry_data['entry_id'],
                name=entry_data['name'],
                description=entry_data['description'],
                content=entry_data['content'],
                usage_context=entry_data['usage_context'],
                is_active=entry_data['is_active'],
                content_tokens=entry_data.get('content_tokens'),
                created_at=entry_data['created_at'],
                updated_at=entry_data.get('updated_at', entry_data['created_at'])
            )
            entries.append(entry)
            total_tokens += entry_data.get('content_tokens', 0) or 0
        
        return KnowledgeBaseListResponse(
            entries=entries,
            total_count=len(entries),
            total_tokens=total_tokens
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting knowledge base for thread {thread_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve knowledge base")

@router.post("/threads/{thread_id}", response_model=KnowledgeBaseEntryResponse)
async def create_knowledge_base_entry(
    thread_id: str,
    entry_data: CreateKnowledgeBaseEntryRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Create a new knowledge base entry for a thread"""
    try:
        client = await db.client
        thread_result = await client.table('threads').select('account_id').eq('thread_id', thread_id).execute()
        if not thread_result.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        account_id = thread_result.data[0]['account_id']
        
        insert_data = {
            'thread_id': thread_id,
            'account_id': account_id,
            'name': entry_data.name,
            'description': entry_data.description,
            'content': entry_data.content,
            'usage_context': entry_data.usage_context
        }
        
        result = await client.table('knowledge_base_entries').insert(insert_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create knowledge base entry")
        
        created_entry = result.data[0]
        
        return KnowledgeBaseEntryResponse(
            entry_id=created_entry['entry_id'],
            name=created_entry['name'],
            description=created_entry['description'],
            content=created_entry['content'],
            usage_context=created_entry['usage_context'],
            is_active=created_entry['is_active'],
            content_tokens=created_entry.get('content_tokens'),
            created_at=created_entry['created_at'],
            updated_at=created_entry['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating knowledge base entry for thread {thread_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create knowledge base entry")

@router.put("/{entry_id}", response_model=KnowledgeBaseEntryResponse)
async def update_knowledge_base_entry(
    entry_id: str,
    entry_data: UpdateKnowledgeBaseEntryRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Update a knowledge base entry"""
    try:
        client = await db.client
        entry_result = await client.table('knowledge_base_entries').select('*').eq('entry_id', entry_id).execute()
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        update_data = {}
        if entry_data.name is not None:
            update_data['name'] = entry_data.name
        if entry_data.description is not None:
            update_data['description'] = entry_data.description
        if entry_data.content is not None:
            update_data['content'] = entry_data.content
        if entry_data.usage_context is not None:
            update_data['usage_context'] = entry_data.usage_context
        if entry_data.is_active is not None:
            update_data['is_active'] = entry_data.is_active
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await client.table('knowledge_base_entries').update(update_data).eq('entry_id', entry_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update knowledge base entry")
        
        updated_entry = result.data[0]
        
        return KnowledgeBaseEntryResponse(
            entry_id=updated_entry['entry_id'],
            name=updated_entry['name'],
            description=updated_entry['description'],
            content=updated_entry['content'],
            usage_context=updated_entry['usage_context'],
            is_active=updated_entry['is_active'],
            content_tokens=updated_entry.get('content_tokens'),
            created_at=updated_entry['created_at'],
            updated_at=updated_entry['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update knowledge base entry")

@router.delete("/{entry_id}")
async def delete_knowledge_base_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )

    """Delete a knowledge base entry"""
    try:
        client = await db.client
        entry_result = await client.table('knowledge_base_entries').select('entry_id').eq('entry_id', entry_id).execute()
        if not entry_result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        result = await client.table('knowledge_base_entries').delete().eq('entry_id', entry_id).execute()
        
        return {"message": "Knowledge base entry deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete knowledge base entry")

@router.get("/{entry_id}", response_model=KnowledgeBaseEntryResponse)
async def get_knowledge_base_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    """Get a specific knowledge base entry"""
    try:
        client = await db.client
        result = await client.table('knowledge_base_entries').select('*').eq('entry_id', entry_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Knowledge base entry not found")
        
        entry = result.data[0]
        
        return KnowledgeBaseEntryResponse(
            entry_id=entry['entry_id'],
            name=entry['name'],
            description=entry['description'],
            content=entry['content'],
            usage_context=entry['usage_context'],
            is_active=entry['is_active'],
            content_tokens=entry.get('content_tokens'),
            created_at=entry['created_at'],
            updated_at=entry['updated_at']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting knowledge base entry {entry_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve knowledge base entry")

@router.get("/threads/{thread_id}/context")
async def get_knowledge_base_context(
    thread_id: str,
    max_tokens: int = 4000,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    if not await is_enabled("knowledge_base"):
        raise HTTPException(
            status_code=403, 
            detail="This feature is not available at the moment."
        )
    
    """Get knowledge base context for agent prompts"""
    try:
        client = await db.client
        thread_result = await client.table('threads').select('thread_id').eq('thread_id', thread_id).execute()
        if not thread_result.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        result = await client.rpc('get_knowledge_base_context', {
            'p_thread_id': thread_id,
            'p_max_tokens': max_tokens
        }).execute()
        
        context = result.data if result.data else None
        
        return {
            "context": context,
            "max_tokens": max_tokens,
            "thread_id": thread_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting knowledge base context for thread {thread_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve knowledge base context") 