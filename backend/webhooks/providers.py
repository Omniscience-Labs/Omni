import hmac
import hashlib
import time
import json
import httpx
from typing import Dict, Any, Optional
from fastapi import HTTPException
from .models import SlackEventRequest, SlackWebhookPayload, TelegramUpdateRequest, TelegramWebhookPayload
from utils.logger import logger

class SlackWebhookProvider:
    """Handles Slack webhook events and verification."""
    
    @staticmethod
    def verify_signature(body: bytes, timestamp: str, signature: str, signing_secret: str) -> bool:
        """Verify Slack request signature."""
        try:
            basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
            my_signature = f"v0={hmac.new(signing_secret.encode(), basestring.encode(), hashlib.sha256).hexdigest()}"
            return hmac.compare_digest(my_signature, signature)
        except Exception as e:
            logger.error(f"Error verifying Slack signature: {e}")
            return False
    
    @staticmethod
    def validate_request_timing(timestamp: str, tolerance: int = 300) -> bool:
        """Validate that the request is not too old (replay attack protection)."""
        try:
            request_time = int(timestamp)
            current_time = int(time.time())
            return abs(current_time - request_time) < tolerance
        except (ValueError, TypeError):
            return False
    
    @staticmethod
    def process_event(event_data: SlackEventRequest) -> Optional[SlackWebhookPayload]:
        """Process Slack event and extract relevant data."""
        try:
            # Handle cases where type might be None (empty verification requests)
            if not event_data.type:
                logger.info("Slack event has no type, likely verification ping")
                return None
                
            if event_data.type == "url_verification":
                return None
            
            if event_data.type == "event_callback" and event_data.event:
                event = event_data.event
                event_type = event.get("type")
                
                if event_type == "app_mention":
                    text = event.get("text", "")
                    user_id = event.get("user", "")
                    channel_id = event.get("channel", "")
                    timestamp = event.get("ts", "")
                    import re
                    clean_text = re.sub(r'<@[^>]+>', '', text).strip()
                    
                    return SlackWebhookPayload(
                        text=clean_text,
                        user_id=user_id,
                        channel_id=channel_id,
                        team_id=event_data.team_id or "",
                        timestamp=timestamp,
                        event_type=event_type,
                        trigger_word="mention"
                    )
                
                elif event_type == "message":
                    if event.get("channel_type") == "im":
                        text = event.get("text", "")
                        user_id = event.get("user", "")
                        channel_id = event.get("channel", "")
                        timestamp = event.get("ts", "")
                        
                        return SlackWebhookPayload(
                            text=text,
                            user_id=user_id,
                            channel_id=channel_id,
                            team_id=event_data.team_id or "",
                            timestamp=timestamp,
                            event_type=event_type,
                            trigger_word="direct_message"
                        )
            
            logger.warning(f"Unhandled Slack event type: {event_data.type}")
            return None
            
        except Exception as e:
            logger.error(f"Error processing Slack event: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing Slack event: {str(e)}")

