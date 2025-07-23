"""
Auth MFA endpoints for Supabase Phone-based Multi-Factor Authentication (MFA).

Currently, only SMS is supported as a second factor. Users can enroll their phone number for SMS-based 2FA.
No recovery codes are supported, but users can update their phone number for backup.

This API provides endpoints to:
- Enroll a phone number for SMS 2FA
- Create a challenge for a phone factor (sends SMS)
- Verify a challenge with SMS code
- Create and verify a challenge in a single step
- List enrolled factors
- Unenroll a factor
- Get Authenticator Assurance Level (AAL)
"""

import json
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional
import jwt
from datetime import datetime, timezone
from supabase import create_client, Client
from utils.auth_utils import get_current_user_id_from_jwt
from utils.config import config
from utils.logger import logger, structlog

router = APIRouter(prefix="/mfa", tags=["MFA"])

# Initialize Supabase client with anon key for user operations
supabase_url = config.SUPABASE_URL
supabase_anon_key = config.SUPABASE_ANON_KEY

# Cutoff date for new user phone verification requirement
# Users created after this date will be required to have phone verification
# Users created before this date are grandfathered in and not required to verify
PHONE_VERIFICATION_CUTOFF_DATE = datetime(2025, 7, 21, 0, 0, 0, tzinfo=timezone.utc)

def is_phone_verification_mandatory() -> bool:
    """Check if phone verification is mandatory based on environment variable."""
    env_val = os.getenv("PHONE_NUMBER_MANDATORY")
    if env_val is None:
        return False
    return env_val.lower() in ('true', 't', 'yes', 'y', '1')


def get_authenticated_client(request: Request) -> Client:
    """
    Create a Supabase client authenticated with the user's JWT token.
    This approach uses the JWT token directly for server-side authentication.
    """
    # Extract the JWT token from the Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header"
        )

    token = auth_header.split(" ")[1]

    # Extract the refresh token from the custom header
    refresh_token = request.headers.get("X-Refresh-Token")

    # Create a new Supabase client with the anon key
    client = create_client(supabase_url, supabase_anon_key)

    # Set the session with the JWT token
    # For server-side operations, we can use the token directly
    try:
        # Verify the token is valid by getting the user
        user_response = client.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Set the session with both access and refresh tokens
        client.auth.set_session(token, refresh_token)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


# Request/Response Models
class EnrollFactorRequest(BaseModel):
    friendly_name: str = Field(..., description="User-friendly name for the factor")
    phone_number: str = Field(
        ..., description="Phone number in E.164 format (e.g., +1234567890)"
    )


class EnrollFactorResponse(BaseModel):
    id: str
    friendly_name: str
    phone_number: str
    # Note: Supabase response may not include status, created_at, updated_at
    qr_code: Optional[str] = None
    secret: Optional[str] = None


class ChallengeRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to challenge")


class ChallengeResponse(BaseModel):
    id: str
    expires_at: Optional[str] = None
    # Note: Supabase response may not include factor_type, created_at


class VerifyRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to verify")
    challenge_id: str = Field(..., description="ID of the challenge to verify")
    code: str = Field(..., description="SMS code received on phone")


class ChallengeAndVerifyRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to challenge and verify")
    code: str = Field(..., description="SMS code received on phone")


class FactorInfo(BaseModel):
    id: str
    friendly_name: Optional[str] = None
    factor_type: Optional[str] = None
    status: Optional[str] = None
    phone: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ListFactorsResponse(BaseModel):
    factors: List[FactorInfo]


class UnenrollRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to unenroll")


class AALResponse(BaseModel):
    current_level: Optional[str] = None
    next_level: Optional[str] = None
    current_authentication_methods: Optional[List[str]] = None
    # Add action guidance based on AAL status
    action_required: Optional[str] = None
    message: Optional[str] = None
    # Phone verification requirement fields
    phone_verification_required: Optional[bool] = None
    user_created_at: Optional[str] = None
    cutoff_date: Optional[str] = None
    # Computed verification status fields
    verification_required: Optional[bool] = None
    is_verified: Optional[bool] = None
    factors: Optional[List[dict]] = None


