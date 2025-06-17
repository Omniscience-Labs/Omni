import hmac
import hashlib
import time
import json
from typing import Dict, Any, Optional
from fastapi import HTTPException
from .models import SlackEventRequest, SlackWebhookPayload
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