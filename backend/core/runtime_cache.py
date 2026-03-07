"""
Runtime caching layer for latency optimization.

3-tier caching strategy:
- L1: In-memory static config (Suna/Omni defaults) - loaded once at startup, ~0ms
- L2: Redis cache (user MCPs, agent configs, project metadata) - ~10-50ms
- L3: Database (full queries) - ~500-1000ms, only on cache miss

All caches use explicit invalidation on data changes, with TTL as safety net.
"""
import json
import time
from typing import Dict, Any, Optional, List
from core.utils.logger import logger


# ============================================================================
# L1: STATIC CONFIG - Loaded once at startup, never expires
# Python code identical across all workers - safe to keep in memory
# ============================================================================
_SUNA_STATIC_CONFIG: Optional[Dict[str, Any]] = None
_SUNA_STATIC_LOADED = False

_OMNI_STATIC_CONFIG: Optional[Dict[str, Any]] = None
_OMNI_STATIC_LOADED = False


def get_static_suna_config() -> Optional[Dict[str, Any]]:
    """Get the static Suna config (loaded once at startup)."""
    return _SUNA_STATIC_CONFIG


def get_static_omni_config() -> Optional[Dict[str, Any]]:
    """Get the static Omni config (loaded once at startup)."""
    return _OMNI_STATIC_CONFIG


def load_static_suna_config() -> Dict[str, Any]:
    """
    Load Suna's static config into memory ONCE.
    Includes: system_prompt, model, agentpress_tools, restrictions.
    """
    global _SUNA_STATIC_CONFIG, _SUNA_STATIC_LOADED

    if _SUNA_STATIC_LOADED:
        return _SUNA_STATIC_CONFIG

    from core.suna_config import SUNA_CONFIG
    from core.config_helper import _extract_agentpress_tools_for_run

    _SUNA_STATIC_CONFIG = {
        'system_prompt': SUNA_CONFIG['system_prompt'],
        'model': SUNA_CONFIG['model'],
        'agentpress_tools': _extract_agentpress_tools_for_run(SUNA_CONFIG['agentpress_tools']),
        'centrally_managed': True,
        'is_suna_default': True,
        'is_omni_default': False,
        'restrictions': {
            'system_prompt_editable': False,
            'tools_editable': False,
            'name_editable': False,
            'description_editable': False,
            'mcps_editable': True
        }
    }

    _SUNA_STATIC_LOADED = True
    logger.info(f"Loaded static Suna config into memory (prompt: {len(_SUNA_STATIC_CONFIG['system_prompt'])} chars)")
    return _SUNA_STATIC_CONFIG


def load_static_omni_config() -> Dict[str, Any]:
    """
    Load Omni's static config into memory ONCE.
    Includes: system_prompt, model, agentpress_tools, avatar, restrictions.
    """
    global _OMNI_STATIC_CONFIG, _OMNI_STATIC_LOADED

    if _OMNI_STATIC_LOADED:
        return _OMNI_STATIC_CONFIG

    from core.omni_config import OMNI_CONFIG
    from core.config_helper import _extract_agentpress_tools_for_run

    _OMNI_STATIC_CONFIG = {
        'system_prompt': OMNI_CONFIG['system_prompt'],
        'model': OMNI_CONFIG['model'],
        'agentpress_tools': _extract_agentpress_tools_for_run(OMNI_CONFIG['agentpress_tools']),
        'avatar': OMNI_CONFIG.get('avatar', ''),
        'avatar_color': OMNI_CONFIG.get('avatar_color', ''),
        'centrally_managed': True,
        'is_suna_default': False,
        'is_omni_default': True,
        'restrictions': {
            'system_prompt_editable': False,
            'tools_editable': False,
            'name_editable': False,
            'description_editable': False,
            'mcps_editable': True
        }
    }

    _OMNI_STATIC_LOADED = True
    logger.info(f"Loaded static Omni config into memory (prompt: {len(_OMNI_STATIC_CONFIG['system_prompt'])} chars)")
    return _OMNI_STATIC_CONFIG


