"""
Linear integration service for creating and managing issues.
"""
import os
import httpx
from typing import Dict, Any, Optional
from datetime import datetime
from core.utils.logger import logger


class LinearService:
    """Service for interacting with Linear API."""

    def __init__(self):
        self.api_key = os.getenv("LINEAR_API_KEY")
        self.api_url = "https://api.linear.app/graphql"
        self.team_key = os.getenv("LINEAR_TEAM_KEY", "OMN")  # Default team key
        
        if not self.api_key:
            logger.warning("LINEAR_API_KEY not configured. Linear integration will not work.")

    async def get_team_id(self, team_key: str = None) -> Optional[str]:
        """
        Get the team ID from Linear by team key.
        
        Args:
            team_key: The team key (e.g., 'OMN')
            
        Returns:
            Team ID if found, None otherwise
        """
        if not self.api_key:
            logger.error("LINEAR_API_KEY not configured")
            return None

        team_key = team_key or self.team_key

        # Linear API doesn't support querying by key directly
        # We need to fetch all teams and find the matching one
        query = """
        query GetTeams {
            teams {
                nodes {
                    id
                    key
                    name
                }
            }
        }
        """

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={"query": query}
                )
                
                response.raise_for_status()
                data = response.json()

                if "errors" in data:
                    logger.error(f"Linear API error: {data['errors']}")
                    return None

                teams = data.get("data", {}).get("teams", {}).get("nodes", [])
                
                # Find team with matching key
                for team in teams:
                    if team.get("key") == team_key:
                        logger.debug(f"Found team: {team['name']} ({team['key']})")
                        return team["id"]
                
                logger.warning(f"Team with key '{team_key}' not found. Available teams: {[t.get('key') for t in teams]}")
                return None

        except Exception as e:
            logger.error(f"Failed to get team ID: {e}")
            return None

    async def create_issue(
        self,
        title: str,
        description: str,
        priority: int = 2,  # 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
        labels: Optional[list] = None,
        team_key: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create an issue in Linear.
        
        Args:
            title: Issue title
            description: Issue description
            priority: Issue priority (0-4)
            labels: List of label names
            team_key: Team key (defaults to configured team)
            
        Returns:
            Dict with issue details including id and url, or None if failed
        """
        if not self.api_key:
            logger.error("LINEAR_API_KEY not configured")
            return None

        # Get team ID
        team_id = await self.get_team_id(team_key)
        if not team_id:
            logger.error(f"Could not find team with key: {team_key or self.team_key}")
            return None

        mutation = """
        mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    identifier
                    title
                    url
                    createdAt
                }
            }
        }
        """

        # Map our priority levels to Linear's priority
        # Our levels: low, medium, high, urgent
        # Linear levels: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
        priority_map = {
            "urgent": 1,
            "high": 2,
            "medium": 3,
            "low": 4,
        }

        variables = {
            "input": {
                "teamId": team_id,
                "title": title,
                "description": description,
                "priority": priority if isinstance(priority, int) else priority_map.get(priority, 3),
            }
        }

        # Add labels if provided
        if labels:
            # Note: Linear requires label IDs, not names
            # For now, we'll skip labels unless you want to fetch label IDs first
            logger.debug(f"Labels provided but not implemented yet: {labels}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": mutation,
                        "variables": variables
                    }
                )
                
                response.raise_for_status()
                data = response.json()

                if "errors" in data:
                    logger.error(f"Linear API error: {data['errors']}")
                    return None

                result = data.get("data", {}).get("issueCreate", {})
                
                if result.get("success"):
                    issue = result.get("issue", {})
                    logger.info(f"Created Linear issue: {issue.get('identifier')} - {title}")
                    return {
                        "id": issue.get("id"),
                        "identifier": issue.get("identifier"),
                        "title": issue.get("title"),
                        "url": issue.get("url"),
                        "created_at": issue.get("createdAt"),
                    }
                else:
                    logger.error("Failed to create Linear issue")
                    return None

        except Exception as e:
            logger.error(f"Failed to create Linear issue: {e}", exc_info=True)
            return None

    async def get_issue(self, issue_id: str) -> Optional[Dict[str, Any]]:
        """
        Get an issue from Linear by ID.
        
        Args:
            issue_id: Linear issue ID
            
        Returns:
            Dict with issue details or None if not found
        """
        if not self.api_key:
            logger.error("LINEAR_API_KEY not configured")
            return None

        query = """
        query GetIssue($id: String!) {
            issue(id: $id) {
                id
                identifier
                title
                description
                priority
                state {
                    name
                }
                url
                createdAt
                updatedAt
            }
        }
        """

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "query": query,
                        "variables": {"id": issue_id}
                    }
                )
                
                response.raise_for_status()
                data = response.json()

                if "errors" in data:
                    logger.error(f"Linear API error: {data['errors']}")
                    return None

                issue = data.get("data", {}).get("issue")
                if issue:
                    return {
                        "id": issue.get("id"),
                        "identifier": issue.get("identifier"),
                        "title": issue.get("title"),
                        "description": issue.get("description"),
                        "priority": issue.get("priority"),
                        "state": issue.get("state", {}).get("name"),
                        "url": issue.get("url"),
                        "created_at": issue.get("createdAt"),
                        "updated_at": issue.get("updatedAt"),
                    }
                
                return None

        except Exception as e:
            logger.error(f"Failed to get Linear issue: {e}")
            return None


# Singleton instance
linear_service = LinearService()