@router.post("/enroll", response_model=EnrollFactorResponse)
async def enroll_factor(
    request_data: EnrollFactorRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Enroll a new phone number for SMS-based 2FA.

    Currently only supports 'phone' factor type.
    Phone number must be in E.164 format (e.g., +1234567890).
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_enroll",
        phone_number=request_data.phone_number,
        friendly_name=request_data.friendly_name
    )
    
    try:
        response = client.auth.mfa.enroll(
            {
                "factor_type": "phone",
                "friendly_name": request_data.friendly_name,
                "phone": request_data.phone_number,
            }
        )

        # Build response with defensive field access
        enroll_response = EnrollFactorResponse(
            id=response.id,
            friendly_name=request_data.friendly_name,  # Use request data as fallback
            phone_number=request_data.phone_number,
        )

        # Add optional fields if they exist
        if hasattr(response, "qr_code"):
            enroll_response.qr_code = response.qr_code
        if hasattr(response, "secret"):
            enroll_response.secret = response.secret

        return enroll_response
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to enroll phone factor: {str(e)}"
        )


@router.post("/challenge", response_model=ChallengeResponse)
async def create_challenge(
    request_data: ChallengeRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Create a challenge for an enrolled phone factor.

    This will send an SMS code to the registered phone number.
    The challenge must be verified within the time limit.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_challenge",
        factor_id=request_data.factor_id
    )
    
    try:
        response = client.auth.mfa.challenge(
            {
                "factor_id": request_data.factor_id,
            }
        )

        # Build response with defensive field access
        challenge_response = ChallengeResponse(id=response.id)

        # Add optional fields if they exist
        if hasattr(response, "expires_at"):
            challenge_response.expires_at = response.expires_at

        return challenge_response
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to create SMS challenge: {str(e)}"
        )


@router.post("/verify")
async def verify_challenge(
    request_data: VerifyRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Verify a challenge with an SMS code.

    The challenge must be active and the SMS code must be valid.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_verify",
        factor_id=request_data.factor_id,
        challenge_id=request_data.challenge_id
    )
    
    try:
        logger.info(f"🔵 Starting MFA verification for user {user_id}: "
                   f"factor_id={request_data.factor_id}, "
                   f"challenge_id={request_data.challenge_id}")
        
        # Check AAL BEFORE verification
        try:
            aal_before = client.auth.mfa.get_authenticator_assurance_level()
            logger.info(f"📊 AAL BEFORE verification: "
                       f"current={aal_before.current_level}, "
                       f"next={aal_before.next_level}")
        except Exception as e:
            logger.warning(f"Failed to get AAL before verification: {e}")
        
        # Verify the challenge
        response = client.auth.mfa.verify(
            {
                "factor_id": request_data.factor_id,
                "challenge_id": request_data.challenge_id,
                "code": request_data.code,
            }
        )
        
        logger.info(f"✅ MFA verification successful for user {user_id}")
        logger.info(f"Verification response type: {type(response)}")
        logger.info(f"Verification response attributes: {dir(response)}")
        
        # Check if response has session info
        if hasattr(response, 'session') and response.session:
            logger.info(f"New session info: access_token present: {bool(getattr(response.session, 'access_token', None))}")
            logger.info(f"New session user: {getattr(response.session, 'user', None)}")
        
        # Check AAL AFTER verification
        try:
            aal_after = client.auth.mfa.get_authenticator_assurance_level()
            logger.info(f"📊 AAL AFTER verification: "
                       f"current={aal_after.current_level}, "
                       f"next={aal_after.next_level}")
        except Exception as e:
            logger.warning(f"Failed to get AAL after verification: {e}")
        
        # Check factor status AFTER verification
        try:
            user_response = client.auth.get_user()
            if user_response.user and hasattr(user_response.user, "factors"):
                for factor in user_response.user.factors:
                    if factor.id == request_data.factor_id:
                        logger.info(f"Factor {request_data.factor_id} status after verification: {getattr(factor, 'status', 'unknown')}")
                        break
        except Exception as e:
            logger.warning(f"Failed to check factor status after verification: {e}")

        return {
            "success": True,
            "message": "SMS code verified successfully",
            "session": response,
        }
    except Exception as e:
        logger.error(f"❌ MFA verification failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=400, detail=f"Failed to verify SMS code: {str(e)}"
        )


