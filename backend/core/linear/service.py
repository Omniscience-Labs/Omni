import os
import httpx
from typing import Optional, List, Dict, Any
from core.utils.logger import logger
from core.utils.config import config

class LinearService:
    def __init__(self):
        self.api_key = os.getenv("LINEAR_API_KEY")
        self.team_key = os.getenv("LINEAR_TEAM_KEY", "OMN") # Default team key
        self.api_url = "https://api.linear.app/graphql"
        
        if not self.api_key:
            logger.warning("LINEAR_API_KEY is not set. Linear integration will not work.")

    async def create_issue(
        self,
        title: str,
        description: str,
        priority: str = "medium",
        request_type: str = "other",
        labels: Optional[List[str]] = None,
        team_key: str = None
    ) -> Optional[Dict[str, Any]]:
        """
        Creates an issue in Linear.
        """
        if not self.api_key:
            logger.error("Cannot create Linear issue: LINEAR_API_KEY is missing.")
            return None

        team_key = team_key or self.team_key
        
        # Map priority (urgent=1, high=2, medium=3, low=4)
        priority_map = {
            "urgent": 1,
            "high": 2,
            "medium": 3,
            "low": 4
        }
        linear_priority = priority_map.get(priority.lower(), 3) # Default to medium
        
        # Map request_type to labels if not provided
        if not labels:
            labels = []
            
        type_to_label = {
            "feature": "Feature Request",
            "bug": "Bug",
            "improvement": "Improvement",
            "agent": "Agent Request",
            "other": "Customer Feedback"
        }
        
        label_name = type_to_label.get(request_type, "Customer Feedback")
        
        # We need to find the Team ID and Label IDs first (or just use team key if possible, but GraphQL usually needs IDs)
        # For simplicity, we'll try to look up the team ID by key first.
        
        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            # 1. Get Team ID
            team_query = """
            query getTeam($key: String!) {
              team(key: $key) {
                id
                labels {
                    nodes {
                        id
                        name
                    }
                }
              }
            }
            """
            
            try:
                response = await client.post(
                    self.api_url, 
                    json={"query": team_query, "variables": {"key": team_key}},
                    headers=headers
                )
                response.raise_for_status()
                data = response.json()
                
                if "errors" in data:
                    logger.error(f"Linear API Error (Get Team): {data['errors']}")
                    return None
                    
                team_data = data.get("data", {}).get("team")
                if not team_data:
                    logger.error(f"Team with key '{team_key}' not found in Linear.")
                    # Fallback or error?
                    return None
                    
                team_id = team_data["id"]
                team_labels = team_data.get("labels", {}).get("nodes", [])
                
                # Find label ID
                label_id = None
                for label in team_labels:
                    if label["name"].lower() == label_name.lower():
                        label_id = label["id"]
                        break
                
                # 2. Create Issue
                mutation = """
                mutation createIssue($input: IssueCreateInput!) {
                  issueCreate(input: $input) {
                    success
                    issue {
                      id
                      url
                      identifier
                    }
                  }
                }
                """
                
                input_data = {
                    "teamId": team_id,
                    "title": title,
                    "description": description,
                    "priority": linear_priority
                }
                
                if label_id:
                    input_data["labelIds"] = [label_id]
                
                response = await client.post(
                    self.api_url,
                    json={"query": mutation, "variables": {"input": input_data}},
                    headers=headers
                )
                response.raise_for_status()
                result = response.json()
                
                if "errors" in result:
                    logger.error(f"Linear API Error (Create Issue): {result['errors']}")
                    return None
                    
                issue_data = result.get("data", {}).get("issueCreate", {}).get("issue")
                return issue_data
                
            except Exception as e:
                logger.error(f"Exception creating Linear issue: {e}")
                return None

linear_service = LinearService()
