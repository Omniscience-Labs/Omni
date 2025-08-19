"""
Team Agent Sharing API Endpoints
Handles agent sharing with specific teams
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from services.supabase import DBConnection
from utils.auth_utils import get_current_user_id_from_jwt
from utils.logger import logger

router = APIRouter(prefix="/teams", tags=["teams"])
db = DBConnection()


# Request/Response Models
class SetAgentVisibilityRequest(BaseModel):
    """Request model for setting agent visibility"""
    visibility: str  # 'private', 'public', or 'teams'
    team_ids: Optional[List[UUID]] = None  # Required when visibility is 'teams'


class ShareAgentWithTeamsRequest(BaseModel):
    """Request model for sharing agent with teams"""
    team_ids: List[UUID]  # List of team account IDs to share with


class TeamInfo(BaseModel):
    """Team information model"""
    team_id: UUID
    team_name: str
    team_slug: str
    account_role: str  # User's role in the team


class AgentShareInfo(BaseModel):
    """Information about where an agent is shared"""
    team_id: UUID
    team_name: str
    team_slug: str
    shared_at: datetime


class TeamAgentsResponse(BaseModel):
    """Response model for team agents"""
    agents: List[Dict[str, Any]]
    pagination: Dict[str, Any]
    team_context: Dict[str, Any]


# Endpoints
@router.get("/my-teams", response_model=List[TeamInfo])
async def get_my_teams(
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get all teams where the current user is a member.
    Returns teams where user can potentially share agents (owner role).
    """
    try:
        client = await db.client
        
        # Get user's teams using basejump tables
        result = await client.schema('basejump').from_('account_user').select(
            'account_id, account_role, accounts!inner(id, name, slug, personal_account)'
        ).eq('user_id', user_id).execute()
        
        if not result.data:
            return []
        
        # Filter to non-personal accounts where user is owner
        teams = []
        for row in result.data:
            account_data = row.get('accounts')
            if account_data and not account_data.get('personal_account'):
                teams.append(TeamInfo(
                    team_id=row['account_id'],
                    team_name=account_data.get('name', 'Unnamed Team'),
                    team_slug=account_data.get('slug', ''),
                    account_role=row['account_role']
                ))
        
        logger.info(f"Found {len(teams)} teams for user {user_id}")
        return teams
        
    except Exception as e:
        logger.error(f"Error fetching user teams: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch teams")