@router.post("/challenge-and-verify")
async def challenge_and_verify(
    request_data: ChallengeAndVerifyRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Create a challenge and verify it in a single step.

    This will send an SMS code and verify it immediately when provided.
    This is a convenience method that combines challenge creation and verification.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_challenge_and_verify",
        factor_id=request_data.factor_id
    )
    
    try:
        response = client.auth.mfa.challenge_and_verify(
            {"factor_id": request_data.factor_id, "code": request_data.code}
        )

        return {
            "success": True,
            "message": "SMS challenge created and verified successfully",
            "session": response,
        }
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to challenge and verify SMS: {str(e)}"
        )


@router.get("/factors", response_model=ListFactorsResponse)
async def list_factors(
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    List all enrolled factors for the authenticated user.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_list_factors"
    )
    
    try:
        # Get user info which includes factors
        user_response = client.auth.get_user()
        if not user_response.user:
            raise HTTPException(status_code=401, detail="User not found")

        # Extract factors from user data with defensive access
        factors = []
        if hasattr(user_response.user, "factors") and user_response.user.factors:
            for factor in user_response.user.factors:
                # Convert datetime objects to strings for Pydantic validation
                created_at = getattr(factor, "created_at", None)
                if created_at and hasattr(created_at, "isoformat"):
                    created_at = created_at.isoformat()
                
                updated_at = getattr(factor, "updated_at", None)
                if updated_at and hasattr(updated_at, "isoformat"):
                    updated_at = updated_at.isoformat()
                
                factor_info = FactorInfo(
                    id=factor.id if hasattr(factor, "id") else str(factor),
                    friendly_name=getattr(factor, "friendly_name", None),
                    factor_type=getattr(factor, "factor_type", None),
                    status=getattr(factor, "status", None),
                    phone=getattr(factor, "phone", None),
                    created_at=created_at,
                    updated_at=updated_at,
                )
                factors.append(factor_info)

        return ListFactorsResponse(factors=factors)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list factors: {str(e)}")


@router.post("/unenroll")
async def unenroll_factor(
    request_data: UnenrollRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Unenroll a phone factor for the authenticated user.

    This will remove the phone number and invalidate any active sessions if the factor was verified.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_unenroll",
        factor_id=request_data.factor_id
    )
    
    try:
        response = client.auth.mfa.unenroll({"factor_id": request_data.factor_id})

        return {"success": True, "message": "Phone factor unenrolled successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to unenroll phone factor: {str(e)}"
        )


