from fastapi import APIRouter, HTTPException, BackgroundTasks, Security, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.db_helpers import get_db
from core.linear.service import LinearService
from core.utils.s3_upload_utils import upload_base64_image
from core.utils.logger import logger
from datetime import datetime
import json
import base64

router = APIRouter(prefix="/customer-requests", tags=["Customer Requests"])

class CustomerRequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    request_type: str = Field(..., pattern="^(feature|bug|improvement|agent|other)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    attachments: Optional[List[str]] = Field(default=[], description="List of image URLs or base64 data")
    environment: Optional[str] = Field(default=None)

@router.post("")
async def create_customer_request(
    request: CustomerRequestCreate,
    user_id: str = Security(verify_and_get_user_id_from_jwt)
):
    try:
        linear_service = LinearService()
        
        # 1. Process attachments
        uploaded_urls = []
        for attachment in request.attachments:
            if attachment.startswith('http'):
                uploaded_urls.append(attachment)
            else:
                try:
                    url = await upload_base64_image(attachment, bucket_name="customer-request-images")
                    uploaded_urls.append(url)
                except Exception as e:
                    logger.error(f"Failed to upload attachment: {e}")
                    # Continue without this attachment or fail?
                    # For now, we continue
        
        # 2. Get User Context (Using Supabase Client directly as we are inside async context)
        # Note: In a real app we might want to dependency inject this or use a proper service
        # Here we will assume we can get user details if needed, but for now we rely on user_id
        
        # 3. Create Linear Issue
        # Format description with user info and images
        
        markdown_description = f"""
**User ID**: {user_id}
**Environment**: {request.environment or 'Unknown'}
**Request Type**: {request.request_type}

---

{request.description}

---
**Attachments**:
"""
        for url in uploaded_urls:
            markdown_description += f"\n![Attachment]({url})"
            
        linear_issue = await linear_service.create_issue(
            title=f"[{request.request_type.title()}] {request.title}",
            description=markdown_description,
            priority=request.priority,
            request_type=request.request_type
        )
        
        linear_issue_id = linear_issue.get("id") if linear_issue else None
        linear_issue_url = linear_issue.get("url") if linear_issue else None
        
        # 4. Save to Database
        # We need to get account_id. For now, let's grab the user's primary account.
        # This is a bit hacker-ish direct DB access, ideally moved to a service.
        
        db = get_db()
        client = await db.client
        
        # Fetch account_id (User's personal account)
        account_response = await client.table("basejump.accounts") \
            .select("id") \
            .eq("primary_owner_user_id", user_id) \
            .eq("personal_account", True) \
            .single() \
            .execute()
            
        account_id = None
        if account_response.data:
            account_id = account_response.data.get("id")
        
        # If no personal account found (rare), try finding any account they own
        if not account_id:
             account_response = await client.table("basejump.account_user") \
                .select("account_id") \
                .eq("user_id", user_id) \
                .eq("account_role", "owner") \
                .limit(1) \
                .single() \
                .execute()
             if account_response.data:
                 account_id = account_response.data.get("account_id")
                 
        if not account_id:
             logger.error(f"No account found for user {user_id}")
             # We might still want to save the request even without account_id if possible, 
             # but our schema enforces NOT NULL.
             # We will fail if no account is found.
             raise HTTPException(status_code=400, detail="User does not have an active account.")

        db_record = {
            "account_id": account_id,
            "user_id": user_id,
            "title": request.title,
            "description": request.description,
            "request_type": request.request_type,
            "priority": request.priority,
            "attachments": uploaded_urls,
            "environment": request.environment,
            "linear_issue_id": linear_issue_id,
            "linear_issue_url": linear_issue_url
        }
        
        insert_response = await client.table("customer_requests").insert(db_record).execute()
        
        return {
            "success": True, 
            "linear_issue": linear_issue, 
            "db_record": insert_response.data[0] if insert_response.data else None
        }

    except Exception as e:
        logger.error(f"Error processing customer request: {e}")
        raise HTTPException(status_code=500, detail=str(e))