@router.post("/agents/{agent_id}/set-visibility")
async def set_agent_visibility(
    agent_id: str,
    request: SetAgentVisibilityRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Set the visibility of an agent (private, public, or teams).
    When setting to 'teams', provide the team_ids to share with.
    """
    try:
        client = await db.client
        
        # Verify agent ownership
        agent_result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Check if user owns the agent
        agent_account_id = agent_result.data[0]['account_id']
        has_access = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', agent_account_id).execute()
        
        if not has_access.data or has_access.data[0]['account_role'] != 'owner':
            # Check if it's the user's personal account
            if agent_account_id != user_id:
                raise HTTPException(status_code=403, detail="Only agent owners can change visibility")
        
        # Validate team_ids if visibility is 'teams'
        if request.visibility == 'teams' and not request.team_ids:
            raise HTTPException(status_code=400, detail="team_ids required when visibility is 'teams'")
        
        # Call the database function to set visibility
        result = await client.rpc('set_agent_visibility', {
            'p_agent_id': agent_id,
            'p_visibility': request.visibility,
            'p_team_ids': [str(tid) for tid in request.team_ids] if request.team_ids else None
        }).execute()
        
        logger.info(f"Set agent {agent_id} visibility to {request.visibility} by user {user_id}")
        
        return {"message": f"Agent visibility set to {request.visibility}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting agent visibility: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to set agent visibility")


@router.post("/agents/{agent_id}/share-with-teams")
async def share_agent_with_teams(
    agent_id: str,
    request: ShareAgentWithTeamsRequest,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Share an agent with specific teams.
    This is a convenience endpoint that sets visibility to 'teams' and shares with the specified teams.
    """
    try:
        # Use the set_visibility function with teams visibility
        visibility_request = SetAgentVisibilityRequest(
            visibility='teams',
            team_ids=request.team_ids
        )
        
        return await set_agent_visibility(agent_id, visibility_request, user_id)
        
    except Exception as e:
        logger.error(f"Error sharing agent with teams: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to share agent with teams")


@router.get("/agents/{agent_id}/shared-teams", response_model=List[AgentShareInfo])
async def get_agent_shared_teams(
    agent_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get list of teams where an agent is shared.
    Only the agent owner can see this information.
    """
    try:
        client = await db.client
        
        # Verify agent ownership
        agent_result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_account_id = agent_result.data[0]['account_id']
        
        # Check if user owns the agent
        if agent_account_id != user_id:
            has_access = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', agent_account_id).execute()
            if not has_access.data or has_access.data[0]['account_role'] != 'owner':
                raise HTTPException(status_code=403, detail="Only agent owners can view share information")
        
        # Call database function to get shared teams
        result = await client.rpc('get_agent_shared_teams', {
            'p_agent_id': agent_id
        }).execute()
        
        if not result.data:
            return []
        
        return [
            AgentShareInfo(
                team_id=row['team_id'],
                team_name=row['team_name'],
                team_slug=row['team_slug'],
                shared_at=row['shared_at']
            )
            for row in result.data
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching agent shared teams: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch shared teams")


@router.post("/agents/{agent_id}/unshare-from-team/{team_id}")
async def unshare_agent_from_team(
    agent_id: str,
    team_id: str,
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Remove agent sharing from a specific team.
    Can be done by agent owner or team owner.
    """
    try:
        client = await db.client
        
        # Check if user has permission (agent owner or team owner)
        # First check agent ownership
        agent_result = await client.table('agents').select('account_id').eq('agent_id', agent_id).execute()
        if not agent_result.data:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_account_id = agent_result.data[0]['account_id']
        is_agent_owner = (agent_account_id == user_id)
        
        if not is_agent_owner:
            # Check if user is owner of agent's account
            agent_owner_check = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', agent_account_id).execute()
            is_agent_owner = (agent_owner_check.data and agent_owner_check.data[0]['account_role'] == 'owner')
        
        # Check if user is team owner
        team_owner_check = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', team_id).execute()
        is_team_owner = (team_owner_check.data and team_owner_check.data[0]['account_role'] == 'owner')
        
        if not is_agent_owner and not is_team_owner:
            raise HTTPException(status_code=403, detail="Only agent owner or team owner can unshare")
        
        # Delete the team share
        result = await client.table('team_agents').delete().eq('agent_id', agent_id).eq('team_account_id', team_id).execute()
        
        logger.info(f"Unshared agent {agent_id} from team {team_id} by user {user_id}")
        
        return {"message": "Agent unshared from team successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsharing agent from team: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to unshare agent")


@router.get("/{team_id}/agents", response_model=TeamAgentsResponse)
async def get_team_agents(
    team_id: str,
    page: Optional[int] = Query(1, ge=1),
    limit: Optional[int] = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user_id_from_jwt)
):
    """
    Get agents available to a specific team.
    Includes team's own agents, public agents, and agents shared with the team.
    """
    try:
        client = await db.client
        
        # Verify user is member of the team
        member_check = await client.schema('basejump').from_('account_user').select('account_role').eq('user_id', user_id).eq('account_id', team_id).execute()
        
        if not member_check.data:
            raise HTTPException(status_code=403, detail="Not a member of this team")
        
        # Parse tags if provided
        parsed_tags = None
        if tags:
            parsed_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        
        # Call the enhanced marketplace function with team context
        offset = (page - 1) * limit
        result = await client.rpc('get_marketplace_agents_with_teams', {
            'p_limit': limit,
            'p_offset': offset,
            'p_search': search,
            'p_tags': parsed_tags,
            'p_account_id': team_id
        }).execute()
        
        # Get team info
        team_info = await client.schema('basejump').from_('accounts').select('name, slug').eq('id', team_id).execute()
        
        return TeamAgentsResponse(
            agents=result.data or [],
            pagination={
                "page": page,
                "limit": limit,
                "total": len(result.data or []),
                "total_pages": max(1, (len(result.data or []) + limit - 1) // limit)
            },
            team_context={
                "team_id": team_id,
                "team_name": team_info.data[0]['name'] if team_info.data else 'Unknown Team',
                "team_slug": team_info.data[0]['slug'] if team_info.data else '',
                "user_role": member_check.data[0]['account_role']
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching team agents: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch team agents")