@router.get("/aal", response_model=AALResponse)
async def get_authenticator_assurance_level(
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt),
):
    """
    Get the Authenticator Assurance Level (AAL) for the current session.
    
    This endpoint combines AAL status with phone verification requirements:
    - aal1 -> aal1: User does not have MFA enrolled
    - aal1 -> aal2: User has MFA enrolled but not verified (requires verification)
    - aal2 -> aal2: User has verified their MFA factor
    - aal2 -> aal1: User has disabled MFA (stale JWT, requires reauthentication)
    
    Also includes phone verification requirement based on account creation date.
    """
    structlog.contextvars.bind_contextvars(
        user_id=user_id,
        action="mfa_get_aal"
    )
    
    try:
        # Get the current AAL from Supabase
        response = client.auth.mfa.get_authenticator_assurance_level()
        
        # Extract AAL levels from response first
        current = response.current_level
        next_level = response.next_level
        
        # Get user creation date and factors for phone verification requirement
        user_response = client.auth.get_user()
        if not user_response.user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_created_at = None
        if hasattr(user_response.user, 'created_at') and user_response.user.created_at:
            try:
                # Handle different possible formats for created_at
                created_at_value = user_response.user.created_at
                if isinstance(created_at_value, str):
                    # Parse ISO format string
                    user_created_at = datetime.fromisoformat(created_at_value.replace('Z', '+00:00'))
                elif hasattr(created_at_value, 'isoformat'):
                    # Already a datetime object
                    user_created_at = created_at_value
                    if user_created_at.tzinfo is None:
                        user_created_at = user_created_at.replace(tzinfo=timezone.utc)
                else:
                    logger.warning(f"Unexpected created_at type: {type(created_at_value)}")
            except Exception as e:
                logger.error(f"Failed to parse user created_at: {e}")
                # Fall back to treating as new user for safety
                user_created_at = datetime.now(timezone.utc)
        
        # Determine if this is a new user who needs phone verification
        is_new_user = (
            user_created_at is not None and 
            user_created_at >= PHONE_VERIFICATION_CUTOFF_DATE
        )
        
        # Get factors and compute phone verification status
        factors = []
        phone_factors = []
        has_verified_phone = False
        
        if hasattr(user_response.user, "factors") and user_response.user.factors:
            for factor in user_response.user.factors:
                # Convert datetime objects to strings for JSON serialization
                created_at = getattr(factor, "created_at", None)
                if created_at and hasattr(created_at, "isoformat"):
                    created_at = created_at.isoformat()
                
                updated_at = getattr(factor, "updated_at", None)
                if updated_at and hasattr(updated_at, "isoformat"):
                    updated_at = updated_at.isoformat()
                
                factor_dict = {
                    "id": factor.id if hasattr(factor, "id") else str(factor),
                    "friendly_name": getattr(factor, "friendly_name", None),
                    "factor_type": getattr(factor, "factor_type", None),
                    "status": getattr(factor, "status", None),
                    "phone": getattr(factor, "phone", None),
                    "created_at": created_at,
                    "updated_at": updated_at,
                }
                factors.append(factor_dict)
                
                # Track phone factors
                if factor_dict.get("factor_type") == "phone":
                    phone_factors.append(factor_dict)
                    if factor_dict.get("status") == "verified":
                        has_verified_phone = True
        
        # Determine action required based on AAL combination
        action_required = None
        message = None
        
        if current == "aal1" and next_level == "aal1":
            # User does not have MFA enrolled
            action_required = "none"
            message = "MFA is not enrolled for this account"
        elif current == "aal1" and next_level == "aal2":
            # User has MFA enrolled but needs to verify it
            action_required = "verify_mfa"
            message = "MFA verification required to access full features"
        elif current == "aal2" and next_level == "aal2":
            # User has verified their MFA factor
            action_required = "none"
            message = "MFA is verified and active"
        elif current == "aal2" and next_level == "aal1":
            # User has disabled MFA or has stale JWT
            action_required = "reauthenticate"
            message = "Session needs refresh due to MFA changes"
        else:
            # Unknown combination
            action_required = "unknown"
            message = f"Unknown AAL combination: {current} -> {next_level}"
        
        # Determine verification_required based on AAL status AND grandfathering logic
        verification_required = False
        if is_new_user:
            # New users (created after cutoff date) must have phone verification
            if current == 'aal1' and next_level == 'aal1':
                # No MFA enrolled - new users must enroll
                verification_required = True
            elif action_required == 'verify_mfa':
                # MFA enrolled but needs verification
                verification_required = True
        else:
            # Existing users (grandfathered) - only require verification if AAL demands it
            verification_required = action_required == 'verify_mfa'
        
        phone_verification_required = False and is_new_user and is_phone_verification_mandatory()
        verification_required = False and is_new_user and verification_required and is_phone_verification_mandatory()
        
        logger.info(f"AAL check for user {user_id}: "
                   f"current_level={current}, "
                   f"next_level={next_level}, "
                   f"action_required={action_required}, "
                   f"phone_verification_required={phone_verification_required}, "
                   f"verification_required={verification_required}, "
                   f"is_verified={has_verified_phone}")

        return AALResponse(
            current_level=current,
            next_level=next_level,
            current_authentication_methods=[x.method for x in response.current_authentication_methods],
            action_required=action_required,
            message=message,
            phone_verification_required=phone_verification_required,
            user_created_at=user_created_at.isoformat() if user_created_at else None,
            cutoff_date=PHONE_VERIFICATION_CUTOFF_DATE.isoformat(),
            verification_required=verification_required,
            is_verified=has_verified_phone,
            factors=factors,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get AAL: {str(e)}")
