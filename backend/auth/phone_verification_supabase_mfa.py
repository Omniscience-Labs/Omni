"""
Auth MFA endpoints for Supabase TOTP-based Multi-Factor Authentication (MFA).

Currently, only TOTP is supported as a second factor. Users can enroll up to 10 TOTP factors.
No recovery codes are supported, but users can enroll multiple TOTP factors for backup.

This API provides endpoints to:
- Enroll a TOTP factor
- Create a challenge for a factor
- Verify a challenge
- Create and verify a challenge in a single step
- List enrolled factors
- Unenroll a factor
- Get Authenticator Assurance Level (AAL)
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional
import jwt
from supabase import create_client, Client
from utils.auth_utils import get_current_user_id_from_jwt
from utils.config import config

router = APIRouter(prefix="/mfa", tags=["MFA"])

# Initialize Supabase client with anon key for user operations
supabase_url = config.SUPABASE_URL
supabase_anon_key = config.SUPABASE_ANON_KEY

def get_authenticated_client(request: Request) -> Client:
    """
    Create a Supabase client authenticated with the user's JWT token.
    This approach uses the JWT token directly for server-side authentication.
    """
    # Extract the JWT token from the Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = auth_header.split(" ")[1]
    
    # Create a new Supabase client with the anon key
    client = create_client(supabase_url, supabase_anon_key)
    
    # Set the session with the JWT token
    # For server-side operations, we can use the token directly
    try:
        # Verify the token is valid by getting the user
        user_response = client.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Set the session with the token
        client.auth.set_session(token, None)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

# Request/Response Models
class EnrollFactorRequest(BaseModel):
    factor_type: str = Field(default="totp", description="Type of factor to enroll")
    friendly_name: str = Field(..., description="User-friendly name for the factor")

class EnrollFactorResponse(BaseModel):
    id: str
    friendly_name: str
    factor_type: str
    status: str
    created_at: str
    updated_at: str

class ChallengeRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to challenge")

class ChallengeResponse(BaseModel):
    id: str
    factor_type: str
    created_at: str
    expires_at: str

class VerifyRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to verify")
    challenge_id: str = Field(..., description="ID of the challenge to verify")
    code: str = Field(..., description="TOTP code to verify")

class ChallengeAndVerifyRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to challenge and verify")
    code: str = Field(..., description="TOTP code to verify")

class FactorInfo(BaseModel):
    id: str
    friendly_name: str
    factor_type: str
    status: str
    created_at: str
    updated_at: str

class ListFactorsResponse(BaseModel):
    factors: List[FactorInfo]

class UnenrollRequest(BaseModel):
    factor_id: str = Field(..., description="ID of the factor to unenroll")

class AALResponse(BaseModel):
    current_level: str
    next_level: str
    current_authentication_methods: List[str]

@router.post("/enroll", response_model=EnrollFactorResponse)
async def enroll_factor(
    request_data: EnrollFactorRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Enroll a new TOTP factor for the authenticated user.
    
    Currently only supports 'totp' factor type.
    Users can enroll up to 10 TOTP factors.
    """
    try:
        response = client.auth.mfa.enroll({
            "factor_type": request_data.factor_type,
            "friendly_name": request_data.friendly_name
        })
        
        return EnrollFactorResponse(
            id=response.id,
            friendly_name=response.friendly_name,
            factor_type=response.type,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to enroll factor: {str(e)}")

@router.post("/challenge", response_model=ChallengeResponse)
async def create_challenge(
    request_data: ChallengeRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Create a challenge for an enrolled factor.
    
    The challenge must be verified within the time limit.
    """
    try:
        response = client.auth.mfa.challenge({
            "factor_id": request_data.factor_id,
        })
        
        return ChallengeResponse(
            id=response.id,
            factor_type=response.factor_type,
            expires_at=response.expires_at
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create challenge: {str(e)}")

@router.post("/verify")
async def verify_challenge(
    request_data: VerifyRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Verify a challenge with a TOTP code.
    
    The challenge must be active and the code must be valid.
    """
    try:
        response = client.auth.mfa.verify({
            "factor_id": request_data.factor_id,
            "challenge_id": request_data.challenge_id,
            "code": request_data.code
        })
        
        return {
            "success": True,
            "message": "Challenge verified successfully",
            "session": response,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to verify challenge: {str(e)}")

@router.post("/challenge-and-verify")
async def challenge_and_verify(
    request_data: ChallengeAndVerifyRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Create a challenge and verify it in a single step.
    
    This is a convenience method that combines challenge creation and verification.
    """
    try:
        response = client.auth.mfa.challenge_and_verify({
            "factor_id": request_data.factor_id,
            "code": request_data.code
        })
        
        return {
            "success": True,
            "message": "Challenge created and verified successfully",
            "session": response,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to challenge and verify: {str(e)}")

@router.get("/factors", response_model=ListFactorsResponse)
async def list_factors(
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    List all enrolled factors for the authenticated user.
    """
    try:
        # Get the current session to access user's factors
        session = client.auth.get_session()
        if not session:
            raise HTTPException(status_code=401, detail="No active session")
        
        # Get user info which includes factors
        user_response = client.auth.get_user()
        if not user_response.user:
            raise HTTPException(status_code=401, detail="User not found")
        
        # Extract factors from user data
        factors = []
        if hasattr(user_response.user, 'factors') and user_response.user.factors:
            for factor in user_response.user.factors:
                factors.append(FactorInfo(
                    id=factor.id,
                    friendly_name=factor.friendly_name,
                    factor_type=factor.factor_type,
                    status=factor.status,
                    created_at=factor.created_at,
                    updated_at=factor.updated_at
                ))
        
        return ListFactorsResponse(factors=factors)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list factors: {str(e)}")

@router.delete("/unenroll")
async def unenroll_factor(
    request_data: UnenrollRequest,
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Unenroll a factor for the authenticated user.
    
    This will remove the factor and invalidate any active sessions if the factor was verified.
    """
    try:
        response = client.auth.mfa.unenroll({
            "factor_id": request_data.factor_id
        })
        
        return {
            "success": True,
            "message": "Factor unenrolled successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to unenroll factor: {str(e)}")

@router.get("/aal", response_model=AALResponse)
async def get_authenticator_assurance_level(
    client: Client = Depends(get_authenticated_client),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get the Authenticator Assurance Level (AAL) for the current session.
    
    AAL1: First factor only (email/password, OAuth)
    AAL2: Second factor required (TOTP)
    """
    try:
        response = client.auth.mfa.get_authenticator_assurance_level()
        
        return AALResponse(
            current_level=response.current_level,
            next_level=response.next_level,
            current_authentication_methods=response.current_authentication_methods
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get AAL: {str(e)}")
