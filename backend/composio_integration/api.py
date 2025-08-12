from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
from pydantic import BaseModel
from uuid import uuid4
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger
from services.supabase import DBConnection
from datetime import datetime
import os
import hmac
import httpx
import asyncio
import json

from .composio_service import (
    get_integration_service,
)
from .toolkit_service import ToolkitService, ToolsListResponse
from .composio_profile_service import ComposioProfileService, ComposioProfile
from triggers.trigger_service import get_trigger_service, TriggerEvent, TriggerType
from triggers.execution_service import get_execution_service
from .client import ComposioClient

router = APIRouter(prefix="/composio", tags=["composio"])

db: Optional[DBConnection] = None

# Simple in-process cache for apps-with-triggers to improve latency
_APPS_WITH_TRIGGERS_CACHE: Dict[str, Any] = {"ts": 0, "data": None}
_APPS_WITH_TRIGGERS_TTL_SECONDS = 60
_TRIGGERS_BY_APP_CACHE: Dict[str, Dict[str, Any]] = {}
_TRIGGERS_BY_APP_TTL_SECONDS = 60

def initialize(database: DBConnection):
    global db
    db = database
    
COMPOSIO_API_BASE = os.getenv("COMPOSIO_API_BASE", "https://backend.composio.dev")

class IntegrateToolkitRequest(BaseModel):
    toolkit_slug: str
    profile_name: Optional[str] = None
    display_name: Optional[str] = None
    mcp_server_name: Optional[str] = None
    save_as_profile: bool = True

class IntegrationStatusResponse(BaseModel):
    status: str
    toolkit: str
    auth_config_id: str
    connected_account_id: str
    mcp_server_id: str
    final_mcp_url: str
    profile_id: Optional[str] = None
    redirect_url: Optional[str] = None

class CreateProfileRequest(BaseModel):
    toolkit_slug: str
    profile_name: str
    display_name: Optional[str] = None
    mcp_server_name: Optional[str] = None
    is_default: bool = False
    initiation_fields: Optional[Dict[str, str]] = None

class ToolsListRequest(BaseModel):
    toolkit_slug: str
    limit: int = 50
    cursor: Optional[str] = None

class ProfileResponse(BaseModel):
    profile_id: str
    profile_name: str
    display_name: str
    toolkit_slug: str
    toolkit_name: str
    mcp_url: str
    redirect_url: Optional[str] = None
    is_connected: bool
    is_default: bool
    created_at: str

    @classmethod
    def from_composio_profile(cls, profile: ComposioProfile) -> "ProfileResponse":
        return cls(
            profile_id=profile.profile_id,
            profile_name=profile.profile_name,
            display_name=profile.display_name,
            toolkit_slug=profile.toolkit_slug,
            toolkit_name=profile.toolkit_name,
            mcp_url=profile.mcp_url,
            redirect_url=profile.redirect_url,
            is_connected=profile.is_connected,
            is_default=profile.is_default,
            created_at=profile.created_at.isoformat() if profile.created_at else datetime.now().isoformat()
        )


