"""
Telegram trigger provider for agent triggers.

This provider handles Telegram bot integration for triggering agents based on messages.
"""

import httpx
import json
from typing import Dict, Any, Optional
from utils.logger import logger
from ..core import TriggerProvider, TriggerType, TriggerEvent, TriggerResult, TriggerConfig, ProviderDefinition

class TelegramTriggerProvider(TriggerProvider):
    """Telegram trigger provider for agents."""
    
    def __init__(self, provider_definition: Optional[ProviderDefinition] = None):
        super().__init__(TriggerType.TELEGRAM, provider_definition)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate Telegram trigger configuration.
        
        Required config:
        - bot_token: Telegram bot token
        - secret_token: Optional webhook secret token
        - allowed_users: Optional list of allowed user IDs
        - allowed_chats: Optional list of allowed chat IDs
        - trigger_commands: Optional list of commands that trigger the agent
        - trigger_keywords: Optional list of keywords that trigger the agent
        """
        if not config.get('bot_token'):
            raise ValueError("bot_token is required for Telegram triggers")
        
        bot_token = config['bot_token']
        if not bot_token or ':' not in bot_token:
            raise ValueError("Invalid bot_token format. Should be like '123456:ABC-DEF...'")
        
        validated_config = {
            'bot_token': bot_token,
            'secret_token': config.get('secret_token', ''),
            'allowed_users': config.get('allowed_users', []),
            'allowed_chats': config.get('allowed_chats', []),
            'trigger_commands': config.get('trigger_commands', []),
            'trigger_keywords': config.get('trigger_keywords', []),
            'respond_to_all_messages': config.get('respond_to_all_messages', False),
            'response_mode': config.get('response_mode', 'reply'),  # 'reply' or 'new_message'
        }
        
        # Validate lists are actually lists
        for list_field in ['allowed_users', 'allowed_chats', 'trigger_commands', 'trigger_keywords']:
            if not isinstance(validated_config[list_field], list):
                raise ValueError(f"{list_field} must be a list")
        
        return validated_config
    
    async def setup_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Set up Telegram webhook for the trigger."""
        try:
            bot_token = trigger_config.config['bot_token']
            secret_token = trigger_config.config.get('secret_token', '')
            
            # Get webhook URL - this should be provided by the trigger manager
            webhook_url = self.get_webhook_url(trigger_config.trigger_id, self._get_base_url())
            
            # Set up Telegram webhook
            result = await self._setup_telegram_webhook(bot_token, webhook_url, secret_token)
            
            if result.get('success'):
                logger.info(f"Successfully set up Telegram webhook for trigger {trigger_config.trigger_id}")
                return True
            else:
                logger.error(f"Failed to set up Telegram webhook for trigger {trigger_config.trigger_id}: {result.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"Error setting up Telegram trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def teardown_trigger(self, trigger_config: TriggerConfig) -> bool:
        """Remove Telegram webhook for the trigger."""
        try:
            bot_token = trigger_config.config['bot_token']
            result = await self._remove_telegram_webhook(bot_token)
            
            if result.get('success'):
                logger.info(f"Successfully removed Telegram webhook for trigger {trigger_config.trigger_id}")
                return True
            else:
                logger.warning(f"Failed to remove Telegram webhook for trigger {trigger_config.trigger_id}: {result.get('error')}")
                return False  # Don't fail teardown if webhook removal fails
                
        except Exception as e:
            logger.error(f"Error tearing down Telegram trigger {trigger_config.trigger_id}: {e}")
            return False
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        """Process Telegram webhook event."""
        try:
            # Parse Telegram update
            update_data = event.raw_data
            
            if not update_data.get('update_id'):
                return TriggerResult(
                    success=False,
                    error_message="Invalid Telegram update format"
                )
            
            # Extract message data
            message_data = self._extract_message_data(update_data)
            if not message_data:
                return TriggerResult(
                    success=True,
                    should_execute_agent=False,
                    response_data={"message": "No processable message in update"}
                )
            
            config = {
                'respond_to_all_messages': True,
                'trigger_commands': [],
                'trigger_keywords': [],
                'allowed_users': [],
                'allowed_chats': []
            }

            should_trigger = await self._should_trigger_agent(message_data, config)
            
            if not should_trigger:
                return TriggerResult(
                    success=True,
                    should_execute_agent=False,
                    response_data={"message": "Message did not meet trigger criteria"}
                )
            
            agent_prompt = self._create_agent_prompt(message_data, config)
            
            execution_variables = {
                'telegram_message_text': message_data['text'],
                'telegram_user_id': message_data['user_id'],
                'telegram_user_name': message_data.get('user_name', 'Unknown'),
                'telegram_chat_id': message_data['chat_id'],
                'telegram_chat_type': message_data.get('chat_type', 'private'),
                'telegram_message_id': message_data['message_id'],
                'telegram_update_id': update_data['update_id'],
                'trigger_type': 'telegram',
                'trigger_id': event.trigger_id,
                'agent_id': event.agent_id
            }
            
            return TriggerResult(
                success=True,
                should_execute_agent=True,
                agent_prompt=agent_prompt,
                execution_variables=execution_variables,
                metadata={
                    'telegram_data': message_data,
                    'trigger_config': config
                }
            )
            
        except Exception as e:
            logger.error(f"Error processing Telegram event for trigger {event.trigger_id}: {e}")
            return TriggerResult(
                success=False,
                error_message=f"Error processing Telegram event: {str(e)}"
            )
    
    async def health_check(self, trigger_config: TriggerConfig) -> bool:
        """Check if Telegram bot is healthy."""
        try:
            bot_token = trigger_config.config['bot_token']
            
            # Test bot token by getting bot info
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get('ok', False)
                else:
                    return False
                    
        except Exception as e:
            logger.error(f"Health check failed for Telegram trigger {trigger_config.trigger_id}: {e}")
            return False
    
    def get_config_schema(self) -> Dict[str, Any]:
        """Get configuration schema for Telegram triggers."""
        return {
            "type": "object",
            "properties": {
                "bot_token": {
                    "type": "string",
                    "description": "Telegram bot token from @BotFather",
                    "pattern": r"^\d+:[A-Za-z0-9_-]+$"
                },
                "secret_token": {
                    "type": "string",
                    "description": "Optional secret token for webhook security",
                    "maxLength": 256
                },
                "allowed_users": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "List of allowed user IDs (empty = allow all)"
                },
                "allowed_chats": {
                    "type": "array", 
                    "items": {"type": "integer"},
                    "description": "List of allowed chat IDs (empty = allow all)"
                },
                "trigger_commands": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Commands that trigger the agent (e.g., ['/help', '/start'])"
                },
                "trigger_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords that trigger the agent"
                },
                "respond_to_all_messages": {
                    "type": "boolean",
                    "description": "Whether to respond to all messages (ignores commands/keywords)",
                    "default": False
                },
                "response_mode": {
                    "type": "string",
                    "enum": ["reply", "new_message"],
                    "description": "How to respond - reply to message or send new message",
                    "default": "reply"
                }
            },
            "required": ["bot_token"],
            "additionalProperties": False
        }
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> str:
        """Get webhook URL for this Telegram trigger."""
        return f"{base_url}/api/triggers/{trigger_id}/webhook"
    
    def _extract_message_data(self, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract message data from Telegram update."""
        message = None
        
        # Check for regular message
        if update_data.get('message'):
            message = update_data['message']
        # Check for edited message
        elif update_data.get('edited_message'):
            message = update_data['edited_message']
        
        if not message:
            return None
        
        # Extract user info
        user = message.get('from', {})
        chat = message.get('chat', {})
        
        return {
            'text': message.get('text', ''),
            'message_id': message.get('message_id', 0),
            'user_id': user.get('id', 0),
            'user_name': user.get('first_name', '') + (' ' + user.get('last_name', '')).strip(),
            'username': user.get('username', ''),
            'chat_id': chat.get('id', 0),
            'chat_type': chat.get('type', 'private'),
            'chat_title': chat.get('title', ''),
            'timestamp': message.get('date', 0)
        }
    
    async def _should_trigger_agent(self, message_data: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Determine if message should trigger the agent."""
        # Check if message has text
        if not message_data.get('text'):
            return False
        
        # Check user allowlist
        allowed_users = config.get('allowed_users', [])
        if allowed_users and message_data['user_id'] not in allowed_users:
            return False
        
        # Check chat allowlist
        allowed_chats = config.get('allowed_chats', [])
        if allowed_chats and message_data['chat_id'] not in allowed_chats:
            return False
        
        # If respond to all messages is enabled, trigger for any allowed message
        if config.get('respond_to_all_messages', False):
            return True
        
        message_text = message_data['text'].lower()
        
        # Check trigger commands
        trigger_commands = config.get('trigger_commands', [])
        if trigger_commands:
            for command in trigger_commands:
                if message_text.startswith(command.lower()):
                    return True
        
        # Check trigger keywords
        trigger_keywords = config.get('trigger_keywords', [])
        if trigger_keywords:
            for keyword in trigger_keywords:
                if keyword.lower() in message_text:
                    return True
        
        # If no specific triggers are configured, don't trigger
        if not trigger_commands and not trigger_keywords:
            return False
        
        return False
    
    def _create_agent_prompt(self, message_data: Dict[str, Any], config: Dict[str, Any]) -> str:
        """Create prompt for the agent based on the message."""
        message_text = message_data.get('text', '')
        return message_text
    
    async def _setup_telegram_webhook(self, bot_token: str, webhook_url: str, secret_token: str = "") -> Dict[str, Any]:
        """Set up Telegram webhook."""
        try:
            telegram_api_url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
            
            payload = {
                "url": webhook_url,
                "drop_pending_updates": True
            }
            
            if secret_token:
                payload["secret_token"] = secret_token
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(telegram_api_url, json=payload)
                response_data = response.json()
                
                if response.status_code == 200 and response_data.get("ok"):
                    return {
                        "success": True,
                        "message": response_data.get("description", "Webhook set successfully")
                    }
                else:
                    return {
                        "success": False,
                        "error": response_data.get("description", f"HTTP {response.status_code}")
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Error setting up webhook: {str(e)}"
            }
    
    async def _remove_telegram_webhook(self, bot_token: str) -> Dict[str, Any]:
        """Remove Telegram webhook."""
        try:
            telegram_api_url = f"https://api.telegram.org/bot{bot_token}/deleteWebhook"
            
            payload = {
                "drop_pending_updates": True
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(telegram_api_url, json=payload)
                response_data = response.json()
                
                if response.status_code == 200 and response_data.get("ok"):
                    return {
                        "success": True,
                        "message": response_data.get("description", "Webhook removed successfully")
                    }
                else:
                    return {
                        "success": False,
                        "error": response_data.get("description", f"HTTP {response.status_code}")
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": f"Error removing webhook: {str(e)}"
            }
    
    def _get_base_url(self) -> str:
        """Get base URL for webhooks."""
        import os
        return os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
    
    async def _get_trigger_config(self, trigger_id: str) -> Optional[TriggerConfig]:
        """Get trigger configuration by ID."""
        return None 