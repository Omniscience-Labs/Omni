from fastapi import APIRouter
from utils.local_api_keys import save_local_api_keys, get_local_api_keys
from utils.config import config, EnvMode
from fastapi import HTTPException
from typing import Dict
from utils.constants import PROVIDERS

router = APIRouter(tags=["local-llm-keys"])

@router.get("/local-llm-keys")
def get_llm_keys() -> Dict[str, str]:

    if config.ENV_MODE != EnvMode.LOCAL:
        raise HTTPException(status_code=403, detail="API key management only available in local mode")
    
    providers = [f"{provider}_API_KEY" for provider in PROVIDERS]
    llm_keys = get_local_api_keys(providers)
    return llm_keys

@router.post("/local-llm-keys")
def save_local_llm_keys(request: Dict[str, str]) -> Dict[str, str]:
    if config.ENV_MODE != EnvMode.LOCAL:
        raise HTTPException(status_code=403, detail="API key management only available in local mode")
    
    key_saved = save_local_api_keys(request)
    if key_saved:
        return {"message": "API keys saved successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to save API keys")