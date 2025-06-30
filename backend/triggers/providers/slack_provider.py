"""
Slack trigger provider for agent triggers.

This provider handles Slack app integration for triggering agents based on events.
"""

import httpx
import hmac
import hashlib
import time
from typing import Dict, Any, Optional
from utils.logger import logger
from ..core import TriggerProvider, TriggerType, TriggerEvent, TriggerResult, TriggerConfig, ProviderDefinition

class SlackTriggerProvider(TriggerProvider):
    """Slack trigger provider for agents."""
    
    def __init__(self, provider_definition: Optional[ProviderDefinition] = None):
        super().__init__(TriggerType.SLACK, provider_definition)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate Slack trigger configuration.
        
        Required config:
        - signing_secret: Slack app signing secret
        - bot_token: Optional Slack bot token for responses
        """
        if not config.get('signing_secret'):
            raise ValueError("signing_secret is required for Slack triggers")
        
        validated_config = {
            'signing_secret': config['signing_secret'],
            'bot_token': config.get('bot_token', ''),
            'allowed_channels': config.get('allowed_channels', []),
            'trigger_keywords': config.get('trigger_keywords', []),
            'respond_to_mentions': config.get('respond_to_mentions', True),
            'respond_to_direct_messages': config.get('respond_to_direct_messages', True),
        }
        
        for list_field in ['allowed_channels', 'trigger_keywords']:
            if not isinstance(validated_config[list_field], list):
                raise ValueError(f"{list_field} must be a list")
        
        return validated_config
    
    async def setup_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Set up Slack webhook for the trigger."""
        try:
            signing_secret = trigger_config.config['signing_secret']
            
            if not signing_secret:
                logger.error(f"Invalid signing secret for trigger {trigger_config.trigger_id}")
                return False
            
            logger.info(f"Successfully set up Slack webhook for trigger {trigger_config.trigger_id}")
            return True
                
        except Exception as e:
            logger.error(f"Error setting up Slack trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def teardown_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Remove Slack webhook for the trigger."""
        try:
            logger.info(f"Successfully tore down Slack webhook for trigger {trigger_config.trigger_id}")
            return True
                
        except Exception as e:
            logger.error(f"Error tearing down Slack trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        """Process Slack webhook event."""
        try:
            event_data = event.raw_data
            
            if event_data.get('type') == 'url_verification':
                return TriggerResult(
                    success=True,
                    should_execute_agent=False,
                    response_data={"challenge": event_data.get('challenge')}
                )
            

            slack_event = event_data.get('event', {})
            if not slack_event:
                return TriggerResult(
                    success=True,
                    should_execute_agent=False,
                    response_data={"message": "No event data in Slack webhook"}
                )
            
            default_config = {
                'signing_secret': '',
                'bot_token': '',
                'allowed_channels': [],
                'trigger_keywords': [],
                'respond_to_mentions': True,
                'respond_to_direct_messages': True,
            }
            
            should_trigger = await self._should_trigger_agent(slack_event, default_config)
            
            if not should_trigger:
                return TriggerResult(
                    success=True,
                    should_execute_agent=False,
                    response_data={"message": "Event did not meet trigger criteria"}
                )
            
            agent_prompt = self._create_agent_prompt(slack_event, default_config)
            
            execution_variables = {
                'slack_message_text': slack_event.get('text', ''),
                'slack_user_id': slack_event.get('user', ''),
                'slack_channel_id': slack_event.get('channel', ''),
                'slack_timestamp': slack_event.get('ts', ''),
                'slack_event_type': slack_event.get('type', ''),
                'trigger_type': 'slack',
                'trigger_id': event.trigger_id,
                'agent_id': event.agent_id
            }
            
            return TriggerResult(
                success=True,
                should_execute_agent=True,
                agent_prompt=agent_prompt,
                execution_variables=execution_variables,
                metadata={
                    'slack_data': slack_event,
                    'trigger_config': default_config
                }
            )
            
        except Exception as e:
            logger.error(f"Error processing Slack event for trigger {event.trigger_id}: {e}")
            return TriggerResult(
                success=False,
                error_message=f"Error processing Slack event: {str(e)}"
            )
    
    async def health_check(self, trigger_config: TriggerConfig) -> bool:
        """Check if Slack integration is healthy."""
        try:
            signing_secret = trigger_config.config.get('signing_secret')
            return bool(signing_secret)
                    
        except Exception as e:
            logger.error(f"Health check failed for Slack trigger {trigger_config.trigger_id}: {e}")
            return False
    
    def get_config_schema(self) -> Dict[str, Any]:
        """Get configuration schema for Slack triggers."""
        return {
            "type": "object",
            "properties": {
                "signing_secret": {
                    "type": "string",
                    "description": "Slack app signing secret for webhook verification"
                },
                "bot_token": {
                    "type": "string",
                    "description": "Slack bot token for sending responses"
                },
                "allowed_channels": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of allowed channel IDs (empty = allow all)"
                },
                "trigger_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords that trigger the agent"
                },
                "respond_to_mentions": {
                    "type": "boolean",
                    "description": "Whether to respond to mentions",
                    "default": True
                },
                "respond_to_direct_messages": {
                    "type": "boolean",
                    "description": "Whether to respond to direct messages",
                    "default": True
                }
            },
            "required": ["signing_secret"],
            "additionalProperties": False
        }
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> str:
        """Get webhook URL for this Slack trigger."""
        return f"{base_url}/api/triggers/{trigger_id}/webhook"
    
    async def _should_trigger_agent(self, event_data: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Determine if Slack event should trigger the agent."""
        logger.info(f"Slack event data: {event_data}")
        logger.info(f"Event type: {event_data.get('type')}")
        
        event_type = event_data.get('type')
        if event_type not in ['message', 'app_mention']:
            logger.info(f"Not a message or app_mention event, skipping. Type: {event_type}")
            return False
        
        if event_data.get('bot_id') or event_data.get('subtype'):
            logger.info(f"Bot message or subtype message, skipping. Bot ID: {event_data.get('bot_id')}, Subtype: {event_data.get('subtype')}")
            return False

        allowed_channels = config.get('allowed_channels', [])
        channel_id = event_data.get('channel', '')
        if allowed_channels and channel_id not in allowed_channels:
            logger.info(f"Channel not allowed. Channel: {channel_id}, Allowed: {allowed_channels}")
            return False
        
        message_text = event_data.get('text', '').lower()
        logger.info(f"Message text: '{message_text}'")

        if config.get('respond_to_mentions', True):
            if '<@' in message_text:
                logger.info("Message contains mention, triggering agent")
                return True
        
        if config.get('respond_to_direct_messages', True):
            pass
        
        trigger_keywords = config.get('trigger_keywords', [])
        if trigger_keywords:
            for keyword in trigger_keywords:
                if keyword.lower() in message_text:
                    logger.info(f"Keyword '{keyword}' found in message, triggering agent")
                    return True
        
        if not trigger_keywords and not allowed_channels:
            logger.info("No keywords or channel restrictions, triggering agent")
            return True
        
        logger.info("No trigger criteria met, not triggering agent")
        return False
    
    def _create_agent_prompt(self, event_data: Dict[str, Any], config: Dict[str, Any]) -> str:
        """Create prompt for the agent based on the Slack event."""
        message_text = event_data.get('text', '')
        user_id = event_data.get('user', 'Unknown User')
        channel_id = event_data.get('channel', '')
        
        prompt = f"You received a message from user {user_id} in Slack channel {channel_id}: \"{message_text}\""
        prompt += "\n\nPlease respond appropriately to this message. Your response will be sent back to the Slack channel."
        
        return prompt
    
    async def _get_trigger_config(self, trigger_id: str) -> Optional[TriggerConfig]:
        """Get trigger configuration by ID."""
        return None 