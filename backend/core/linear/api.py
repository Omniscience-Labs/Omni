"""
API endpoints for customer requests with Linear integration.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.services.supabase import DBConnection
from core.utils.logger import logger
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
    request_type: str = Field(..., pattern="^(feature|bug|improvement|other)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")


class CustomerRequestResponse(BaseModel):
    """Response model for customer request."""
    id: str
    account_id: str
    title: str
    description: str
    request_type: str
    priority: str
    linear_issue_id: Optional[str] = None
    linear_issue_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=CustomerRequestResponse)
async def create_customer_request(
    request: CustomerRequestCreate,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Create a new customer request and automatically create a Linear issue.
    """
    try:
        # Get user's primary account
        client = await db.client
        account_result = await client.schema("basejump").table("accounts").select("id").eq("primary_owner_user_id", user_id).eq("personal_account", True).limit(1).execute()
        
        if not account_result.data:
            raise HTTPException(status_code=404, detail="User account not found")
        
        account_id = account_result.data[0]["id"]

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
**User ID:** {user_id}
**Account ID:** {account_id}
"""

            # Map request type to labels
            label_map = {
                "feature": ["feature-request"],
                "bug": ["bug"],
                "improvement": ["improvement"],
                "other": ["feedback"]
            }
            
            labels = label_map.get(request.request_type, ["feedback"])

            linear_issue = await linear_service.create_issue(
                title=f"[Customer Request] {request.title}",
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
            "title": request.title,
            "description": request.description,
            "request_type": request.request_type,
            "priority": request.priority,
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

