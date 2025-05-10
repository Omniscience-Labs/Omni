from tavily import AsyncTavilyClient
import httpx
from dotenv import load_dotenv
from agentpress.tool import Tool, ToolResult, openapi_schema, xml_schema
from utils.config import config
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
import json
import os
import datetime
import asyncio
import logging

# TODO: add subpages, etc... in filters as sometimes its necessary 

class SandboxWebSearchTool(SandboxToolsBase):
    """Tool for performing web searches using Tavily API and web scraping using Firecrawl."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        # Load environment variables
        load_dotenv()
        # Use API keys from config
        self.tavily_api_key = config.TAVILY_API_KEY
        self.firecrawl_api_key = config.FIRECRAWL_API_KEY
        self.firecrawl_url = config.FIRECRAWL_URL
        
        if not self.tavily_api_key:
            raise ValueError("TAVILY_API_KEY not found in configuration")
        if not self.firecrawl_api_key:
            raise ValueError("FIRECRAWL_API_KEY not found in configuration")

        # Tavily asynchronous search client
        self.tavily_client = AsyncTavilyClient(api_key=self.tavily_api_key)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for up-to-date information on a specific topic using the Tavily API. This tool allows you to gather real-time information from the internet to answer user queries, research topics, validate facts, and find recent developments. Results include titles, URLs, summaries, and publication dates. Use this tool for discovering relevant web pages before potentially crawling them for complete content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant web pages. Be specific and include key terms to improve search accuracy. For best results, use natural language questions or keyword combinations that precisely describe what you're looking for."
                    },
                    # "summary": {
                    #     "type": "boolean",
                    #     "description": "Whether to include a summary of each search result. Summaries provide key context about each page without requiring full content extraction. Set to true to get concise descriptions of each result.",
                    #     "default": True
                    # },
                    "num_results": {
                        "type": "integer",
                        "description": "The number of search results to return. Increase for more comprehensive research or decrease for focused, high-relevance results.",
                        "default": 20
                    }
                },
                "required": ["query"]
            }
        }
    })
    @xml_schema(
        tag_name="web-search",
        mappings=[
            {"param_name": "query", "node_type": "attribute", "path": "."},
            # {"param_name": "summary", "node_type": "attribute", "path": "."},
            {"param_name": "num_results", "node_type": "attribute", "path": "."}
        ],
        example='''
        <!-- 
        The web-search tool allows you to search the internet for real-time information.
        Use this tool when you need to find current information, research topics, or verify facts.
        
        The tool returns information including:
        - Titles of relevant web pages
        - URLs for accessing the pages
        - Published dates (when available)
        -->
        
        <!-- Simple search example -->
        <web-search 
            query="current weather in New York City" 
            num_results="20">
        </web-search>
        
        <!-- Another search example -->
        <web-search 
            query="healthy breakfast recipes" 
            num_results="20">
        </web-search>
        '''
    )
    async def web_search(
        self, 
        query: str, 
        # summary: bool = True,
        num_results: int = 20
    ) -> ToolResult:
        """
        Search the web using the Tavily API to find relevant and up-to-date information.
        """
        try:
            # Ensure we have a valid query
            if not query or not isinstance(query, str):
                return self.fail_response("A valid search query is required.")
            
            # Normalize num_results
            if num_results is None:
                num_results = 20
            elif isinstance(num_results, int):
                num_results = max(1, min(num_results, 50))
            elif isinstance(num_results, str):
                try:
                    num_results = max(1, min(int(num_results), 50))
                except ValueError:
                    num_results = 20
            else:
                num_results = 20

            # Execute the search with Tavily
            search_response = await self.tavily_client.search(
                query=query,
                max_results=num_results,
                include_answer=False,
                include_images=False,
            )

            # Normalize the response format
            raw_results = (
                search_response.get("results")
                if isinstance(search_response, dict)
                else search_response
            )

            # Format results consistently
            formatted_results = []
            for result in raw_results:
                formatted_result = {
                    "title": result.get("title", ""),
                    "url": result.get("url", ""),
                }

                # if summary:
                #     # Prefer full content; fall back to description
                #     formatted_result["snippet"] = (
                #         result.get("content") or 
                #         result.get("description") or 
                #         ""
                #     )

                formatted_results.append(formatted_result)
            
            # Return a properly formatted ToolResult with the search results directly
            return ToolResult(
                success=True,
                output=json.dumps(formatted_results, ensure_ascii=False)
            )
        
        except Exception as e:
            error_message = str(e)
            simplified_message = f"Error performing web search: {error_message[:200]}"
            if len(error_message) > 200:
                simplified_message += "..."
            return self.fail_response(simplified_message)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "scrape_webpage",
            "description": "Retrieve the complete text content of a specific webpage using Firecrawl. This tool extracts the full text content from any accessible web page and returns it for analysis, processing, or reference. The extracted text includes the main content of the page without HTML markup. Note that some pages may have limitations on access due to paywalls, access restrictions, or dynamic content loading.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The complete URL of the webpage to scrape. This should be a valid, accessible web address including the protocol (http:// or https://). The tool will attempt to extract all text content from this URL."
                    },
                    "result_name": {
                        "type": "string",
                        "description": "Name to use for the saved result file. If not provided, a name will be generated from the URL.",
                        "default": ""
                    }
                },
                "required": ["url"]
            }
        }
    })
    @xml_schema(
        tag_name="scrape-webpage",
        mappings=[
            {"param_name": "url", "node_type": "attribute", "path": "."},
            {"param_name": "result_name", "node_type": "attribute", "path": ".", "required": False}
        ],
        example='''
        <!-- 
        The scrape-webpage tool extracts the complete text content from web pages using Firecrawl.
        IMPORTANT WORKFLOW RULES:
        1. ALWAYS use web-search first to find relevant URLs
        2. Then use scrape-webpage on URLs from web-search results
        3. Only if scrape-webpage fails or if the page requires interaction:
           - Use direct browser tools (browser_navigate_to, browser_click_element, etc.)
           - This is needed for dynamic content, JavaScript-heavy sites, or pages requiring interaction
        
        Firecrawl Features:
        - Converts web pages into clean markdown
        - Handles dynamic content and JavaScript-rendered sites
        - Manages proxies, caching, and rate limits
        - Supports PDFs and images
        - Outputs clean markdown
        -->
        
        <!-- Example workflow: -->
        <!-- 1. First search for relevant content -->
        <web-search 
            query="latest AI research papers" 
            num_results="5">
        </web-search>
        
        <!-- 2. Then scrape specific URLs from search results -->
        <scrape-webpage 
            url="https://example.com/research/ai-paper-2024"
            result_name="ai_research_paper">
        </scrape-webpage>
        
        <!-- 3. Only if scrape fails or interaction needed, use browser tools -->
        <!-- Example of when to use browser tools:
             - Dynamic content loading
             - JavaScript-heavy sites
             - Pages requiring login
             - Interactive elements
             - Infinite scroll pages
        -->
        '''
    )
    async def scrape_webpage(
        self,
        url: str,
        result_name: str = ""
    ) -> ToolResult:
        """
        Retrieve the complete text content of a webpage using Firecrawl and save it to a file.
        
        This function scrapes the specified URL and extracts the full text content from the page.
        The extracted text is saved to a file in the /workspace/scrape directory.
        
        Parameters:
        - url: The URL of the webpage to scrape
        - result_name: Optional name for the result file (if not provided, generated from URL)
        """
        try:
            logging.info(f"Starting to scrape webpage: {url}")
            
            # Ensure sandbox is initialized
            await self._ensure_sandbox()
            
            # Parse the URL parameter exactly as it would appear in XML
            if not url:
                logging.warning("Scrape attempt with empty URL")
                return self.fail_response("A valid URL is required.")
                
            # Handle url parameter (as it would appear in XML)
            if isinstance(url, str):
                # Add protocol if missing
                if not (url.startswith('http://') or url.startswith('https://')):
                    url = 'https://' + url
                    logging.info(f"Added https:// protocol to URL: {url}")
            else:
                logging.warning(f"Invalid URL type: {type(url)}")
                return self.fail_response("URL must be a string.")
                
            # ---------- Firecrawl scrape endpoint ----------
            logging.info(f"Sending request to Firecrawl for URL: {url}")
            async with httpx.AsyncClient() as client:
                headers = {
                    "Authorization": f"Bearer {self.firecrawl_api_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "url": url,
                    "formats": ["markdown"]
                }
                
                # Use longer timeout and retry logic for more reliability
                max_retries = 3
                timeout_seconds = 120
                retry_count = 0
                
                while retry_count < max_retries:
                    try:
                        logging.info(f"Sending request to Firecrawl (attempt {retry_count + 1}/{max_retries})")
                        response = await client.post(
                            f"{self.firecrawl_url}/v1/scrape",
                            json=payload,
                            headers=headers,
                            timeout=timeout_seconds,
                        )
                        response.raise_for_status()
                        data = response.json()
                        logging.info(f"Successfully received response from Firecrawl for {url}")
                        break
                    except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ReadError) as timeout_err:
                        retry_count += 1
                        logging.warning(f"Request timed out (attempt {retry_count}/{max_retries}): {str(timeout_err)}")
                        if retry_count >= max_retries:
                            raise Exception(f"Request timed out after {max_retries} attempts with {timeout_seconds}s timeout")
                        # Exponential backoff
                        logging.info(f"Waiting {2 ** retry_count}s before retry")
                        await asyncio.sleep(2 ** retry_count)
                    except Exception as e:
                        # Don't retry on non-timeout errors
                        logging.error(f"Error during scraping: {str(e)}")
                        raise e

            # Format the response
            title = data.get("data", {}).get("metadata", {}).get("title", "")
            markdown_content = data.get("data", {}).get("markdown", "")
            logging.info(f"Extracted content from {url}: title='{title}', content length={len(markdown_content)}")
            
            formatted_result = {
                "title": title,
                "url": url,
                "text": markdown_content
            }
            
            # Add metadata if available
            if "metadata" in data.get("data", {}):
                formatted_result["metadata"] = data["data"]["metadata"]
                logging.info(f"Added metadata: {data['data']['metadata'].keys()}")
            
            # Create a safe filename from the URL or use provided result_name
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            if result_name:
                safe_filename = f"{timestamp}_{result_name}"
            else:
                # Extract domain and path from URL for the filename
                from urllib.parse import urlparse
                parsed_url = urlparse(url)
                domain = parsed_url.netloc.replace("www.", "")
                path = parsed_url.path.rstrip("/")
                if path:
                    last_part = path.split("/")[-1]
                    safe_filename = f"{timestamp}_{domain}_{last_part}"
                else:
                    safe_filename = f"{timestamp}_{domain}"
                # Clean up filename
                safe_filename = "".join([c if c.isalnum() else "_" for c in safe_filename])[:60]
            
            # Ensure .json extension
            if not safe_filename.endswith('.json'):
                safe_filename += '.json'
            
            logging.info(f"Generated filename: {safe_filename}")
            
            # Save results to a file in the /workspace/scrape directory
            scrape_dir = f"{self.workspace_path}/scrape"
            self.sandbox.fs.create_folder(scrape_dir, "755")
            
            results_file_path = f"{scrape_dir}/{safe_filename}"
            json_content = json.dumps(formatted_result, ensure_ascii=False, indent=2)
            logging.info(f"Saving content to file: {results_file_path}, size: {len(json_content)} bytes")
            
            self.sandbox.fs.upload_file(
                results_file_path, 
                json_content.encode()
            )
            
            return ToolResult(
                success=True,
                output=f"Successfully saved the scrape of the website under path '{results_file_path}'."
            )
        
        except Exception as e:
            error_message = str(e)
            # Log the full error for debugging
            logging.error(f"Scraping error for URL '{url}': {error_message}")
            
            # Create a more informative error message for the user
            if "timeout" in error_message.lower():
                user_message = f"The request timed out while trying to scrape the webpage. The site might be slow or blocking automated access."
            elif "connection" in error_message.lower():
                user_message = f"Could not connect to the website. The site might be down or blocking access."
            elif "404" in error_message:
                user_message = f"The webpage was not found (404 error). Please check if the URL is correct."
            elif "403" in error_message:
                user_message = f"Access to the webpage was forbidden (403 error). The site may be blocking automated access."
            elif "401" in error_message:
                user_message = f"Authentication required to access this webpage (401 error)."
            else:
                user_message = f"Error scraping webpage: {error_message[:200]}"
                if len(error_message) > 200:
                    user_message += "..."
                    
            return self.fail_response(user_message)


if __name__ == "__main__":
    async def test_web_search():
        """Test function for the web search tool"""
        # This test function is not compatible with the sandbox version
        print("Test function needs to be updated for sandbox version")
    
    async def test_scrape_webpage():
        """Test function for the webpage scrape tool"""
        # This test function is not compatible with the sandbox version
        print("Test function needs to be updated for sandbox version")
    
    async def run_tests():
        """Run all test functions"""
        await test_web_search()
        await test_scrape_webpage()
        
    asyncio.run(run_tests())