# ============================================================================
# L2: AGENT CONFIG CACHE - Redis, invalidated on version changes
# ============================================================================
AGENT_CONFIG_TTL = 3600  # 1 hour


def _get_cache_key(agent_id: str, version_id: Optional[str] = None) -> str:
    if version_id:
        return f"agent_config:{agent_id}:{version_id}"
    return f"agent_config:{agent_id}:current"


def _get_user_mcps_key(agent_id: str) -> str:
    return f"agent_mcps:{agent_id}"


async def get_cached_user_mcps(agent_id: str) -> Optional[Dict[str, Any]]:
    """
    Get user-specific MCPs from Redis cache.
    Returns dict with configured_mcps, custom_mcps, triggers, workflows.
    """
    cache_key = _get_user_mcps_key(agent_id)
    try:
        from core.services import redis as redis_service
        cached = await redis_service.get(cache_key)
        if cached:
            data = json.loads(cached) if isinstance(cached, (str, bytes)) else cached
            logger.debug(f"Redis cache hit for user MCPs: {agent_id}")
            return data
    except Exception as e:
        logger.warning(f"Failed to get user MCPs from cache: {e}")
    return None


async def set_cached_user_mcps(
    agent_id: str,
    configured_mcps: list,
    custom_mcps: list,
    triggers: list = None,
    workflows: list = None,
    agent_type: str = "suna"
) -> None:
    """Cache user-specific MCPs in Redis. agent_type is 'suna' or 'omni'."""
    cache_key = _get_user_mcps_key(agent_id)
    data = {
        'configured_mcps': configured_mcps,
        'custom_mcps': custom_mcps,
        'triggers': triggers or [],
        'workflows': workflows or [],
        'agent_type': agent_type
    }
    try:
        from core.services import redis as redis_service
        await redis_service.set(cache_key, json.dumps(data), ex=AGENT_CONFIG_TTL)
        logger.debug(f"Cached user MCPs in Redis: {agent_id}")
    except Exception as e:
        logger.warning(f"Failed to cache user MCPs: {e}")


