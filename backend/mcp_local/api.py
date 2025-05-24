"""
MCP (Model Context Protocol) API module

This module handles MCP server discovery and configuration management.

Architecture:
1. Registry API (https://registry.smithery.ai) - For discovering MCP servers and getting metadata
2. Server API (https://server.smithery.ai) - For actually connecting to and using MCP servers

The flow:
1. Browse available MCP servers from the registry (this module)
2. Configure MCP servers with credentials and save to agent's configured_mcps
3. When agent runs, it connects to MCP servers using:
   https://server.smithery.ai/{qualifiedName}/mcp?config={base64_encoded_config}&api_key={smithery_api_key}
   
Example MCP configuration stored in agent's configured_mcps:
{
    "name": "Exa Search",
    "qualifiedName": "exa",
    "config": {"exaApiKey": "user's-exa-api-key"},
    "enabledTools": ["search", "find_similar"]
}
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import httpx
import os
from urllib.parse import quote
from utils.logger import logger
from utils.auth_utils import get_current_user_id_from_jwt

router = APIRouter()

# Smithery API configuration
SMITHERY_API_BASE_URL = "https://registry.smithery.ai"
SMITHERY_SERVER_BASE_URL = "https://server.smithery.ai" 
SMITHERY_API_KEY = os.getenv("SMITHERY_API_KEY")

class MCPServer(BaseModel):
    """Represents an MCP server from Smithery"""
    qualifiedName: str
    displayName: str
    description: str
    createdAt: str
    useCount: int  # Changed from str to int
    homepage: str
    # These fields are only available in the detail endpoint
    iconUrl: Optional[str] = None
    isDeployed: Optional[bool] = None
    connections: Optional[List[Dict[str, Any]]] = None
    tools: Optional[List[Dict[str, Any]]] = None
    security: Optional[Dict[str, Any]] = None

class MCPServerListResponse(BaseModel):
    """Response model for MCP server list"""
    servers: List[MCPServer]
    pagination: Dict[str, int]

class MCPServerDetailResponse(BaseModel):
    """Response model for detailed MCP server information"""
    qualifiedName: str
    displayName: str
    iconUrl: Optional[str] = None
    deploymentUrl: Optional[str] = None
    connections: List[Dict[str, Any]]
    security: Optional[Dict[str, Any]] = None
    tools: Optional[List[Dict[str, Any]]] = None

@router.get("/mcp/servers", response_model=MCPServerListResponse)
async def list_mcp_servers(
    q: Optional[str] = Query(None, description="Search query for semantic search"),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=100, description="Items per page"),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    List available MCP servers from Smithery.
    
    Query parameters:
    - q: Search query (semantic search)
    - page: Page number (default: 1)
    - pageSize: Number of items per page (default: 20, max: 100)
    
    Example queries:
    - "machine learning" - semantic search
    - "owner:smithery-ai" - filter by owner
    - "repo:fetch" - filter by repository
    - "is:deployed" - only deployed servers
    - "is:verified" - only verified servers
    """
    logger.info(f"Fetching MCP servers from Smithery for user {user_id} with query: {q}")
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Accept": "application/json",
                "User-Agent": "Suna-MCP-Integration/1.0"
            }
            
            # Add API key if available
            if SMITHERY_API_KEY:
                headers["Authorization"] = f"Bearer {SMITHERY_API_KEY}"
                logger.debug("Using Smithery API key for authentication")
            else:
                logger.warning("No Smithery API key found in environment variables")
            
            params = {
                "page": page,
                "pageSize": pageSize
            }
            
            if q:
                params["q"] = q
            
            response = await client.get(
                f"{SMITHERY_API_BASE_URL}/servers",
                headers=headers,
                params=params,
                timeout=30.0
            )
            
            if response.status_code == 401:
                logger.warning("Smithery API authentication failed. API key may be required.")
                # Continue without auth - public servers should still be accessible
            
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"Successfully fetched {len(data.get('servers', []))} MCP servers")
            return MCPServerListResponse(**data)
            
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching MCP servers: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Failed to fetch MCP servers from Smithery: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Error fetching MCP servers: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch MCP servers: {str(e)}"
        )

@router.get("/mcp/servers/{qualified_name:path}", response_model=MCPServerDetailResponse)
async def get_mcp_server_details(
    qualified_name: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get detailed information about a specific MCP server.
    
    Parameters:
    - qualified_name: The unique identifier for the server (e.g., "exa", "@smithery-ai/github")
    """
    logger.info(f"Fetching details for MCP server: {qualified_name} for user {user_id}")
    
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                "Accept": "application/json",
                "User-Agent": "Suna-MCP-Integration/1.0"
            }
            
            # Add API key if available
            if SMITHERY_API_KEY:
                headers["Authorization"] = f"Bearer {SMITHERY_API_KEY}"
            
            # URL encode the qualified name only if it contains special characters
            if '@' in qualified_name or '/' in qualified_name:
                encoded_name = quote(qualified_name, safe='')
            else:
                # Don't encode simple names like "exa"
                encoded_name = qualified_name
            
            url = f"{SMITHERY_API_BASE_URL}/servers/{encoded_name}"
            logger.debug(f"Requesting MCP server details from: {url}")
            
            response = await client.get(
                url,  # Use registry API for metadata
                headers=headers,
                timeout=30.0
            )
            
            logger.debug(f"Response status: {response.status_code}")
            
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"Successfully fetched details for MCP server: {qualified_name}")
            logger.debug(f"Response data keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}")
            
            return MCPServerDetailResponse(**data)
            
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.error(f"Server not found. Response: {e.response.text}")
            raise HTTPException(status_code=404, detail=f"MCP server '{qualified_name}' not found")
        
        logger.error(f"HTTP error fetching MCP server details: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Failed to fetch MCP server details: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"Error fetching MCP server details: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch MCP server details: {str(e)}"
        )

@router.get("/mcp/popular-servers")
async def get_popular_mcp_servers(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get a curated list of popular/recommended MCP servers.
    This is a convenience endpoint that returns commonly used servers.
    """
    # Define some popular servers based on actual Smithery data
    popular_servers = [
        {
            "qualifiedName": "@wonderwhy-er/desktop-commander",
            "displayName": "Desktop Commander",
            "description": "Execute terminal commands and manage files with diff editing capabilities. Coding, shell and terminal, task automation",
            "icon": "💻",
            "category": "development"
        },
        {
            "qualifiedName": "@smithery-ai/server-sequential-thinking",
            "displayName": "Sequential Thinking",
            "description": "Dynamic and reflective problem-solving through a structured thinking process",
            "icon": "🧠",
            "category": "ai"
        },
        {
            "qualifiedName": "@microsoft/playwright-mcp",
            "displayName": "Playwright Automation",
            "description": "Automate web interactions, navigate, extract data, and perform actions on web pages",
            "icon": "🎭",
            "category": "automation"
        },
        {
            "qualifiedName": "exa",
            "displayName": "Exa Search",
            "description": "Fast, intelligent web search and crawling. Combines embeddings and traditional search",
            "icon": "🔍",
            "category": "search"
        },
        {
            "qualifiedName": "@smithery-ai/github",
            "displayName": "GitHub",
            "description": "Access the GitHub API, enabling file operations, repository management, and search",
            "icon": "🐙",
            "category": "development"
        },
        {
            "qualifiedName": "@nickclyde/duckduckgo-mcp-server",
            "displayName": "DuckDuckGo Search",
            "description": "Enable web search capabilities through DuckDuckGo. Fetch and parse webpage content",
            "icon": "🦆",
            "category": "search"
        }
    ]
    
    return {"servers": popular_servers} 