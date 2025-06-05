from fastapi import APIRouter, Depends, HTTPException
from utils.logger import logger
from flags.flags import list_flags, is_enabled, get_flag_details
from utils.auth_utils import get_current_user_id_from_jwt



router = APIRouter()



@router.get("/feature-flags")
async def get_feature_flags(user_id: str = Depends(get_current_user_id_from_jwt)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        flags = await list_flags()
        return {"flags": flags}
    except Exception as e:
        logger.error(f"Error fetching feature flags: {str(e)}")
        return {"flags": {}}



@router.get("/feature-flags/{flag_name}")
async def get_feature_flag(flag_name: str, user_id: str = Depends(get_current_user_id_from_jwt)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        enabled = await is_enabled(flag_name)
        details = await get_flag_details(flag_name)
        return {
            "flag_name": flag_name,
            "enabled": enabled,
            "details": details
        }
    except Exception as e:
        logger.error(f"Error fetching feature flag {flag_name}: {str(e)}")
        return {
            "flag_name": flag_name,
            "enabled": False,
            "details": None
        } 