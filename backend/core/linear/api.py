
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from typing import List, Optional
from pydantic import BaseModel
import logging
from core.services.supabase import DBConnection

from core.utils.config import config
from core.linear.schemas import CustomerRequestCreate
from core.linear.service import linear_service
from core.auth import get_current_user
from core.utils.s3_upload_utils import upload_base64_image

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Customer Requests"])

@router.post("/customer-requests", status_code=status.HTTP_201_CREATED)
async def create_customer_request(
    request: CustomerRequestCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Submit a new customer request (feedback, feature, bug, etc.).
    1. Uploads base64 attachments to Supabase Storage.
    2. Creates an issue in Linear.
    3. Saves the record to Postgres.
    """
    user_id = current_user.get("id")
    user_email = current_user.get("email")
    # Resolve account_id if available in metadata or context
    # Usually passed in headers or resolved from user_metadata. 
    # For now, we'll try to find it or leave None.
    account_id = current_user.get("app_metadata", {}).get("account_id")

    logger.info(f"Received customer request: {request.title} from user {user_id}")
    
    # 1. Handle Attachments (Base64 -> Public URL)
    image_urls = []
    if request.attachments:
        for i, attachment_str in enumerate(request.attachments):
            if attachment_str.startswith("http"):
                image_urls.append(attachment_str) # Already a URL
            else:
                # Assume Base64
                url = await upload_base64_image(attachment_str)
                if url:
                    image_urls.append(url)
                else:
                    logger.warning(f"Failed to upload attachment {i}")

    # 2. Prepare Linear payload
    # Map priority
    priority_map = {
        "urgent": 1,
        "high": 2,
        "medium": 3,
        "low": 4
    }
    priority_int = priority_map.get(request.priority, 0)
    
    # Map request type to labels (names) - Note: Linear API needs IDs usually, 
    # but we'll put them in description or try to find a way to tag them if service allowed.
    # Current service.py implementation doesn't support label lookup yet, so we will append to description.
    request_type_label = {
        "bug": "bug",
        "agent": "agent-request",
        "feature": "feature-request",
        "improvement": "improvement"
    }.get(request.request_type, "general")

    # Construct Title based on type
    # Agent: [Agent Request] <User Title>
    # Bug/Feedback: [Customer Request] <User Title>
    title_prefix = "[Agent Request]" if request.request_type == "agent" else "[Customer Request]"
    final_title = f"{title_prefix} {request.title}"
    # Construct description
    user_info = f"""
    **User Context:**
    - User ID: {user_id}
    - Email: {user_email}
    - Env: {config.ENV_MODE.value}
    - Type: {request_type_label}
    """
    
    full_description = f"{request.description}\n\n---\n{user_info}"
    
    if image_urls:
        full_description += "\n\n**Attachments:**\n"
        for url in image_urls:
            full_description += f"![Attachment]({url})\n"

    # 3. Create Linear Issue (Synchronous for now to get ID for DB, or could be backgrounded if we don't link DB row to Linear ID immediately)
    # User requested sequential flow: Upload -> Linear -> DB.
    
    linear_issue = linear_service.create_issue(
        title=final_title,
        description=full_description,
        priority=priority_int
    )
    
    linear_id = linear_issue.get("id") if linear_issue else None
    linear_url = linear_issue.get("url") if linear_issue else None

    # 4. Save to Database
    try:
        db = DBConnection()
        await db.client.table("customer_requests").insert({
            "user_id": user_id,
            "user_email": user_email,
            "account_id": account_id,
            "title": request.title,
            "description": request.description,
            "request_type": request.request_type,
            "priority": request.priority,
            "attachments": image_urls,
            "linear_issue_id": linear_id,
            "linear_issue_url": linear_url
        }).execute()
        logger.info("Saved customer request to database")
    except Exception as e:
        logger.error(f"Failed to save to database: {e}")
        # We don't fail the request if DB save fails, as Linear issue is more critical for action
        # But properly we should maybe alert.
    
    return {
        "status": "success", 
        "message": "Request submitted successfully",
        "linear_url": linear_url
    }
