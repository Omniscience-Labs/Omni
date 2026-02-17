"""
Knowledge Search Tool for LlamaCloud Integration

This tool dynamically creates search functions for each configured LlamaCloud knowledge base,
allowing agents to search through external knowledge bases hosted on LlamaCloud.
"""

import os
from typing import List, Dict, Any, Optional
from core.agentpress.tool import Tool, ToolResult, openapi_schema
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger


class KnowledgeSearchTool(Tool):
    """
    Tool for searching knowledge bases using LlamaCloud indices.
    
    Dynamically creates search functions for each configured KB, allowing agents
    to search through external knowledge bases by name.
    
    Example:
        If a KB named "product-docs" is configured, this creates a method
        `search_product_docs(query: str)` that searches that specific index.
    """

    def __init__(
        self, 
        thread_manager: ThreadManager,
        knowledge_bases: Optional[List[Dict[str, Any]]] = None,
        file_knowledge_base_entries: Optional[List[Dict[str, Any]]] = None
    ):
        """
        Initialize the Knowledge Search Tool.
        
        Args:
            thread_manager: Thread manager instance for context
            knowledge_bases: List of LlamaCloud KB configurations (name, index_name, description)
            file_knowledge_base_entries: List of file-based KB entries (entry_type, name, folder_name, summary, etc.)
        """
        self.thread_manager = thread_manager
        self.knowledge_bases = knowledge_bases or []
        self.file_knowledge_base_entries = file_knowledge_base_entries or []
        self.api_key = os.getenv("LLAMA_CLOUD_API_KEY")
        self.project_name = os.getenv("LLAMA_CLOUD_PROJECT_NAME", "Default")
        
        if not self.api_key:
            logger.warning("LLAMA_CLOUD_API_KEY not found in environment variables")
        
        # Create dynamic search methods for each knowledge base
        self._create_dynamic_methods()
        super().__init__()

    def _create_dynamic_methods(self):
        """
        Creates a search method for each knowledge base.
        
        For each KB, this creates a method named `search_{kb_name}` that:
        1. Takes a query string as parameter
        2. Searches the specific LlamaCloud index
        3. Returns formatted search results
        
        The method is automatically registered with OpenAPI schema for LLM function calling.
        """
        for kb in self.knowledge_bases:
            name = kb.get('name', '')
            index_name = kb.get('index_name', '')
            description = kb.get('description', '')
            
            # Skip knowledge bases with empty name or index_name
            if not name or not index_name:
                logger.warning(f"Skipping knowledge base with empty name='{name}' or index_name='{index_name}'")
                continue
            
            # Create method name: "search_<kb_name>"
            # Convert name to valid Python identifier (replace hyphens/spaces with underscores)
            method_name = f"search_{name.replace('-', '_').replace(' ', '_').lower()}"
            
            # Create the async search function with captured variables
            async def search_function(
                self, 
                query: str, 
                index_name=index_name, 
                kb_description=description,
                kb_name=name
            ) -> ToolResult:
                """Search function dynamically created for a specific knowledge base."""
                return await self._search_index(query, index_name, kb_description, kb_name)
            
            # Apply OpenAPI schema decorator for LLM function calling
            openapi_decorator = openapi_schema({
                "type": "function",
                "function": {
                    "name": method_name,
                    "description": f"Search the '{name}' knowledge base. {description}",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The search query to find relevant information"
                            }
                        },
                        "required": ["query"]
                    }
                }
            })
            
            # Bind the decorated method to this class instance
            decorated_method = openapi_decorator(search_function)
            setattr(self, method_name, decorated_method.__get__(self, type(self)))
            
            logger.info(f"📚 Registered search method: {method_name} -> {index_name}")

    async def _search_index(
        self, 
        query: str, 
        index_name: str, 
        description: str,
        kb_name: str
    ) -> ToolResult:
        """
        Performs search on a specific LlamaCloud index.
        
        Args:
            query: Search query string
            index_name: LlamaCloud index identifier
            description: KB description for context
            kb_name: Display name of the knowledge base
            
        Returns:
            ToolResult with search results or error message
        """
        try:
            # Validate API key is configured
            if not self.api_key:
                return self.fail_response(
                    "LlamaCloud API key not configured. "
                    "Please set LLAMA_CLOUD_API_KEY environment variable."
                )
            
            # Try to import LlamaCloud SDK
            try:
                from llama_index.indices.managed.llama_cloud import LlamaCloudIndex
            except ImportError:
                return self.fail_response(
                    "LlamaCloud client not installed. "
                    "Please install: pip install llama-index-indices-managed-llama-cloud>=0.3.0"
                )
            
            # Set API key in environment for LlamaCloud SDK
            os.environ["LLAMA_CLOUD_API_KEY"] = self.api_key
            
            logger.info(f"🔍 Searching LlamaCloud index '{index_name}' with query: {query}")
            
            # Connect to the LlamaCloud index
            try:
                index = LlamaCloudIndex(
                    name=index_name, 
                    project_name=self.project_name
                )
            except Exception as e:
                logger.error(f"Failed to connect to index '{index_name}': {str(e)}")
                return self.fail_response(
                    f"Failed to connect to knowledge base '{kb_name}'. "
                    f"Please verify the index name '{index_name}' exists in your LlamaCloud project."
                )
            
            # Configure retriever with hybrid search for best results
            retriever = index.as_retriever(
                dense_similarity_top_k=3,      # Dense (semantic) search results
                sparse_similarity_top_k=3,     # Sparse (keyword) search results
                alpha=0.5,                      # Balance between dense and sparse (0.5 = equal weight)
                enable_reranking=True,          # Enable result reranking for quality
                rerank_top_n=3,                 # Number of results to rerank
                retrieval_mode="chunks"         # Retrieve document chunks
            )
            
            # Execute the search
            logger.info(f"📖 Retrieving results from '{index_name}'...")
            nodes = retriever.retrieve(query)
            
            # Handle no results case
            if not nodes:
                logger.info(f"No results found in '{index_name}' for query: {query}")
                return self.success_response({
                    "message": f"No results found in '{kb_name}' knowledge base for query: {query}",
                    "results": [],
                    "index": index_name,
                    "kb_name": kb_name,
                    "description": description,
                    "query": query
                })
            
            # Format results for the agent
            results = []
            for i, node in enumerate(nodes):
                result = {
                    "rank": i + 1,
                    "score": float(node.score) if hasattr(node, 'score') and node.score else None,
                    "text": node.text,
                    "metadata": node.metadata if hasattr(node, 'metadata') else {}
                }
                results.append(result)
            
            logger.info(f"✅ Found {len(results)} results in '{index_name}'")
            
            return self.success_response({
                "message": f"Found {len(results)} results in '{kb_name}' knowledge base",
                "results": results,
                "index": index_name,
                "kb_name": kb_name,
                "description": description,
                "query": query
            })
            
        except Exception as e:
            logger.error(f"Error searching index '{index_name}': {str(e)}", exc_info=True)
            return self.fail_response(
                f"Error searching knowledge base '{kb_name}': {str(e)}"
            )

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_available_knowledge_bases",
            "description": "List all available knowledge bases: LlamaCloud (searchable) and file-based (folders and files assigned to this agent)",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    async def list_available_knowledge_bases(self) -> ToolResult:
        """
        Lists all available knowledge bases: LlamaCloud KBs (searchable) and file-based
        folders/files assigned to this agent.
        """
        try:
            # LlamaCloud knowledge bases (searchable via search_* methods)
            kb_list = []
            for kb in self.knowledge_bases:
                kb_info = {
                    "name": kb.get('name'),
                    "index_name": kb.get('index_name'),
                    "description": kb.get('description', 'No description available'),
                    "search_method": f"search_{kb.get('name', '').replace('-', '_').replace(' ', '_').lower()}",
                    "type": "llamacloud"
                }
                kb_list.append(kb_info)
            
            # File-based knowledge base: group by folder
            folders_map = {}  # folder_name -> list of file dicts
            for entry in self.file_knowledge_base_entries:
                folder_name = entry.get('folder_name') or 'Uncategorized'
                if folder_name not in folders_map:
                    folders_map[folder_name] = []
                file_size = entry.get('file_size')
                size_str = f"~{file_size // 1024} KB" if file_size else "—"
                folders_map[folder_name].append({
                    "filename": entry.get('filename') or entry.get('name'),
                    "summary": (entry.get('summary') or "")[:300] + ("..." if len(entry.get('summary') or "") > 300 else ""),
                    "file_size": size_str,
                    "type": "file"
                })
            
            file_folders = [
                {"folder_name": name, "files": files, "file_count": len(files)}
                for name, files in folders_map.items()
            ]
            
            total_cloud = len(kb_list)
            total_files = len(self.file_knowledge_base_entries)
            if total_cloud == 0 and total_files == 0:
                return self.success_response({
                    "message": "No knowledge bases configured for this agent",
                    "knowledge_bases": [],
                    "file_knowledge_base": {"folders": []}
                })
            
            message_parts = []
            if total_cloud:
                message_parts.append(f"{total_cloud} LlamaCloud knowledge base(s) available for search")
            if total_files:
                message_parts.append(f"{total_files} file(s) in {len(file_folders)} folder(s)")
            
            return self.success_response({
                "message": "Found knowledge bases: " + "; ".join(message_parts),
                "knowledge_bases": kb_list,
                "file_knowledge_base": {
                    "folders": file_folders,
                    "total_files": total_files
                }
            })
            
        except Exception as e:
            logger.error(f"Error listing knowledge bases: {str(e)}")
            return self.fail_response(f"Error listing knowledge bases: {str(e)}")
