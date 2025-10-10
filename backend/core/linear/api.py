"""
API endpoints for customer requests with Linear integration.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID
import os

from core.utils.auth_utils import verify_and_get_user_id_from_jwt, _decode_jwt_safely
from core.services.supabase import DBConnection
from core.utils.logger import logger
from core.utils.s3_upload_utils import upload_base64_image
from .service import linear_service


router = APIRouter(prefix="/customer-requests", tags=["customer-requests"])

db: DBConnection = None


def initialize(database: DBConnection):
    global db
    db = database


class CustomerRequestCreate(BaseModel):
    """Request model for creating a customer request."""
    title: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1)
    request_type: str = Field(..., pattern="^(feature|bug|improvement|agent|other)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    attachments: Optional[List[str]] = Field(default=[], description="List of image URLs or base64 data")


class CustomerRequestResponse(BaseModel):
    """Response model for customer request."""
    id: str
    account_id: str
    user_id: str
    user_email: Optional[str] = None
    title: str
    description: str
    request_type: str
    priority: str
    attachments: Optional[List[str]] = []
    environment: Optional[str] = None
    linear_issue_id: Optional[str] = None
    linear_issue_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=CustomerRequestResponse)
async def create_customer_request(
    req: Request,
    request: CustomerRequestCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Create a new customer request and automatically create a Linear issue.
    """
    try:
        # Extract email from JWT token
        auth_header = req.headers.get('Authorization', '')
        user_email = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                payload = _decode_jwt_safely(token)
                user_email = payload.get('email')
            except Exception as e:
                logger.warning(f"Failed to extract email from JWT: {e}")
        
        # Get environment/domain from request
        # Try to get the full URL from the request
        host = req.headers.get('host', 'unknown')
        protocol = 'https' if req.headers.get('x-forwarded-proto') == 'https' else 'http'
        environment = f"{protocol}://{host}"
        
        # Fallback to ENV_MODE if host is unknown
        if host == 'unknown':
            env_mode = os.getenv("ENV_MODE", "unknown")
            public_url = os.getenv("NEXT_PUBLIC_URL", os.getenv("BACKEND_URL", ""))
            environment = public_url if public_url else env_mode
        
        # Get user's primary account
        client = await db.client
        account_result = await client.schema("basejump").table("accounts").select("id").eq("primary_owner_user_id", user_id).eq("personal_account", True).limit(1).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="User account not found")
        
        account_id = account_result.data[0]["id"]

        # Upload attachments to Supabase storage and get public URLs
        uploaded_image_urls = []
        if request.attachments:
            for attachment in request.attachments:
                try:
                    # Upload base64 image and get public URL
                    public_url = await upload_base64_image(attachment, bucket_name="customer-request-images")
                    uploaded_image_urls.append(public_url)
                    logger.debug(f"Uploaded image to {public_url}")
                except Exception as e:
                    logger.error(f"Failed to upload image: {e}")
                    # Continue with other images even if one fails

        # Create Linear issue first
        linear_issue = None
        linear_issue_id = None
        linear_issue_url = None

        try:
            # Format description with metadata
            linear_description = f"""
{request.description}

---
**Request Type:** {request.request_type}
**Priority:** {request.priority}
**User Email:** {user_email or 'Not available'}
**User ID:** {user_id}
**Account ID:** {account_id}
**Environment:** {environment}
"""
            
            # Add attachments as images to description if provided
            if uploaded_image_urls:
                linear_description += "\n\n**Screenshots:**\n"
                for i, image_url in enumerate(uploaded_image_urls, 1):
                    # Use markdown image syntax so Linear renders them
                    linear_description += f"\n![Screenshot {i}]({image_url})\n"

            # Map request type to labels
            label_map = {
                "feature": ["feature-request"],
                "bug": ["bug"],
                "improvement": ["improvement"],
                "agent": ["agent-request"],
                "other": ["feedback"]
            }
            
            labels = label_map.get(request.request_type, ["feedback"])

            # Dynamic title prefix based on request type
            title_prefix = "[Agent Request]" if request.request_type == "agent" else "[Customer Request]"
            
            linear_issue = await linear_service.create_issue(
                title=f"{title_prefix} {request.title}",
                description=linear_description,
                priority=request.priority,
                labels=labels
            )

            if linear_issue:
                linear_issue_id = linear_issue.get("id")
                linear_issue_url = linear_issue.get("url")
                logger.info(f"Created Linear issue {linear_issue.get('identifier')} for customer request")
            else:
                logger.warning("Failed to create Linear issue, but will still save request")

        except Exception as e:
            logger.error(f"Error creating Linear issue: {e}", exc_info=True)
            # Continue even if Linear creation fails

        # Insert into database
        insert_result = await client.table("customer_requests").insert({
            "account_id": account_id,
            "user_id": user_id,
            "user_email": user_email,
            "title": request.title,
            "description": request.description,
            "request_type": request.request_type,
            "priority": request.priority,
            "attachments": uploaded_image_urls,  # Store uploaded URLs, not base64
            "environment": environment,
            "linear_issue_id": linear_issue_id,
            "linear_issue_url": linear_issue_url,
        }).execute()

        if not insert_result.data:
            raise HTTPException(status_code=500, detail="Failed to create customer request")

        created_request = insert_result.data[0]
        logger.info(f"Created customer request {created_request['id']} for account {account_id}")

        return CustomerRequestResponse(**created_request)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create customer request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create customer request: {str(e)}")


@router.get("", response_model=List[CustomerRequestResponse])
async def get_customer_requests(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Get all customer requests for the authenticated user's account.
    """
    try:
        # Get user's primary account
        client = await db.client
        account_result = await client.schema("basejump").table("accounts").select("id").eq("primary_owner_user_id", user_id).eq("personal_account", True).limit(1).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="User account not found")
        
        account_id = account_result.data[0]["id"]

        # Fetch customer requests
        requests_result = await client.table("customer_requests")\
            .select("*")\
            .eq("account_id", account_id)\
            .order("created_at", desc=True)\
            .execute()

        return [CustomerRequestResponse(**req) for req in requests_result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch customer requests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch customer requests: {str(e)}")


@router.get("/{request_id}", response_model=CustomerRequestResponse)
async def get_customer_request(
    request_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Get a specific customer request by ID.
    """
    try:
        # Get user's primary account
        client = await db.client
        account_result = await client.schema("basejump").table("accounts").select("id").eq("primary_owner_user_id", user_id).eq("personal_account", True).limit(1).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="User account not found")
        
        account_id = account_result.data[0]["id"]

        # Fetch the specific request
        request_result = await client.table("customer_requests")\
            .select("*")\
            .eq("id", request_id)\
            .eq("account_id", account_id)\
            .single()\
            .execute()

        if not request_result.data:
            raise HTTPException(status_code=404, detail="Customer request not found")

        return CustomerRequestResponse(**request_result.data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch customer request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch customer request: {str(e)}")