@router.get("/categories")
async def list_categories(
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        logger.info("Fetching Composio categories")
        
        toolkit_service = ToolkitService()
        categories = await toolkit_service.list_categories()
        
        return {
            "success": True,
            "categories": [cat.dict() for cat in categories],
            "total": len(categories)
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch categories: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch categories: {str(e)}")


@router.get("/toolkits")
async def list_toolkits(
    limit: int = Query(100, le=500),
    cursor: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        logger.info(f"Fetching Composio toolkits with limit: {limit}, cursor: {cursor}, search: {search}, category: {category}")
        
        service = get_integration_service()
        
        if search:
            result = await service.search_toolkits(search, category=category, limit=limit, cursor=cursor)
        else:
            result = await service.list_available_toolkits(limit, cursor=cursor, category=category)
        
        return {
            "success": True,
            "toolkits": [toolkit.dict() for toolkit in result.get('items', [])],
            "total_items": result.get('total_items', 0),
            "total_pages": result.get('total_pages', 0),
            "current_page": result.get('current_page', 1),
            "next_cursor": result.get('next_cursor'),
            "has_more": result.get('next_cursor') is not None
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch toolkits: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch toolkits: {str(e)}")


@router.get("/toolkits/{toolkit_slug}/details")
async def get_toolkit_details(
    toolkit_slug: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        logger.info(f"Fetching detailed toolkit info for: {toolkit_slug}")
        
        toolkit_service = ToolkitService()
        detailed_toolkit = await toolkit_service.get_detailed_toolkit_info(toolkit_slug)
        
        if not detailed_toolkit:
            raise HTTPException(status_code=404, detail=f"Toolkit {toolkit_slug} not found")
        
        return {
            "success": True,
            "toolkit": detailed_toolkit.dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch toolkit details for {toolkit_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch toolkit details: {str(e)}")


@router.post("/integrate", response_model=IntegrationStatusResponse)
async def integrate_toolkit(
    request: IntegrateToolkitRequest,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> IntegrationStatusResponse:
    try:
        integration_user_id = str(uuid4())
        logger.info(f"Generated integration user_id: {integration_user_id} for account: {current_user_id}")
        
        service = get_integration_service(db_connection=db)
        result = await service.integrate_toolkit(
            toolkit_slug=request.toolkit_slug,
            account_id=current_user_id,
            user_id=integration_user_id,
            profile_name=request.profile_name,
            display_name=request.display_name,
            mcp_server_name=request.mcp_server_name,
            save_as_profile=request.save_as_profile
        )
        
        return IntegrationStatusResponse(
            status="integrated",
            toolkit=result.toolkit.name,
            auth_config_id=result.auth_config.id,
            connected_account_id=result.connected_account.id,
            mcp_server_id=result.mcp_server.id,
            final_mcp_url=result.final_mcp_url,
            profile_id=result.profile_id,
            redirect_url=result.connected_account.redirect_url
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Integration failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profiles", response_model=ProfileResponse)
async def create_profile(
    request: CreateProfileRequest,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> ProfileResponse:
    try:
        integration_user_id = str(uuid4())
        logger.info(f"Generated integration user_id: {integration_user_id} for account: {current_user_id}")
        
        service = get_integration_service(db_connection=db)
        result = await service.integrate_toolkit(
            toolkit_slug=request.toolkit_slug,
            account_id=current_user_id,
            user_id=integration_user_id,
            profile_name=request.profile_name,
            display_name=request.display_name,
            mcp_server_name=request.mcp_server_name,
            save_as_profile=True,
            initiation_fields=request.initiation_fields
        )
        
        logger.info(f"Integration result for {request.toolkit_slug}: redirect_url = {result.connected_account.redirect_url}")
        profile_service = ComposioProfileService(db)
        profiles = await profile_service.get_profiles(current_user_id, request.toolkit_slug)

        created_profile = None
        for profile in profiles:
            if profile.profile_name == request.profile_name:
                created_profile = profile
                break
        
        if not created_profile:
            raise HTTPException(status_code=500, detail="Profile created but not found")
        
        logger.info(f"Returning profile response with redirect_url: {created_profile.redirect_url}")
        
        return ProfileResponse.from_composio_profile(created_profile)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profiles")
async def get_profiles(
    toolkit_slug: Optional[str] = Query(None),
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        profiles = await profile_service.get_profiles(current_user_id, toolkit_slug)
        
        profile_responses = [ProfileResponse.from_composio_profile(profile) for profile in profiles]
        
        return {
            "success": True,
            "profiles": profile_responses
        }
        
    except Exception as e:
        logger.error(f"Failed to get profiles: {e}", exc_info=True)
        return {
            "success": False,
            "profiles": [],
            "error": str(e)
        }


@router.get("/profiles/{profile_id}/mcp-config")
async def get_profile_mcp_config(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        mcp_config = await profile_service.get_mcp_config_for_agent(profile_id)
        
        return {
            "success": True,
            "mcp_config": mcp_config,
            "profile_id": profile_id
        }
        
    except Exception as e:
        logger.error(f"Failed to get MCP config for profile {profile_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get MCP config: {str(e)}")


@router.get("/profiles/{profile_id}")
async def get_profile_info(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        profile = await profile_service.get_profile(profile_id, current_user_id)
        
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        return {
            "success": True,
            "profile": {
                "profile_id": profile.profile_id,
                "profile_name": profile.profile_name,
                "toolkit_name": profile.toolkit_name,
                "toolkit_slug": profile.toolkit_slug,
                "created_at": profile.created_at.isoformat() if profile.created_at else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get profile info for {profile_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get profile info: {str(e)}")


@router.get("/integration/{connected_account_id}/status")
async def get_integration_status(
    connected_account_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        service = get_integration_service()
        status = await service.get_integration_status(connected_account_id)
        return {"connected_account_id": connected_account_id, **status}
    except Exception as e:
        logger.error(f"Failed to get status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/profiles/{profile_id}/discover-tools")
async def discover_composio_tools(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    try:
        profile_service = ComposioProfileService(db)
        config = await profile_service.get_profile_config(profile_id)
        
        if config.get('type') != 'composio':
            raise HTTPException(status_code=400, detail="Not a Composio profile")
        
        mcp_url = config.get('mcp_url')
        if not mcp_url:
            raise HTTPException(status_code=400, detail="Profile has no MCP URL")
        
        from mcp_module.mcp_service import mcp_service
        
        result = await mcp_service.discover_custom_tools(
            request_type="http",
            config={"url": mcp_url}
        )
        
        if not result.success:
            raise HTTPException(status_code=500, detail=f"Failed to discover tools: {result.message}")
        
        logger.info(f"Discovered {len(result.tools)} tools from Composio profile {profile_id}")
        
        return {
            "success": True,
            "profile_id": profile_id,
            "toolkit_name": config.get('toolkit_name', 'Unknown'),
            "tools": result.tools,
            "total_tools": len(result.tools)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to discover tools for profile {profile_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover-tools/{profile_id}")
async def discover_tools_post(
    profile_id: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
) -> Dict[str, Any]:
    return await discover_composio_tools(profile_id, current_user_id)

@router.get("/toolkits/{toolkit_slug}/icon")
async def get_toolkit_icon(
    toolkit_slug: str,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        toolkit_service = ToolkitService()
        icon_url = await toolkit_service.get_toolkit_icon(toolkit_slug)
        
        if icon_url:
            return {
                "success": True,
                "toolkit_slug": toolkit_slug,
                "icon_url": icon_url
            }
        else:
            return {
                "success": False,
                "toolkit_slug": toolkit_slug,
                "icon_url": None,
                "message": "Icon not found"
            }
    
    except Exception as e:
        logger.error(f"Error getting toolkit icon: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/tools/list")
async def list_toolkit_tools(
    request: ToolsListRequest,
    current_user_id: str = Depends(get_current_user_id_from_jwt)
):
    try:
        logger.info(f"User {current_user_id} requesting tools for toolkit: {request.toolkit_slug}")
        
        toolkit_service = ToolkitService()
        tools_response = await toolkit_service.get_toolkit_tools(
            toolkit_slug=request.toolkit_slug,
            limit=request.limit,
            cursor=request.cursor
        )
        
        return {
            "success": True,
            "tools": [tool.dict() for tool in tools_response.items],
            "total_items": tools_response.total_items,
            "current_page": tools_response.current_page,
            "total_pages": tools_response.total_pages,
            "next_cursor": tools_response.next_cursor
        }
        
    except Exception as e:
        logger.error(f"Failed to list toolkit tools for {request.toolkit_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get toolkit tools: {str(e)}")


## REMOVED: /triggers/types


## REMOVED: /triggers/types/enum


@router.get("/triggers/apps")
async def list_apps_with_triggers(
    user_id: str = Depends(get_current_user_id_from_jwt),
) -> Dict[str, Any]:
    """Return toolkits that have at least one available trigger, with logo, slug, name."""
    try:
        # Cache hit
        now_ts = int(datetime.utcnow().timestamp())
        cached = _APPS_WITH_TRIGGERS_CACHE.get("data")
        if cached and (now_ts - int(_APPS_WITH_TRIGGERS_CACHE.get("ts", 0)) < _APPS_WITH_TRIGGERS_TTL_SECONDS):
            return cached

        api_key = os.getenv("COMPOSIO_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="COMPOSIO_API_KEY not configured")

        # Try Redis cache first
        try:
            from services import redis as redis_service
            redis_client = await redis_service.get_client()
            cache_key = "composio:apps-with-triggers:v1"
            cached_json = await redis_client.get(cache_key)
            if cached_json:
                parsed = json.loads(cached_json)
                _APPS_WITH_TRIGGERS_CACHE["data"] = parsed
                _APPS_WITH_TRIGGERS_CACHE["ts"] = now_ts
                return parsed
        except Exception:
            pass

        # HTTP-only: list trigger types and derive toolkits
        headers = {"x-api-key": api_key}
        url = f"{COMPOSIO_API_BASE}/api/v3/triggers_types"
        params = {"limit": 1000}
        items = []
        async with httpx.AsyncClient(timeout=20) as client_http:
            while True:
                resp = await client_http.get(url, headers=headers, params=params)
                resp.raise_for_status()
                data = resp.json()
                page_items = data.get("items") if isinstance(data, dict) else data
                if page_items is None:
                    page_items = data if isinstance(data, list) else []
                items.extend(page_items)
                next_cursor = None
                if isinstance(data, dict):
                    next_cursor = data.get("next_cursor") or data.get("nextCursor")
                if not next_cursor:
                    break
                params["cursor"] = next_cursor

        # Completed fetch of trigger types (HTTP)

        # Build toolkit map directly from triggers payload (preserves logos like Slack)
        toolkits_map: Dict[str, Dict[str, Any]] = {}
        for it in items:
            x = it if isinstance(it, dict) else (it.__dict__ if hasattr(it, "__dict__") else None)
            if not isinstance(x, dict):
                continue
            tk = x.get("toolkit")
            if isinstance(tk, dict):
                slug = (tk.get("slug") or tk.get("name") or "").strip()
                if not slug:
                    continue
                key = slug.lower()
                name = (tk.get("name") or slug).strip()
                logo = tk.get("logo")
                existing = toolkits_map.get(key)
                if not existing:
                    toolkits_map[key] = {"slug": slug, "name": name, "logo": logo}
                else:
                    # Upgrade logo if previously missing
                    if not existing.get("logo") and logo:
                        existing["logo"] = logo
                continue
            # Fallback to flat keys
            for k in ("toolkit_slug", "toolkitSlug", "toolkit_name", "toolkitName"):
                val = x.get(k)
                if isinstance(val, str) and val.strip():
                    key = val.strip().lower()
                    if key not in toolkits_map:
                        toolkits_map[key] = {"slug": val.strip(), "name": val.strip().capitalize(), "logo": None}
                    break

        # Fallback enrichment with ToolkitService only for missing logos
        missing = [slug for slug, info in toolkits_map.items() if not info.get("logo")]
        if missing:
            toolkit_service = ToolkitService()
            tk_resp = await toolkit_service.list_toolkits(limit=500)
            tk_items = tk_resp.get("items", [])
            tk_by_slug = {t.slug.lower(): t for t in tk_items if hasattr(t, 'slug')}
            for slug in missing:
                t = tk_by_slug.get(slug)
                if t and t.logo:
                    toolkits_map[slug]["logo"] = t.logo

        # Prepare final list
        result_items = sorted(toolkits_map.values(), key=lambda x: x["slug"].lower())

        # No extra per-icon fetch to keep latency down
        response = {"success": True, "items": result_items, "total": len(result_items)}
        _APPS_WITH_TRIGGERS_CACHE["data"] = response
        _APPS_WITH_TRIGGERS_CACHE["ts"] = now_ts

        # Store in Redis cache as well
        try:
            if redis_client:
                await redis_client.set(cache_key, json.dumps(response), ex=_APPS_WITH_TRIGGERS_TTL_SECONDS)
        except Exception:
            pass
        return response

    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch Composio triggers/apps: {e}")
        raise HTTPException(status_code=502, detail="Composio API error")
    except Exception as e:
        logger.error(f"Error building apps-with-triggers list: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/triggers/apps/{toolkit_slug}")
async def list_triggers_for_app(
    toolkit_slug: str,
    user_id: str = Depends(get_current_user_id_from_jwt),
) -> Dict[str, Any]:
    """Return full trigger definitions for a given toolkit (slug), including config/payload and toolkit logo (HTTP-only)."""
    try:
        api_key = os.getenv("COMPOSIO_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="COMPOSIO_API_KEY not configured")

        # Per-toolkit cache
        now_ts = int(datetime.utcnow().timestamp())
        cache_entry = _TRIGGERS_BY_APP_CACHE.get(toolkit_slug.lower())
        if cache_entry and (now_ts - int(cache_entry.get("ts", 0)) < _TRIGGERS_BY_APP_TTL_SECONDS):
            return cache_entry["data"]

        # HTTP-only: try server-side toolkit filter first, then fetch all and filter client-side
        headers = {"x-api-key": api_key}
        url = f"{COMPOSIO_API_BASE}/api/v3/triggers_types"
        items = []
        async with httpx.AsyncClient(timeout=20) as client_http:
            # Try param filter
            params = {"limit": 1000, "toolkits": toolkit_slug}
            resp = await client_http.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items") if isinstance(data, dict) else data
            if items is None:
                items = data if isinstance(data, list) else []
            # Fallback to fetch all pages then filter client-side
            if not items:
                logger.info("[Composio HTTP] toolkit filter returned 0, fetching all and filtering", toolkit=toolkit_slug)
                params_all = {"limit": 1000}
                items = []
                while True:
                    resp_all = await client_http.get(url, headers=headers, params=params_all)
                    resp_all.raise_for_status()
                    data_all = resp_all.json()
                    page_items = data_all.get("items") if isinstance(data_all, dict) else data_all
                    if page_items is None:
                        page_items = data_all if isinstance(data_all, list) else []
                    items.extend(page_items)
                    next_cursor = None
                    if isinstance(data_all, dict):
                        next_cursor = data_all.get("next_cursor") or data_all.get("nextCursor")
                    if not next_cursor:
                        break
                    params_all["cursor"] = next_cursor

        # Completed fetch of trigger types for toolkit (HTTP)

        # Prepare toolkit info
        toolkit_service = ToolkitService()
        tk_resp = await toolkit_service.list_toolkits(limit=500)
        tk_items = tk_resp.get("items", [])
        tk_by_slug = {t.slug.lower(): t for t in tk_items if hasattr(t, 'slug')}
        tk = tk_by_slug.get(toolkit_slug.lower())
        tk_info = {"slug": toolkit_slug, "name": (tk.name if tk else toolkit_slug), "logo": (tk.logo if tk else None)}

        def match_toolkit(x: Dict[str, Any]) -> bool:
            tkv = x.get("toolkit")
            if isinstance(tkv, dict):
                sl = (tkv.get("slug") or tkv.get("name") or "").lower()
                if sl == toolkit_slug.lower():
                    return True
            for key in ("toolkit_slug", "toolkitSlug", "toolkit_name"):
                val = x.get(key)
                if isinstance(val, str) and val.lower() == toolkit_slug.lower():
                    return True
            return False

        result_items = []
        matched_count = 0
        for it in items:
            x = it if isinstance(it, dict) else (it.__dict__ if hasattr(it, "__dict__") else None)
            if not isinstance(x, dict):
                continue
            if not match_toolkit(x):
                continue
            matched_count += 1
            result_items.append({
                "slug": x.get("slug"),
                "name": x.get("name"),
                "description": x.get("description"),
                "type": x.get("type") or x.get("delivery_type") or "webhook",
                "instructions": x.get("instructions") or "",
                "toolkit": tk_info,
                "config": x.get("config") or {},
                "payload": x.get("payload") or {},
            })

        # Completed filtering of triggers for toolkit

        return {"success": True, "items": result_items, "toolkit": tk_info, "total": len(result_items)}

    except HTTPException:
        raise
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch triggers for app {toolkit_slug}: {e}")
        raise HTTPException(status_code=502, detail="Composio API error")
    except Exception as e:
        logger.error(f"Error listing triggers for app {toolkit_slug}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
class CreateComposioTriggerRequest(BaseModel):
    agent_id: str
    profile_id: str
    slug: str
    trigger_config: Dict[str, Any]
    route: str  # 'agent' | 'workflow'
    name: Optional[str] = None
    agent_prompt: Optional[str] = None
    workflow_id: Optional[str] = None
    workflow_input: Optional[Dict[str, Any]] = None


## REMOVED: /triggers/type/{slug}


@router.post("/triggers/create")
async def create_composio_trigger(req: CreateComposioTriggerRequest, current_user_id: str = Depends(get_current_user_id_from_jwt)) -> Dict[str, Any]:
    try:
        # Verify agent belongs to current user
        client_db = await db.client
        agent_check = await client_db.table('agents').select('agent_id').eq('agent_id', req.agent_id).eq('account_id', current_user_id).execute()
        if not agent_check.data:
            raise HTTPException(status_code=404, detail="Agent not found or access denied")

        # Fetch composio user_id from profile config
        profile_service = ComposioProfileService(db)
        profile_config = await profile_service.get_profile_config(req.profile_id)
        composio_user_id = profile_config.get("user_id")
        if not composio_user_id:
            raise HTTPException(status_code=400, detail="Composio profile is missing user_id")

        client = ComposioClient.get_client()
        # Create composio trigger remotely
        created = client.triggers.create(
            slug=req.slug,
            user_id=composio_user_id,
            trigger_config=req.trigger_config,
        )

        # Extract composio trigger id
        if hasattr(created, "id"):
            composio_trigger_id = getattr(created, "id")
        elif isinstance(created, dict):
            composio_trigger_id = created.get("id") or created.get("trigger_id")
        else:
            composio_trigger_id = getattr(created, "trigger_id", None)

        if not composio_trigger_id:
            raise HTTPException(status_code=500, detail="Failed to get Composio trigger id from response")

        # Build Suna trigger config
        suna_config: Dict[str, Any] = {
            "composio_trigger_id": composio_trigger_id,
            "trigger_slug": req.slug,
            "execution_type": req.route if req.route in ("agent", "workflow") else "agent",
            "profile_id": req.profile_id,
        }
        if suna_config["execution_type"] == "agent":
            if req.agent_prompt:
                suna_config["agent_prompt"] = req.agent_prompt
        else:
            if not req.workflow_id:
                raise HTTPException(status_code=400, detail="workflow_id is required for workflow route")
            suna_config["workflow_id"] = req.workflow_id
            if req.workflow_input:
                suna_config["workflow_input"] = req.workflow_input

        # Create Suna trigger
        trigger_service = get_trigger_service(db)
        trigger = await trigger_service.create_trigger(
            agent_id=req.agent_id,
            provider_id="composio",
            name=req.name or f"{req.slug}",
            config=suna_config,
            description=f"Composio event: {req.slug}"
        )

        base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
        webhook_url = f"{base_url}/api/composio/webhook"

        return {
            "success": True,
            "trigger_id": trigger.trigger_id,
            "agent_id": trigger.agent_id,
            "provider": "composio",
            "composio_trigger_id": composio_trigger_id,
            "slug": req.slug,
            "webhook_url": webhook_url,
            "config": trigger.config,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create Composio trigger: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def composio_webhook(request: Request):
    """Shared Composio webhook endpoint. Verifies secret, matches triggers, and enqueues execution."""
    try:
        secret = os.getenv("COMPOSIO_WEBHOOK_SECRET")
        if not secret:
            logger.error("COMPOSIO_WEBHOOK_SECRET is not configured")
            raise HTTPException(status_code=500, detail="Webhook secret not configured")

        incoming_secret = (
            request.headers.get("x-composio-secret")
            or request.headers.get("X-Composio-Secret")
            or request.headers.get("x-trigger-secret")
            or ""
        )
        if not hmac.compare_digest(incoming_secret, secret):
            logger.warning("Invalid Composio webhook secret")
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            payload = await request.json()
        except Exception:
            payload = {}

        composio_trigger_id = payload.get("id")  # Trigger instance nano id
        provider_event_id = (
            payload.get("eventId") or payload.get("payload", {}).get("id") or payload.get("id")
        )

        client = await db.client

        if not composio_trigger_id:
            logger.warning("Composio webhook missing trigger id in payload.id")
            return JSONResponse(status_code=400, content={"success": False, "error": "Missing composio trigger id"})

        # Fetch all active EVENT triggers and filter by provider 'composio' and composio_trigger_id in config (in Python)
        try:
            res = await client.table("agent_triggers").select("*").eq("trigger_type", "event").eq("is_active", True).execute()
            rows = res.data or []
        except Exception as e:
            logger.error(f"Error fetching agent_triggers: {e}")
            rows = []

        matched = []
        for row in rows:
            cfg = row.get("config") or {}
            if not isinstance(cfg, dict):
                continue
            if cfg.get("provider_id") == "composio" and cfg.get("composio_trigger_id") == composio_trigger_id:
                matched.append(row)

        if not matched:
            logger.warning(f"No active triggers found for Composio trigger {composio_trigger_id}")
            return JSONResponse(content={"success": True, "matched_triggers": 0})

        trigger_service = get_trigger_service(db)
        execution_service = get_execution_service(db)

        executed = 0
        for row in matched:
            trigger_id = row.get("trigger_id")
            if not trigger_id:
                continue
            result = await trigger_service.process_trigger_event(trigger_id, payload)
            if result.success and (result.should_execute_agent or result.should_execute_workflow):
                trigger = await trigger_service.get_trigger(trigger_id)
                if not trigger:
                    continue
                event = TriggerEvent(
                    trigger_id=trigger_id,
                    agent_id=trigger.agent_id,
                    trigger_type=TriggerType.EVENT,
                    raw_data=payload,
                )
                await execution_service.execute_trigger_result(
                    agent_id=trigger.agent_id,
                    trigger_result=result,
                    trigger_event=event,
                )
                executed += 1

        return JSONResponse(content={
            "success": True,
            "matched_triggers": len(matched),
            "executed": executed,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling Composio webhook: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})


@router.get("/health")
async def health_check() -> Dict[str, str]:
    try:
        from .client import ComposioClient
        ComposioClient.get_client()
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))
