import json
import os
import uuid
from typing import Union, Dict, Any, Optional

from core.agentpress.tool import Tool, ToolResult, openapi_schema, usage_example
from core.agentpress.thread_manager import ThreadManager
from core.tools.data_providers.LinkedinProvider import LinkedinProvider
from core.tools.data_providers.YahooFinanceProvider import YahooFinanceProvider
from core.tools.data_providers.AmazonProvider import AmazonProvider
from core.tools.data_providers.ZillowProvider import ZillowProvider
from core.tools.data_providers.TwitterProvider import TwitterProvider
from core.tools.data_providers.ApolloProvider import ApolloProvider, ApolloDirectAPI
from core.tools.data_providers.ActiveJobsProvider import ActiveJobsProvider
from core.utils.logger import logger


class DataProvidersTool(Tool):
    """Tool for making requests to various data providers."""

    def __init__(self, thread_manager: Optional[ThreadManager] = None, thread_id: Optional[str] = None):
        super().__init__()
        self.thread_manager = thread_manager
        self.thread_id = thread_id

        self.register_data_providers = {
            "linkedin": LinkedinProvider(),
            "yahoo_finance": YahooFinanceProvider(),
            "amazon": AmazonProvider(),
            "zillow": ZillowProvider(),
            "twitter": TwitterProvider(),
            "apollo": ApolloProvider(),
            "active_jobs": ActiveJobsProvider()
        }
        
        # Initialize Apollo Direct API client for lead generation
        self.apollo_direct_api = ApolloDirectAPI()

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_data_provider_endpoints",
            "description": "Get available endpoints for a specific data provider",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The name of the data provider (e.g., 'linkedin', 'twitter', 'zillow', 'amazon', 'yahoo_finance', 'apollo', 'active_jobs')"
                    }
                },
                "required": ["service_name"]
            }
        }
    })
    @usage_example('''
<!-- 
The get-data-provider-endpoints tool returns available endpoints for a specific data provider.
Use this tool when you need to discover what endpoints are available.
-->

<!-- Example to get LinkedIn API endpoints -->
<function_calls>
<invoke name="get_data_provider_endpoints">
<parameter name="service_name">linkedin</parameter>
</invoke>
</function_calls>
        ''')
    async def get_data_provider_endpoints(
        self,
        service_name: str
    ) -> ToolResult:
        """
        Get available endpoints for a specific data provider.
        
        Parameters:
        - service_name: The name of the data provider (e.g., 'linkedin')
        """
        try:
            if not service_name:
                return self.fail_response("Data provider name is required.")
                
            if service_name not in self.register_data_providers:
                return self.fail_response(f"Data provider '{service_name}' not found. Available data providers: {list(self.register_data_providers.keys())}")
                
            endpoints = self.register_data_providers[service_name].get_endpoints()
            return self.success_response(endpoints)
            
        except Exception as e:
            error_message = str(e)
            simplified_message = f"Error getting data provider endpoints: {error_message[:200]}"
            if len(error_message) > 200:
                simplified_message += "..."
            return self.fail_response(simplified_message)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "execute_data_provider_call",
            "description": "Execute a call to a specific data provider endpoint",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The name of the API service (e.g., 'linkedin', 'twitter', 'zillow', 'amazon', 'yahoo_finance', 'apollo', 'active_jobs')"
                    },
                    "route": {
                        "type": "string",
                        "description": "The key of the endpoint to call"
                    },
                    "payload": {
                        "type": "object",
                        "description": "The payload to send with the API call"
                    }
                },
                "required": ["service_name", "route"]
            }
        }
    })
    @usage_example('''
        <!-- 
        The execute-data-provider-call tool makes a request to a specific data provider endpoint.
        Use this tool when you need to call an data provider endpoint with specific parameters.
        The route must be a valid endpoint key obtained from get-data-provider-endpoints tool!!
        -->
        
        <!-- Example to call linkedIn service with the specific route person -->
        <function_calls>
        <invoke name="execute_data_provider_call">
        <parameter name="service_name">linkedin</parameter>
        <parameter name="route">person</parameter>
        <parameter name="payload">{"link": "https://www.linkedin.com/in/johndoe/"}</parameter>
        </invoke>
        </function_calls>
        ''')
    async def execute_data_provider_call(
        self,
        service_name: str,
        route: str,
        payload: Union[Dict[str, Any], str, None] = None
    ) -> ToolResult:
        """
        Execute a call to a specific data provider endpoint.
        
        Parameters:
        - service_name: The name of the data provider (e.g., 'linkedin')
        - route: The key of the endpoint to call
        - payload: The payload to send with the data provider call (dict or JSON string)
        """
        try:
            # Handle payload - it can be either a dict or a JSON string
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError as e:
                    return self.fail_response(f"Invalid JSON in payload: {str(e)}")
            elif payload is None:
                payload = {}
            # If payload is already a dict, use it as-is

            if not service_name:
                return self.fail_response("service_name is required.")

            if not route:
                return self.fail_response("route is required.")
                
            if service_name not in self.register_data_providers:
                return self.fail_response(f"API '{service_name}' not found. Available APIs: {list(self.register_data_providers.keys())}")
            
            data_provider = self.register_data_providers[service_name]
            if route == service_name:
                return self.fail_response(f"route '{route}' is the same as service_name '{service_name}'. YOU FUCKING IDIOT!")
            
            if route not in data_provider.get_endpoints().keys():
                return self.fail_response(f"Endpoint '{route}' not found in {service_name} data provider.")
            
            
            result = data_provider.call_endpoint(route, payload)
            return self.success_response(result)
            
        except Exception as e:
            error_message = str(e)
            print(error_message)
            simplified_message = f"Error executing data provider call: {error_message[:200]}"
            if len(error_message) > 200:
                simplified_message += "..."
            return self.fail_response(simplified_message)
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "apollo_match_lead",
            "description": "Match and retrieve detailed information about a person using Apollo.io's lead generation API. Returns comprehensive contact and professional information including email (if revealed), employment history, and organization details. Use this to find and enrich lead data for sales and marketing purposes. IMPORTANT: Always ask the user for explicit confirmation before setting reveal_personal_emails=true.",
            "parameters": {
                "type": "object",
                "properties": {
                    "first_name": {
                        "type": "string",
                        "description": "The person's first name (required)"
                    },
                    "last_name": {
                        "type": "string",
                        "description": "The person's last name (required)"
                    },
                    "organization_name": {
                        "type": "string",
                        "description": "The name of the company/organization the person works for (optional but recommended for better matching)"
                    },
                    "domain": {
                        "type": "string",
                        "description": "The company domain (e.g., 'apollo.io' or 'google.com'). Optional but helps with accurate matching"
                    },
                    "email": {
                        "type": "string",
                        "description": "The person's email address if known (optional, helps with matching)"
                    },
                    "linkedin_url": {
                        "type": "string",
                        "description": "The person's LinkedIn profile URL (optional, helps with accurate matching)"
                    },
                    "reveal_personal_emails": {
                        "type": "boolean",
                        "description": "Whether to reveal and return personal email addresses. IMPORTANT: This consumes Apollo credits. Always ask user for explicit confirmation before setting to true. Default: false",
                        "default": False
                    }
                },
                "required": ["first_name", "last_name"]
            }
        }
    })
    @usage_example('''
        <!-- Example 1: Basic lead matching without email reveal -->
        <function_calls>
        <invoke name="apollo_match_lead">
        <parameter name="first_name">Tim</parameter>
        <parameter name="last_name">Zheng</parameter>
        <parameter name="organization_name">Apollo</parameter>
        <parameter name="domain">apollo.io</parameter>
        </invoke>
        </function_calls>
        
        <!-- Example 2: With email reveal (after user confirmation) -->
        <function_calls>
        <invoke name="apollo_match_lead">
        <parameter name="first_name">Tim</parameter>
        <parameter name="last_name">Zheng</parameter>
        <parameter name="organization_name">Apollo</parameter>
        <parameter name="reveal_personal_emails">true</parameter>
        </invoke>
        </function_calls>
        
        <!-- Example 3: Using LinkedIn URL for more accurate matching -->
        <function_calls>
        <invoke name="apollo_match_lead">
        <parameter name="first_name">Tim</parameter>
        <parameter name="last_name">Zheng</parameter>
        <parameter name="linkedin_url">http://www.linkedin.com/in/tim-zheng-677ba010</parameter>
        <parameter name="reveal_personal_emails">true</parameter>
        </invoke>
        </function_calls>
        ''')
    async def apollo_match_lead(
        self,
        first_name: str,
        last_name: str,
        organization_name: Optional[str] = None,
        domain: Optional[str] = None,
        email: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        reveal_personal_emails: bool = False
    ) -> ToolResult:
        """
        Match and retrieve detailed information about a person using Apollo.io's direct API.
        
        Returns comprehensive lead data including:
        - Personal information (name, title, location)
        - Contact information (email with verification status)
        - Employment history
        - Organization details
        - Social profiles
        """
        try:
            logger.info(f"Apollo lead match requested for: {first_name} {last_name}")
            
            # Call Apollo Direct API
            result = await self.apollo_direct_api.match_person(
                first_name=first_name,
                last_name=last_name,
                organization_name=organization_name,
                domain=domain,
                email=email,
                linkedin_url=linkedin_url,
                reveal_personal_emails=reveal_personal_emails
            )
            
            # Check if person was found
            if not result.get('person'):
                return self.fail_response(
                    f"Could not find person matching: {first_name} {last_name}" +
                    (f" at {organization_name}" if organization_name else "")
                )
            
            logger.info(f"Apollo lead match successful for: {first_name} {last_name}")
            return self.success_response(result)
            
        except ValueError as e:
            # API key not configured
            logger.error(f"Apollo API configuration error: {e}")
            return self.fail_response(str(e))
        except Exception as e:
            error_message = str(e)
            logger.error(f"Apollo lead match error: {error_message}")
            simplified_message = f"Error matching lead in Apollo: {error_message[:200]}"
            if len(error_message) > 200:
                simplified_message += "..."
            return self.fail_response(simplified_message)
    
    # TEMPORARILY DISABLED: Apollo phone reveal tool
    # @openapi_schema({
    #     "type": "function",
    #     "function": {
    #         "name": "apollo_reveal_phone",
    #         "description": "Request phone number reveal for a matched person using Apollo.io. This is an ASYNCHRONOUS operation - the phone number will be delivered via webhook and you'll be notified when it arrives (typically 30-60 seconds). IMPORTANT: This consumes Apollo credits. Always ask the user for explicit confirmation before using this tool. Use apollo_match_lead first to identify the person, then use this tool to reveal their phone number.",
    #         "parameters": {
    #             "type": "object",
    #             "properties": {
    #                 "first_name": {
    #                     "type": "string",
    #                     "description": "The person's first name (required)"
    #                 },
    #                 "last_name": {
    #                     "type": "string",
    #                     "description": "The person's last name (required)"
    #                 },
    #                 "organization_name": {
    #                     "type": "string",
    #                     "description": "The name of the company/organization the person works for (optional but recommended for better matching)"
    #                 },
    #                 "domain": {
    #                     "type": "string",
    #                     "description": "The company domain (e.g., 'apollo.io' or 'google.com'). Optional but helps with accurate matching"
    #                 },
    #                 "email": {
    #                     "type": "string",
    #                     "description": "The person's email address if known (optional, helps with matching)"
    #                 }
    #             },
    #             "required": ["first_name", "last_name"]
    #         }
    #     }
    # })
    # @usage_example('''
    #     <!-- Example: Request phone number reveal (after user confirmation) -->
    #     <function_calls>
    #     <invoke name="apollo_reveal_phone">
    #     <parameter name="first_name">Tim</parameter>
        <parameter name="last_name">Zheng</parameter>
        <parameter name="organization_name">Apollo</parameter>
        <parameter name="domain">apollo.io</parameter>
        </invoke>
        </function_calls>
        ''')
    # async def apollo_reveal_phone(
    #     self,
    #     first_name: str,
    #     last_name: str,
    #     organization_name: Optional[str] = None,
    #     domain: Optional[str] = None,
    #     email: Optional[str] = None
    # ) -> ToolResult:
    #     """
    #     Request phone number reveal for a person (asynchronous with webhook callback).
    #
    #     This method:
    #     1. Creates a webhook request in the database
    #     2. Calls Apollo API with webhook URL
    #     3. Returns immediately with pending status
    #     4. Phone numbers will be delivered to webhook endpoint
    #     5. User will be notified when phone numbers arrive
    #
    #     Args:
    #         first_name: Person's first name
    #         last_name: Person's last name
    #         organization_name: Optional organization name
    #         domain: Optional company domain
    #         email: Optional email address
    #     """
    #     try:
    #         if not self.thread_id:
    #             return self.fail_response("Thread ID not available for phone reveal webhook")
    #
    #         logger.info(f"Apollo phone reveal requested for: {first_name} {last_name}")
    #
    #         # Generate unique webhook secret
    #         webhook_secret = str(uuid.uuid4())
    #
    #         # Build webhook URL
    #         webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
    #         webhook_url = f"{webhook_base_url}/api/tools/apollo/webhook/{webhook_secret}"
    #
    #         # Store webhook request in database
    #         from core.services.supabase import DBConnection
    #         db = DBConnection()
    #         client = await db.client
    #
    #         webhook_data = {
    #             "thread_id": self.thread_id,
    #             "webhook_secret": webhook_secret,
    #             "person_data": {
    #                 "first_name": first_name,
    #                 "last_name": last_name,
    #                 "organization_name": organization_name,
    #                 "domain": domain,
    #                 "email": email
    #             },
    #             "status": "pending"
    #         }
    #
    #         result = await client.table("apollo_webhook_requests").insert(webhook_data).execute()
    #
    #         if not result.data:
    #             return self.fail_response("Failed to create webhook request in database")
    #
    #         # Call Apollo API with webhook URL
    #         try:
    #             await self.apollo_direct_api.match_person(
    #                 first_name=first_name,
    #                 last_name=last_name,
    #                 organization_name=organization_name,
    #                 domain=domain,
    #                 email=email,
    #                 reveal_phone_number=True,
    #                 webhook_url=webhook_url
    #             )
    #         except Exception as api_error:
    #             # Clean up database record if API call fails
    #             await client.table("apollo_webhook_requests").update(
    #                 {"status": "failed"}
    #             ).eq("webhook_secret", webhook_secret).execute()
    #             raise api_error
    #
    #         logger.info(f"Apollo phone reveal webhook created with secret: {webhook_secret}")
    #
    #         return self.success_response({
    #             "status": "pending",
    #             "message": f"Phone number reveal requested for {first_name} {last_name}. This typically takes 30-60 seconds. You'll be notified when the phone number arrives.",
    #             "webhook_id": webhook_secret,
    #             "person": {
    #                 "first_name": first_name,
    #                 "last_name": last_name,
    #                 "organization_name": organization_name
    #             }
    #         })
    #
    #     except ValueError as e:
    #         # API key not configured
    #         logger.error(f"Apollo API configuration error: {e}")
    #         return self.fail_response(str(e))
    #     except Exception as e:
    #         error_message = str(e)
    #         logger.error(f"Apollo phone reveal error: {error_message}")
    #         simplified_message = f"Error requesting phone reveal from Apollo: {error_message[:200]}"
    #         if len(error_message) > 200:
    #             simplified_message += "..."
    #         return self.fail_response(simplified_message)
