from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from utils.auth_utils import verify_admin_api_key
from utils.suna_default_agent_service import SunaDefaultAgentService
from utils.logger import logger

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/suna-agents/install-user/{account_id}")
async def admin_install_suna_for_user(
    account_id: str,
    replace_existing: bool = False,
    _: bool = Depends(verify_admin_api_key)
):
    """Install Suna agent for a specific user account.
    
    Args:
        account_id: The account ID to install Suna agent for
        replace_existing: Whether to replace existing Suna agent if found
        
    Returns:
        Success message with agent_id if successful
        
    Raises:
        HTTPException: If installation fails
    """
    logger.info(f"Admin installing Suna agent for user: {account_id}")
    
    service = SunaDefaultAgentService()
    agent_id = await service.install_suna_agent_for_user(account_id, replace_existing)
    
    if agent_id:
        return {
            "success": True,
            "message": f"Successfully installed Suna agent for user {account_id}",
            "agent_id": agent_id
        }
    else:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to install Suna agent for user {account_id}"
        ) 