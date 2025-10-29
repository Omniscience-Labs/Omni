"""
Example MCP Server Template for Omni
=====================================

This is a reference implementation showing how to return responses
that Omni will process correctly.

Copy this template and modify it for your use case!
"""

import json
from typing import Any, Dict, List


class MCPToolResponseFormatter:
    """Helper class for formatting MCP responses correctly"""
    
    @staticmethod
    def success(data: Any, message: str = None) -> Dict:
        """
        Format a successful response
        
        Args:
            data: Your response data (will be JSON stringified)
            message: Optional success message
            
        Returns:
            Properly formatted MCP response
        """
        response_data = {
            "success": True,
            "data": data
        }
        
        if message:
            response_data["message"] = message
            
        return {
            "content": [{
                "type": "text",
                "text": json.dumps(response_data, indent=2)
            }]
        }
    
    @staticmethod
    def error(error_message: str, code: str = None, details: Any = None) -> Dict:
        """
        Format an error response
        
        Args:
            error_message: Main error message
            code: Optional error code
            details: Optional additional details
            
        Returns:
            Properly formatted MCP error response
        """
        error_data = {"error": error_message}
        
        if code:
            error_data["code"] = code
        if details:
            error_data["details"] = details
            
        return {
            "content": [{
                "type": "text",
                "text": json.dumps(error_data, indent=2)
            }]
        }
    
    @staticmethod
    def search_results(results: List[Dict], total: int = None) -> Dict:
        """
        Format search results (renders as cards in Omni)
        
        Args:
            results: List of search results with title, url, description
            total: Optional total count
            
        Returns:
            Properly formatted search results response
        """
        response = {"results": results}
        if total is not None:
            response["total"] = total
            
        return {
            "content": [{
                "type": "text",
                "text": json.dumps(response, indent=2)
            }]
        }
    
    @staticmethod
    def table_data(rows: List[Dict], columns: List[str] = None) -> Dict:
        """
        Format tabular data (renders as table in Omni)
        
        Args:
            rows: List of row objects with consistent keys
            columns: Optional list of column names to display
            
        Returns:
            Properly formatted table response
        """
        response = rows
        
        # Optionally wrap with metadata
        if columns:
            response = {
                "columns": columns,
                "data": rows
            }
            
        return {
            "content": [{
                "type": "text",
                "text": json.dumps(response, indent=2)
            }]
        }
    
    @staticmethod
    def markdown(markdown_content: str) -> Dict:
        """
        Format markdown content
        
        Args:
            markdown_content: Raw markdown string
            
        Returns:
            Properly formatted markdown response
        """
        return {
            "content": [{
                "type": "text",
                "text": markdown_content
            }]
        }
    
    @staticmethod
    def plain_text(text: str) -> Dict:
        """
        Format plain text response
        
        Args:
            text: Plain text content
            
        Returns:
            Properly formatted text response
        """
        return {
            "content": [{
                "type": "text",
                "text": text
            }]
        }


# ============================================================================
# EXAMPLE TOOL IMPLEMENTATIONS
# ============================================================================

def example_search_tool(query: str, limit: int = 10) -> Dict:
    """
    Example: Search tool that returns formatted results
    Omni will render this as beautiful search result cards!
    """
    try:
        # Your search logic here
        results = [
            {
                "title": "Example Result 1",
                "url": "https://example.com/result1",
                "description": "This is a description of the first result",
                "image": "https://example.com/images/result1.jpg",
                "author": "John Doe",
                "date": "2024-01-15"
            },
            {
                "title": "Example Result 2",
                "url": "https://example.com/result2",
                "description": "This is a description of the second result",
                # image is optional
                "author": "Jane Smith",
                "date": "2024-01-14"
            }
        ]
        
        return MCPToolResponseFormatter.search_results(
            results=results,
            total=len(results)
        )
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Search failed: {str(e)}",
            code="SEARCH_ERROR"
        )


def example_list_items_tool(category: str = None) -> Dict:
    """
    Example: List tool that returns tabular data
    Omni will render this as a sortable table!
    """
    try:
        # Your list logic here
        items = [
            {
                "id": "item_1",
                "name": "Item One",
                "status": "active",
                "created": "2024-01-15",
                "count": 42
            },
            {
                "id": "item_2",
                "name": "Item Two",
                "status": "pending",
                "created": "2024-01-14",
                "count": 17
            },
            {
                "id": "item_3",
                "name": "Item Three",
                "status": "active",
                "created": "2024-01-13",
                "count": 89
            }
        ]
        
        if category:
            # Filter by category if provided
            items = [item for item in items if item.get("category") == category]
        
        return MCPToolResponseFormatter.table_data(
            rows=items,
            columns=["id", "name", "status", "created", "count"]
        )
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Failed to list items: {str(e)}",
            code="LIST_ERROR"
        )


