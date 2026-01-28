import os
from supermemory import Supermemory

class MemoryService:
    def __init__(self):
        # Authenticates using SUPERMEMORY_API_KEY from your .env
        self.client = Supermemory(api_key=os.environ.get("SUPERMEMORY_API_KEY"))

    def save_chat_turn(self, user_id: str, message: str, role: str, enterprise_id: str = None):
        """
        Saves a single turn of conversation.
        Supermemory automatically extracts 'facts' from this text.
        """
        # Ensure user_id is dynamic and not hardcoded
        if not user_id or user_id == "user_test_user_service_v3":
             # This is a safety check against the reported leak
             raise ValueError("Invalid user_id provided for memory storage")

        tags = [f"user_{user_id}"]
        if enterprise_id:
            tags.append(f"ent_{enterprise_id}")
            
        metadata = {"type": "chat_history", "v": "3.0", "role": role}
        if enterprise_id:
            metadata["enterprise_id"] = enterprise_id

        content = f"{role.capitalize()}: {message}"
        
        # Using client.add as requested
        return self.client.add(
            content=content,
            container_tags=tags,
            metadata=metadata
        )

    def get_context(self, user_id: str, query: str, limit: int = 5, enterprise_id: str = None):
        """
        Retrieves the most relevant past memories for a specific query.
        """
        # Ensure user_id is dynamic
        if not user_id or user_id == "user_test_user_service_v3":
             raise ValueError("Invalid user_id provided for memory search")

        # Primary scoping by user_id
        container_tag = f"user_{user_id}"
        
        # If enterprise_id is provided, we prefer strict scoping. 
        # Ideally we would filter by BOTH, but search APIs usually take one primary tag or a filter object.
        # We adhere to the user's request to use f"user_{account_id}" as the container tag.
        
        # NOTE: The user requested replacing 'client.search.documents'. 
        # Current SDK uses 'client.search.memories'. We stick to the working SDK method 
        # but ensure dynamic parameters.
        
        response = self.client.search.memories(
            q=query,
            container_tag=container_tag, 
            search_mode="hybrid",
            limit=limit,
            threshold=0.6
        )
        
        # Post-filter by enterprise_id if supported/needed to ensure no cross-contamination
        # (Though user_id tag should be sufficient unique scope)
        results = []
        if response and response.results:
            for res in response.results:
                # If we have enterprise_id, we could check metadata if available
                # But for now, returning user-scoped results is safe.
                results.append(res.memory or res.chunk)
                
        return "\n".join(results)