class TelegramWebhookProvider:
    """Handles Telegram webhook events and verification."""
    
    @staticmethod
    def verify_webhook_secret(body: bytes, secret_token: str, telegram_secret_token: str) -> bool:
        """Verify Telegram webhook secret token."""
        try:
            return secret_token == telegram_secret_token
        except Exception as e:
            logger.error(f"Error verifying Telegram secret token: {e}")
            return False
    
    @staticmethod
    async def setup_webhook(bot_token: str, webhook_url: str, secret_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Automatically set up the Telegram webhook by calling the Telegram Bot API.
        
        Args:
            bot_token: The Telegram bot token
            webhook_url: The webhook URL to set
            secret_token: Optional secret token for additional security
            
        Returns:
            Dict containing the API response
        """
        try:
            telegram_api_url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
            
            payload = {
                "url": webhook_url,
                "drop_pending_updates": True  # Clear any pending updates
            }
            
            if secret_token:
                payload["secret_token"] = secret_token
            
            logger.info(f"Setting up Telegram webhook: {webhook_url}")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(telegram_api_url, json=payload)
                response_data = response.json()
                
                if response.status_code == 200 and response_data.get("ok"):
                    logger.info(f"Successfully set up Telegram webhook: {response_data.get('description', 'Webhook set')}")
                    return {
                        "success": True,
                        "message": response_data.get("description", "Webhook set successfully"),
                        "response": response_data
                    }
                else:
                    error_msg = response_data.get("description", f"HTTP {response.status_code}")
                    logger.error(f"Failed to set up Telegram webhook: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "response": response_data
                    }
                    
        except httpx.TimeoutException:
            error_msg = "Timeout while connecting to Telegram API"
            logger.error(f"Telegram webhook setup failed: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }
        except Exception as e:
            error_msg = f"Error setting up Telegram webhook: {str(e)}"
            logger.error(error_msg)
            return {
                "success": False,
                "error": error_msg
            }
    
    @staticmethod
    async def remove_webhook(bot_token: str) -> Dict[str, Any]:
        """
        Remove the Telegram webhook by calling the Telegram Bot API.
        
        Args:
            bot_token: The Telegram bot token
            
        Returns:
            Dict containing the API response
        """
        try:
            telegram_api_url = f"https://api.telegram.org/bot{bot_token}/deleteWebhook"
            
            payload = {
                "drop_pending_updates": True  # Clear any pending updates
            }
            
            logger.info("Removing Telegram webhook")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(telegram_api_url, json=payload)
                response_data = response.json()
                
                if response.status_code == 200 and response_data.get("ok"):
                    logger.info(f"Successfully removed Telegram webhook: {response_data.get('description', 'Webhook removed')}")
                    return {
                        "success": True,
                        "message": response_data.get("description", "Webhook removed successfully"),
                        "response": response_data
                    }
                else:
                    error_msg = response_data.get("description", f"HTTP {response.status_code}")
                    logger.error(f"Failed to remove Telegram webhook: {error_msg}")
                    return {
                        "success": False,
                        "error": error_msg,
                        "response": response_data
                    }
                    
        except httpx.TimeoutException:
            error_msg = "Timeout while connecting to Telegram API"
            logger.error(f"Telegram webhook removal failed: {error_msg}")
            return {
                "success": False,
                "error": error_msg
            }
        except Exception as e:
            error_msg = f"Error removing Telegram webhook: {str(e)}"
            logger.error(error_msg)
            return {
                "success": False,
                "error": error_msg
            }
    
    @staticmethod
    def process_update(update_data: TelegramUpdateRequest) -> Optional[TelegramWebhookPayload]:
        """Process Telegram update and extract relevant data."""
        try:
            # Handle regular messages
            if update_data.message:
                message = update_data.message
                text = message.get("text", "")
                
                # Skip if no text content
                if not text:
                    logger.info("Telegram message has no text content")
                    return None
                
                user = message.get("from", {})
                chat = message.get("chat", {})
                
                return TelegramWebhookPayload(
                    text=text,
                    user_id=str(user.get("id", "")),
                    chat_id=str(chat.get("id", "")),
                    message_id=message.get("message_id", 0),
                    timestamp=message.get("date", 0),
                    update_type="message",
                    user_first_name=user.get("first_name"),
                    user_last_name=user.get("last_name"),
                    user_username=user.get("username"),
                    chat_type=chat.get("type"),
                    chat_title=chat.get("title")
                )
            
            # Handle edited messages
            elif update_data.edited_message:
                message = update_data.edited_message
                text = message.get("text", "")
                
                if not text:
                    logger.info("Telegram edited message has no text content")
                    return None
                
                user = message.get("from", {})
                chat = message.get("chat", {})
                
                return TelegramWebhookPayload(
                    text=text,
                    user_id=str(user.get("id", "")),
                    chat_id=str(chat.get("id", "")),
                    message_id=message.get("message_id", 0),
                    timestamp=message.get("edit_date", message.get("date", 0)),
                    update_type="edited_message",
                    user_first_name=user.get("first_name"),
                    user_last_name=user.get("last_name"),
                    user_username=user.get("username"),
                    chat_type=chat.get("type"),
                    chat_title=chat.get("title")
                )
            
            # Handle callback queries (inline keyboard button presses)
            elif update_data.callback_query:
                callback = update_data.callback_query
                data = callback.get("data", "")
                
                if not data:
                    logger.info("Telegram callback query has no data")
                    return None
                
                user = callback.get("from", {})
                message = callback.get("message", {})
                chat = message.get("chat", {}) if message else {}
                
                return TelegramWebhookPayload(
                    text=f"Callback: {data}",
                    user_id=str(user.get("id", "")),
                    chat_id=str(chat.get("id", "")),
                    message_id=message.get("message_id", 0) if message else 0,
                    timestamp=int(time.time()),
                    update_type="callback_query",
                    user_first_name=user.get("first_name"),
                    user_last_name=user.get("last_name"),
                    user_username=user.get("username"),
                    chat_type=chat.get("type"),
                    chat_title=chat.get("title")
                )
            
            logger.warning(f"Unhandled Telegram update type: {update_data.dict()}")
            return None
            
        except Exception as e:
            logger.error(f"Error processing Telegram update: {e}")
            raise HTTPException(status_code=400, detail=f"Error processing Telegram update: {str(e)}")

class GenericWebhookProvider:
    """Handles generic webhook events."""
    
    @staticmethod
    def process_payload(data: Dict[str, Any]) -> Dict[str, Any]:
        """Process generic webhook payload."""
        return {
            "payload": data,
            "trigger_type": "webhook",
            "processed_at": time.time()
        } 