async def get_cached_agent_config(
    agent_id: str,
    version_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Get agent config from Redis cache.
    For custom agents only - Suna/Omni use static config + cached MCPs.
    """
    cache_key = _get_cache_key(agent_id, version_id)
    try:
        from core.services import redis as redis_service
        cached = await redis_service.get(cache_key)
        if cached:
            data = json.loads(cached) if isinstance(cached, (str, bytes)) else cached
            logger.debug(f"Redis cache hit for agent config: {agent_id}")
            return data
    except Exception as e:
        logger.warning(f"Failed to get agent config from cache: {e}")
    return None


async def set_cached_agent_config(
    agent_id: str,
    config: Dict[str, Any],
    version_id: Optional[str] = None,
    is_default_agent: bool = False
) -> None:
    """Cache full agent config in Redis."""
    if is_default_agent:
        # For Suna/Omni, only cache the MCPs (static config is in memory)
        agent_type = "omni" if config.get('is_omni_default', False) else "suna"
        await set_cached_user_mcps(
            agent_id,
            config.get('configured_mcps', []),
            config.get('custom_mcps', []),
            config.get('triggers', []),
            config.get('workflows', []),
            agent_type=agent_type
        )
        return

    cache_key = _get_cache_key(agent_id, version_id)
    try:
        from core.services import redis as redis_service
        await redis_service.set(cache_key, json.dumps(config), ex=AGENT_CONFIG_TTL)
        logger.debug(f"Cached custom agent config in Redis: {agent_id}")
    except Exception as e:
        logger.warning(f"Failed to cache agent config: {e}")


async def invalidate_agent_config_cache(agent_id: str) -> None:
    """Invalidate cached configs for an agent in Redis."""
    try:
        from core.services import redis as redis_service
        await redis_service.delete(f"agent_config:{agent_id}:current")
        await redis_service.delete(f"agent_mcps:{agent_id}")
        logger.info(f"Invalidated Redis cache for agent: {agent_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate cache: {e}")


# ============================================================================
# L2: PROJECT METADATA CACHE - Invalidated on sandbox changes
# ============================================================================
PROJECT_CACHE_TTL = 300  # 5 minutes


def _get_project_cache_key(project_id: str) -> str:
    return f"project_meta:{project_id}"


async def get_cached_project_metadata(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Get project metadata (sandbox info) from Redis cache.
    Eliminates ~300ms DB query on repeated agent runs.
    """
    cache_key = _get_project_cache_key(project_id)
    try:
        from core.services import redis as redis_service
        cached = await redis_service.get(cache_key)
        if cached:
            data = json.loads(cached) if isinstance(cached, (str, bytes)) else cached
            logger.debug(f"Redis cache hit for project metadata: {project_id}")
            return data
    except Exception as e:
        logger.warning(f"Failed to get project metadata from cache: {e}")
    return None


async def set_cached_project_metadata(project_id: str, sandbox: Dict[str, Any]) -> None:
    """Cache project metadata in Redis."""
    cache_key = _get_project_cache_key(project_id)
    data = {'project_id': project_id, 'sandbox': sandbox}
    try:
        from core.services import redis as redis_service
        await redis_service.set(cache_key, json.dumps(data), ex=PROJECT_CACHE_TTL)
        logger.debug(f"Cached project metadata in Redis: {project_id}")
    except Exception as e:
        logger.warning(f"Failed to cache project metadata: {e}")


async def invalidate_project_cache(project_id: str) -> None:
    """Invalidate cached project metadata."""
    try:
        from core.services import redis as redis_service
        await redis_service.delete(_get_project_cache_key(project_id))
        logger.debug(f"Invalidated project cache: {project_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate project cache: {e}")


# ============================================================================
# L2: RUNNING RUNS CACHE - Short TTL for concurrent runs limit checks
# ============================================================================
RUNNING_RUNS_TTL = 5  # 5 seconds - needs fresh data for limit accuracy


def _get_running_runs_key(account_id: str) -> str:
    return f"running_runs:{account_id}"


async def get_cached_running_runs(account_id: str) -> Optional[Dict[str, Any]]:
    """Get running runs data from Redis cache."""
    cache_key = _get_running_runs_key(account_id)
    try:
        from core.services import redis as redis_service
        cached = await redis_service.get(cache_key)
        if cached:
            data = json.loads(cached) if isinstance(cached, (str, bytes)) else cached
            logger.debug(f"Redis cache hit for running runs: {account_id}")
            return data
    except Exception as e:
        logger.warning(f"Failed to get running runs from cache: {e}")
    return None


async def set_cached_running_runs(
    account_id: str,
    running_count: int,
    running_thread_ids: list
) -> None:
    """Cache running runs data in Redis."""
    cache_key = _get_running_runs_key(account_id)
    data = {
        'running_count': running_count,
        'running_thread_ids': running_thread_ids,
        'cached_at': time.time()
    }
    try:
        from core.services import redis as redis_service
        await redis_service.set(cache_key, json.dumps(data), ex=RUNNING_RUNS_TTL)
        logger.debug(f"Cached running runs in Redis: {account_id} ({running_count} runs)")
    except Exception as e:
        logger.warning(f"Failed to cache running runs: {e}")


async def invalidate_running_runs_cache(account_id: str) -> None:
    """Invalidate cached running runs when agent starts/stops."""
    try:
        from core.services import redis as redis_service
        await redis_service.delete(_get_running_runs_key(account_id))
        logger.debug(f"Invalidated running runs cache: {account_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate running runs cache: {e}")


# ============================================================================
# STARTUP WARMUP
# ============================================================================

async def warm_up_static_configs() -> None:
    """
    Load static Suna and Omni configs into memory at worker startup.
    Instant since it just reads from Python code - no DB calls needed.
    """
    t_start = time.time()
    load_static_suna_config()
    load_static_omni_config()
    elapsed = (time.time() - t_start) * 1000
    logger.info(f"Static configs loaded in {elapsed:.1f}ms (zero DB calls)")