def example_create_tool(name: str, config: Dict[str, Any]) -> Dict:
    """
    Example: Create tool that returns a success message
    """
    try:
        # Your creation logic here
        created_item = {
            "id": "new_item_123",
            "name": name,
            "config": config,
            "status": "created",
            "created_at": "2024-01-15T10:30:00Z"
        }
        
        # Return as markdown for rich formatting
        markdown_response = f"""
# ✅ Successfully Created!

Your item **{name}** has been created.

## Details
- **ID:** `{created_item['id']}`
- **Status:** {created_item['status']}
- **Created:** {created_item['created_at']}

## Configuration
```json
{json.dumps(config, indent=2)}
```

You can now use this item with ID: `{created_item['id']}`
"""
        
        return MCPToolResponseFormatter.markdown(markdown_response)
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Failed to create item: {str(e)}",
            code="CREATE_ERROR",
            details={"name": name, "config": config}
        )


def example_status_tool(item_id: str) -> Dict:
    """
    Example: Status check tool that returns structured data
    """
    try:
        # Your status check logic here
        status_data = {
            "item_id": item_id,
            "status": "running",
            "progress": 75,
            "metrics": {
                "processed": 750,
                "total": 1000,
                "errors": 2
            },
            "last_updated": "2024-01-15T10:30:00Z"
        }
        
        return MCPToolResponseFormatter.success(
            data=status_data,
            message=f"Status retrieved for {item_id}"
        )
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Failed to get status: {str(e)}",
            code="STATUS_ERROR"
        )


def example_analytics_tool(metric: str, period: str = "7d") -> Dict:
    """
    Example: Analytics tool that returns rich data
    Omni will format this as expandable JSON with nice styling!
    """
    try:
        # Your analytics logic here
        analytics = {
            "metric": metric,
            "period": period,
            "summary": {
                "total": 12500,
                "average": 1785,
                "change": "+15.3%"
            },
            "daily_breakdown": [
                {"date": "2024-01-15", "value": 2100},
                {"date": "2024-01-14", "value": 1950},
                {"date": "2024-01-13", "value": 1800},
                {"date": "2024-01-12", "value": 1700},
                {"date": "2024-01-11", "value": 1650},
                {"date": "2024-01-10", "value": 1600},
                {"date": "2024-01-09", "value": 1700}
            ],
            "top_sources": [
                {"source": "organic", "count": 5500, "percentage": 44},
                {"source": "direct", "count": 3750, "percentage": 30},
                {"source": "referral", "count": 2000, "percentage": 16},
                {"source": "social", "count": 1250, "percentage": 10}
            ]
        }
        
        return MCPToolResponseFormatter.success(
            data=analytics,
            message=f"Analytics for {metric} over {period}"
        )
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Failed to fetch analytics: {str(e)}",
            code="ANALYTICS_ERROR"
        )


def example_simple_action_tool(action: str) -> Dict:
    """
    Example: Simple action with plain text response
    """
    try:
        # Your action logic here
        result = f"✅ Action '{action}' completed successfully at 2024-01-15 10:30:00"
        
        return MCPToolResponseFormatter.plain_text(result)
        
    except Exception as e:
        return MCPToolResponseFormatter.error(
            error_message=f"Action failed: {str(e)}",
            code="ACTION_ERROR"
        )


# ============================================================================
# USAGE IN YOUR MCP SERVER
# ============================================================================

"""
In your MCP server's tool handler, use these formatters:

from mcp.server import Server
from mcp.types import Tool, TextContent

app = Server("your-server-name")

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="search",
            description="Search for items",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer"}
                },
                "required": ["query"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "search":
        return example_search_tool(
            query=arguments.get("query"),
            limit=arguments.get("limit", 10)
        )
    
    # Return error for unknown tools
    return MCPToolResponseFormatter.error(
        error_message=f"Unknown tool: {name}",
        code="UNKNOWN_TOOL"
    )
"""

# ============================================================================
# TESTING YOUR RESPONSES
# ============================================================================

if __name__ == "__main__":
    print("=== Testing MCP Response Formats ===\n")
    
    # Test search results
    print("1. Search Results:")
    print(json.dumps(example_search_tool("test query"), indent=2))
    print("\n" + "="*50 + "\n")
    
    # Test table data
    print("2. Table Data:")
    print(json.dumps(example_list_items_tool(), indent=2))
    print("\n" + "="*50 + "\n")
    
    # Test markdown
    print("3. Markdown Response:")
    print(json.dumps(example_create_tool("My Item", {"key": "value"}), indent=2))
    print("\n" + "="*50 + "\n")
    
    # Test structured data
    print("4. Structured Data:")
    print(json.dumps(example_status_tool("item_123"), indent=2))
    print("\n" + "="*50 + "\n")
    
    # Test error
    print("5. Error Response:")
    try:
        raise ValueError("Something went wrong")
    except Exception as e:
        print(json.dumps(
            MCPToolResponseFormatter.error(str(e), "VALIDATION_ERROR"),
            indent=2
        ))



