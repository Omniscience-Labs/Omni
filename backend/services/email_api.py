from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
import asyncio
from services.email import email_service
from utils.logger import logger

router = APIRouter()

class SendWelcomeEmailRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class EmailResponse(BaseModel):
    success: bool
    message: str

@router.post("/send-welcome-email", response_model=EmailResponse)
async def send_welcome_email(request: SendWelcomeEmailRequest):
    try:
        logger.info(f"Sending welcome email to {request.email}")
        success = email_service.send_welcome_email(
            user_email=request.email,
            user_name=request.name
        )
        
        if success:
            return EmailResponse(
                success=True,
                message="Welcome email sent successfully"
            )
        else:
            return EmailResponse(
                success=False,
                message="Failed to send welcome email"
            )
            
    except Exception as e:
        logger.error(f"Error sending welcome email to {request.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while sending email"
        )

@router.post("/send-welcome-email-background", response_model=EmailResponse)
async def send_welcome_email_background(request: SendWelcomeEmailRequest):
    try:
        logger.info(f"Queuing welcome email for {request.email}")
        
        def send_email():
            return email_service.send_welcome_email(
                user_email=request.email,
                user_name=request.name
            )
        
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(send_email)
        
        return EmailResponse(
            success=True,
            message="Welcome email queued for sending"
        )
            
    except Exception as e:
        logger.error(f"Error queuing welcome email for {request.email}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while queuing email"
        ) 
