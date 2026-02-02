
import logging
import requests
from typing import Optional, Dict, Any, List
from core.utils.config import config

logger = logging.getLogger(__name__)

class LinearService:
    """
    Service for interacting with Linear API.
    """
    
    def __init__(self):
        self.api_url = "https://api.linear.app/graphql"
        self.api_key = config.LINEAR_API_KEY
        self.team_key = config.LINEAR_TEAM_KEY

    def create_issue(self, title: str, description: str, priority: int = 0, labels: List[str] = []) -> Optional[str]:
        """
        Create an issue in Linear.
        
        Args:
            title: Issue title
            description: Issue description
            priority: 0 (No priority) to 4 (Urgent)
            labels: List of label names to apply
            
        Returns:
            The created issue ID or None if failed
        """
        if not self.api_key:
            logger.warning("Linear API key not configured. Skipping issue creation.")
            return None

        # 1. Get Team ID
        team_id = self._get_team_id()
        if not team_id:
            logger.error(f"Could not find Linear team with key: {self.team_key}")
            return None

        # 2. Get Label IDs (optional optimization, but we can plain text match usually if setup)
        # For simplicity, we'll strip logic for now or add if needed.
        # Ideally, we map names to IDs.
        
        # 3. Create Issue
        mutation = """
        mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    title
                    url
                }
            }
        }
        """
        
        variables = {
            "input": {
                "teamId": team_id,
                "title": title,
                "description": description,
                "priority": priority,
                "labelIds": [] # TODO: If actual label IDs are needed, fetch them. For now, we rely on triage. 
                 # If we wanted to set labels by name, we'd need to query label IDs first.
            }
        }
        
        try:
            response = requests.post(
                self.api_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": self.api_key
                },
                json={"query": mutation, "variables": variables}
            )
            response.raise_for_status()
            data = response.json()
            
            if "errors" in data:
                logger.error(f"Linear API errors: {data['errors']}")
                return None
                
            issue_data = data.get("data", {}).get("issueCreate", {}).get("issue", {})
            logger.info(f"Created Linear issue: {issue_data.get('url')}")
            return issue_data # Return full object to get URL and ID
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error creating Linear issue: {e}")
            return None

    def _get_team_id(self) -> Optional[str]:
        """Fetch team ID by key."""
        query = """
        query Teams {
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
            response = requests.post(
                self.api_url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": self.api_key
                },
                json={"query": query}
            )
            response.raise_for_status()
            data = response.json()
            
            teams = data.get("data", {}).get("teams", {}).get("nodes", [])
            for team in teams:
                if team.get("key") == self.team_key:
                    return team.get("id")
            
            # Fallback: return first team if specific key not found? No, unsafe.
            return None
            
        except Exception as e:
            logger.error(f"Error fetching Linear teams: {e}")
            return None

linear_service = LinearService()
