import abc
import uuid
import importlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Union, Type
from pydantic import BaseModel, Field
from enum import Enum

class TriggerType(str, Enum):
    """Supported trigger types."""
    TELEGRAM = "telegram"
    SLACK = "slack"
    WEBHOOK = "webhook"
    SCHEDULE = "schedule"
    EMAIL = "email"
    GITHUB = "github"
    DISCORD = "discord"

class TriggerStatus(str, Enum):
    """Trigger status states."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    CONFIGURING = "configuring"

class TriggerEvent(BaseModel):
    """Represents an incoming trigger event."""
    trigger_id: str
    agent_id: str
    trigger_type: TriggerType
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    raw_data: Dict[str, Any]
    processed_data: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        use_enum_values = True

class TriggerResult(BaseModel):
    """Result of trigger processing."""
    success: bool
    should_execute_agent: bool = False
    should_execute_workflow: bool = False
    agent_prompt: Optional[str] = None
    workflow_id: Optional[str] = None
    workflow_input: Optional[Dict[str, Any]] = None
    execution_variables: Dict[str, Any] = Field(default_factory=dict)
    response_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class TriggerConfig(BaseModel):
    """Base configuration for triggers."""
    trigger_id: str
    agent_id: str
    trigger_type: TriggerType
    name: str
    description: Optional[str] = None
    is_active: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        use_enum_values = True

class ProviderDefinition(BaseModel):
    """Definition of a trigger provider for dynamic loading."""
    provider_id: str
    name: str
    description: str
    trigger_type: str
    provider_class: Optional[str] = None
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    webhook_enabled: bool = False
    setup_required: bool = True
    
    webhook_config: Optional[Dict[str, Any]] = None
    response_template: Optional[Dict[str, Any]] = None
    field_mappings: Optional[Dict[str, str]] = None

class TriggerProvider(abc.ABC):
    """Abstract base class for trigger providers."""
    
    def __init__(self, trigger_type: TriggerType, provider_definition: Optional[ProviderDefinition] = None):
        self.trigger_type = trigger_type
        self.provider_definition = provider_definition
    
    @abc.abstractmethod
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        pass
    
    @abc.abstractmethod
    async def setup_trigger(self, trigger_config: TriggerConfig) -> bool:
        pass
    
    @abc.abstractmethod
    async def teardown_trigger(self, trigger_config: TriggerConfig) -> bool:
        pass
    
    @abc.abstractmethod
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        pass
    
    @abc.abstractmethod
    async def health_check(self, trigger_config: TriggerConfig) -> bool:
        pass
    
    def get_config_schema(self) -> Dict[str, Any]:
        if self.provider_definition and self.provider_definition.config_schema:
            return self.provider_definition.config_schema
        return {
            "type": "object",
            "properties": {},
            "required": []
        }
    
    def get_webhook_url(self, trigger_id: str, base_url: str) -> Optional[str]:
        return f"{base_url}/api/triggers/{trigger_id}/webhook"

class GenericWebhookProvider(TriggerProvider):
    def __init__(self, provider_definition: ProviderDefinition):
        super().__init__(TriggerType.WEBHOOK, provider_definition)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        required_fields = self.provider_definition.config_schema.get("required", [])
        for field in required_fields:
            if field not in config:
                raise ValueError(f"Required field '{field}' missing from config")
        return config
    
    async def setup_trigger(self, trigger_config: TriggerConfig) -> bool:
        return True
    
    async def teardown_trigger(self, trigger_config: TriggerConfig) -> bool:
        return True
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        try:
            execution_variables = {}
            if self.provider_definition.field_mappings:
                for output_field, input_path in self.provider_definition.field_mappings.items():
                    value = self._extract_field(event.raw_data, input_path)
                    if value is not None:
                        execution_variables[output_field] = value
            
            agent_prompt = self._create_agent_prompt(event.raw_data, execution_variables)
            
            return TriggerResult(
                success=True,
                should_execute_agent=True,
                agent_prompt=agent_prompt,
                execution_variables=execution_variables
            )
            
        except Exception as e:
            return TriggerResult(
                success=False,
                error_message=f"Error processing webhook event: {str(e)}"
            )
    
    async def health_check(self, trigger_config: TriggerConfig) -> bool:
        return True
    
    def _extract_field(self, data: Dict[str, Any], path: str) -> Any:
        """Extract field from nested dict using dot notation."""
        keys = path.split('.')
        current = data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current
    
    def _create_agent_prompt(self, raw_data: Dict[str, Any], variables: Dict[str, Any]) -> str:
        """Create agent prompt using template or default."""
        if self.provider_definition.response_template:
            template = self.provider_definition.response_template.get("agent_prompt", "")
            for key, value in variables.items():
                template = template.replace(f"{{{key}}}", str(value))
            return template
        
        return f"You received a webhook event from {self.provider_definition.name}: {raw_data}"

class ProviderFactory:
    @staticmethod
    async def create_provider(provider_definition: ProviderDefinition) -> TriggerProvider:
        if provider_definition.provider_class:
            try:
                module_path, class_name = provider_definition.provider_class.rsplit('.', 1)
                module = importlib.import_module(module_path)
                provider_class = getattr(module, class_name)
                return provider_class(provider_definition)
            except (ImportError, AttributeError) as e:
                raise ValueError(f"Failed to load provider class {provider_definition.provider_class}: {e}")
        
        if provider_definition.webhook_enabled:
            return GenericWebhookProvider(provider_definition)
        
        raise ValueError(f"Provider {provider_definition.provider_id} has no implementation")

class TriggerManager:
    def __init__(self, db_connection):
        self.db = db_connection
        self.providers: Dict[str, TriggerProvider] = {}
        self.provider_definitions: Dict[str, ProviderDefinition] = {}
        self.active_triggers: Dict[str, TriggerConfig] = {}
    
    async def load_provider_definitions(self):
        from utils.logger import logger
        logger.info("Loading provider definitions...")
        await self._load_builtin_providers()
        await self._load_custom_providers()
        logger.info(f"Loaded {len(self.provider_definitions)} provider definitions: {list(self.provider_definitions.keys())}")
    
    async def _load_builtin_providers(self):
        builtin_providers = [
            ProviderDefinition(
                provider_id="telegram",
                name="Telegram Bot",
                description="Telegram bot integration for receiving messages",
                trigger_type="telegram",
                provider_class="triggers.providers.telegram_provider.TelegramTriggerProvider",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "bot_token": {"type": "string", "description": "Telegram bot token"},
                        "secret_token": {"type": "string", "description": "Webhook secret token"}
                    },
                    "required": ["bot_token"]
                }
            ),
            ProviderDefinition(
                provider_id="slack",
                name="Slack App",
                description="Slack app integration for receiving events",
                trigger_type="slack",
                provider_class="triggers.providers.slack_provider.SlackTriggerProvider",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "signing_secret": {"type": "string", "description": "Slack signing secret"},
                        "bot_token": {"type": "string", "description": "Slack bot token"}
                    },
                    "required": ["signing_secret"]
                }
            ),
            ProviderDefinition(
                provider_id="discord",
                name="Discord Bot",
                description="Discord bot integration",
                trigger_type="discord",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "webhook_url": {"type": "string", "description": "Discord webhook URL"},
                        "bot_token": {"type": "string", "description": "Discord bot token"}
                    },
                    "required": ["webhook_url"]
                },
                field_mappings={
                    "discord_content": "content",
                    "discord_author": "author.username",
                    "discord_channel": "channel_id"
                },
                response_template={
                    "agent_prompt": "You received a Discord message from {discord_author}: '{discord_content}'"
                }
            ),
            ProviderDefinition(
                provider_id="github_webhook",
                name="GitHub Webhook",
                description="GitHub repository webhook events",
                trigger_type="webhook",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "secret": {"type": "string", "description": "GitHub webhook secret"},
                        "events": {"type": "array", "items": {"type": "string"}, "description": "Events to listen for"}
                    }
                },
                field_mappings={
                    "github_event": "headers.x-github-event",
                    "github_repo": "repository.full_name",
                    "github_action": "action",
                    "github_sender": "sender.login"
                },
                response_template={
                    "agent_prompt": "GitHub {github_event} event in {github_repo} by {github_sender}"
                }
            ),
            ProviderDefinition(
                provider_id="schedule",
                name="Schedule",
                description="Schedule agent or workflow execution using Cloudflare Workers and cron expressions",
                trigger_type="schedule",
                provider_class="triggers.providers.schedule_provider.ScheduleTriggerProvider",
                webhook_enabled=True,
                config_schema={
                    "type": "object",
                    "properties": {
                        "cron_expression": {
                            "type": "string", 
                            "description": "Cron expression for scheduling",
                            "pattern": r"^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$"
                        },
                        "execution_type": {
                            "type": "string",
                            "enum": ["agent", "workflow"],
                            "description": "Type of execution: agent or workflow",
                            "default": "agent"
                        },
                        "agent_prompt": {
                            "type": "string", 
                            "description": "The prompt to run the agent with when triggered (required for agent execution)"
                        },
                        "workflow_id": {
                            "type": "string",
                            "description": "The workflow ID to execute (required for workflow execution)"
                        },
                        "workflow_input": {
                            "type": "object",
                            "description": "Input data to pass to the workflow",
                            "default": {}
                        },
                        "timezone": {
                            "type": "string",
                            "description": "Timezone for schedule execution (default: UTC)",
                            "default": "UTC"
                        }
                    },
                    "required": ["cron_expression", "execution_type"],
                    "anyOf": [
                        {
                            "properties": {"execution_type": {"const": "agent"}},
                            "required": ["agent_prompt"]
                        },
                        {
                            "properties": {"execution_type": {"const": "workflow"}},
                            "required": ["workflow_id"]
                        }
                    ]
                }
            )
        ]
        
        for definition in builtin_providers:
            self.provider_definitions[definition.provider_id] = definition
    
    async def _load_custom_providers(self):
        try:
            client = await self.db.client
            result = await client.table('custom_trigger_providers').select('*').eq('is_active', True).execute()
            
            for row in result.data:
                definition = ProviderDefinition(
                    provider_id=row['provider_id'],
                    name=row['name'],
                    description=row['description'],
                    trigger_type=row['trigger_type'],
                    provider_class=row.get('provider_class'),
                    config_schema=row.get('config_schema', {}),
                    webhook_enabled=row.get('webhook_enabled', False),
                    webhook_config=row.get('webhook_config'),
                    response_template=row.get('response_template'),
                    field_mappings=row.get('field_mappings')
                )
                self.provider_definitions[definition.provider_id] = definition
                
        except Exception as e:
            pass
    
    async def get_or_create_provider(self, provider_id: str) -> Optional[TriggerProvider]:
        from utils.logger import logger
        logger.info(f"Looking for provider: {provider_id}")
        logger.info(f"Available providers: {list(self.providers.keys())}")
        logger.info(f"Available provider definitions: {list(self.provider_definitions.keys())}")
        
        if provider_id in self.providers:
            logger.info(f"Found existing provider: {provider_id}")
            return self.providers[provider_id]
        
        definition = self.provider_definitions.get(provider_id)
        if not definition:
            logger.error(f"No provider definition found for: {provider_id}")
            return None
        
        try:
            logger.info(f"Creating provider for: {provider_id}")
            provider = await ProviderFactory.create_provider(definition)
            self.providers[provider_id] = provider
            logger.info(f"Successfully created provider: {provider_id}")
            return provider
        except Exception as e:
            logger.error(f"Failed to create provider {provider_id}: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    def register_provider(self, provider: TriggerProvider):
        provider_id = provider.provider_definition.provider_id if provider.provider_definition else (provider.trigger_type.value if hasattr(provider.trigger_type, 'value') else str(provider.trigger_type))
        self.providers[provider_id] = provider
    
    def get_provider(self, trigger_type: TriggerType) -> Optional[TriggerProvider]:
        for provider in self.providers.values():
            if provider.trigger_type == trigger_type:
                return provider
        return None
    
    async def create_trigger(
        self,
        agent_id: str,
        provider_id: str,
        name: str,
        config: Dict[str, Any],
        description: Optional[str] = None
    ) -> TriggerConfig:
        """Create a new trigger for an agent using a specific provider."""
        provider = await self.get_or_create_provider(provider_id)
        if not provider:
            raise ValueError(f"Unsupported provider: {provider_id}")
        
        validated_config = await provider.validate_config(config)
        
        trigger_config = TriggerConfig(
            trigger_id=str(uuid.uuid4()),
            agent_id=agent_id,
            trigger_type=provider.trigger_type,
            name=name,
            description=description,
            config={**validated_config, "provider_id": provider_id}
        )
        
        setup_success = await provider.setup_trigger(trigger_config)
        if not setup_success:
            raise ValueError(f"Failed to setup trigger: {name}")
        
        await self._store_trigger(trigger_config)
        
        self.active_triggers[trigger_config.trigger_id] = trigger_config
        
        return trigger_config
    
    async def get_available_providers(self) -> List[ProviderDefinition]:
        """Get list of available trigger providers."""
        return list(self.provider_definitions.values())
    
    async def update_trigger(
        self,
        trigger_id: str,
        config: Optional[Dict[str, Any]] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> TriggerConfig:
        trigger_config = await self.get_trigger(trigger_id)
        if not trigger_config:
            raise ValueError(f"Trigger not found: {trigger_id}")
        
        # Handle both enum and string trigger_type
        trigger_type_str = trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type)
        provider_id = trigger_config.config.get("provider_id", trigger_type_str)
        provider = await self.get_or_create_provider(provider_id)
        if not provider:
            raise ValueError(f"Provider not found: {provider_id}")
        
        if config is not None:
            validated_config = await provider.validate_config(config)
            trigger_config.config = {**validated_config, "provider_id": provider_id}
        if name is not None:
            trigger_config.name = name
        if description is not None:
            trigger_config.description = description
        if is_active is not None:
            trigger_config.is_active = is_active
        
        trigger_config.updated_at = datetime.now(timezone.utc)

        await provider.teardown_trigger(trigger_config)
        if trigger_config.is_active:
            setup_success = await provider.setup_trigger(trigger_config)
            if not setup_success:
                raise ValueError(f"Failed to update trigger setup: {trigger_id}")
        
        await self._update_trigger(trigger_config)
        self.active_triggers[trigger_id] = trigger_config
        
        return trigger_config
    
    async def delete_trigger(self, trigger_id: str) -> bool:
        """Delete a trigger."""
        trigger_config = await self.get_trigger(trigger_id)
        if not trigger_config:
            return False
        
        # Handle both enum and string trigger_type
        trigger_type_str = trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type)
        provider_id = trigger_config.config.get("provider_id", trigger_type_str)
        provider = await self.get_or_create_provider(provider_id)
        if provider:
            await provider.teardown_trigger(trigger_config)

        await self._delete_trigger(trigger_id)
        self.active_triggers.pop(trigger_id, None)
        
        return True
    
    async def get_trigger(self, trigger_id: str) -> Optional[TriggerConfig]:
        if trigger_id in self.active_triggers:
            return self.active_triggers[trigger_id]
        
        trigger_data = await self._load_trigger(trigger_id)
        if trigger_data:
            if isinstance(trigger_data.get('trigger_type'), str):
                trigger_data['trigger_type'] = TriggerType(trigger_data['trigger_type'])
            trigger_config = TriggerConfig(**trigger_data)
            self.active_triggers[trigger_id] = trigger_config
            return trigger_config
        
        return None
    
    async def get_agent_triggers(self, agent_id: str) -> List[TriggerConfig]:
        triggers_data = await self._load_agent_triggers(agent_id)
        triggers = []
        for data in triggers_data:
            if isinstance(data.get('trigger_type'), str):
                data['trigger_type'] = TriggerType(data['trigger_type'])
            trigger_config = TriggerConfig(**data)
            self.active_triggers[trigger_config.trigger_id] = trigger_config
            triggers.append(trigger_config)
        return triggers
    
    async def process_trigger_event(self, trigger_id: str, raw_data: Dict[str, Any]) -> TriggerResult:
        from utils.logger import logger
        logger.info(f"Processing trigger event for {trigger_id}")
        await self.load_provider_definitions()
        
        trigger_config = await self.get_trigger(trigger_id)
        if not trigger_config:
            logger.error(f"Trigger not found: {trigger_id}")
            return TriggerResult(
                success=False,
                error_message=f"Trigger not found: {trigger_id}"
            )
        
        if not trigger_config.is_active:
            logger.warning(f"Trigger is inactive: {trigger_id}")
            return TriggerResult(
                success=False,
                error_message=f"Trigger is inactive: {trigger_id}"
            )

        trigger_type_str = trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type)
        provider_id = trigger_config.config.get("provider_id", trigger_type_str)
        logger.info(f"Getting provider for {provider_id}")
        provider = await self.get_or_create_provider(provider_id)
        if not provider:
            logger.error(f"Provider not found: {provider_id}")
            return TriggerResult(
                success=False,
                error_message=f"Provider not found: {provider_id}"
            )
        
        event = TriggerEvent(
            trigger_id=trigger_id,
            agent_id=trigger_config.agent_id,
            trigger_type=trigger_config.trigger_type,
            raw_data=raw_data
        )

        try:
            logger.info(f"Calling provider.process_event for {provider_id}")
            result = await provider.process_event(event)
            logger.info(f"Provider returned: success={result.success}, should_execute={result.should_execute_agent}")
            
            await self._log_trigger_event(event, result)
            
            return result
        except Exception as e:
            logger.error(f"Error in provider.process_event: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            error_result = TriggerResult(
                success=False,
                error_message=f"Error processing trigger event: {str(e)}"
            )
            await self._log_trigger_event(event, error_result)
            return error_result
    
    async def health_check_triggers(self, agent_id: Optional[str] = None) -> Dict[str, bool]:
        """Run health checks on triggers."""
        if agent_id:
            triggers = await self.get_agent_triggers(agent_id)
        else:
            triggers = list(self.active_triggers.values())
        
        results = {}
        for trigger in triggers:
            # Handle both enum and string trigger_type
            trigger_type_str = trigger.trigger_type.value if hasattr(trigger.trigger_type, 'value') else str(trigger.trigger_type)
            provider_id = trigger.config.get("provider_id", trigger_type_str)
            provider = await self.get_or_create_provider(provider_id)
            if provider:
                try:
                    results[trigger.trigger_id] = await provider.health_check(trigger)
                except Exception:
                    results[trigger.trigger_id] = False
            else:
                results[trigger.trigger_id] = False
        
        return results
    
    async def _store_trigger(self, trigger_config: TriggerConfig):
        client = await self.db.client
        await client.table('agent_triggers').insert({
            'trigger_id': trigger_config.trigger_id,
            'agent_id': trigger_config.agent_id,
            'trigger_type': trigger_config.trigger_type.value if hasattr(trigger_config.trigger_type, 'value') else str(trigger_config.trigger_type),
            'name': trigger_config.name,
            'description': trigger_config.description,
            'is_active': trigger_config.is_active,
            'config': trigger_config.config,
            'created_at': trigger_config.created_at.isoformat(),
            'updated_at': trigger_config.updated_at.isoformat()
        }).execute()
    
    async def _update_trigger(self, trigger_config: TriggerConfig):
        client = await self.db.client
        await client.table('agent_triggers').update({
            'name': trigger_config.name,
            'description': trigger_config.description,
            'is_active': trigger_config.is_active,
            'config': trigger_config.config,
            'updated_at': trigger_config.updated_at.isoformat()
        }).eq('trigger_id', trigger_config.trigger_id).execute()
    
    async def _delete_trigger(self, trigger_id: str):
        client = await self.db.client
        await client.table('agent_triggers').delete().eq('trigger_id', trigger_id).execute()
    
    async def _load_trigger(self, trigger_id: str) -> Optional[Dict[str, Any]]:
        client = await self.db.client
        result = await client.table('agent_triggers').select('*').eq('trigger_id', trigger_id).execute()
        return result.data[0] if result.data else None
    
    async def _load_agent_triggers(self, agent_id: str) -> List[Dict[str, Any]]:
        client = await self.db.client
        result = await client.table('agent_triggers').select('*').eq('agent_id', agent_id).execute()
        return result.data
    
    async def _log_trigger_event(self, event: TriggerEvent, result: TriggerResult):
        client = await self.db.client
        await client.table('trigger_events').insert({
            'event_id': event.event_id,
            'trigger_id': event.trigger_id,
            'agent_id': event.agent_id,
            'trigger_type': event.trigger_type.value if hasattr(event.trigger_type, 'value') else str(event.trigger_type),
            'timestamp': event.timestamp.isoformat(),
            'success': result.success,
            'should_execute_agent': result.should_execute_agent,
            'error_message': result.error_message,
            'metadata': {
                'event_metadata': event.metadata,
                'result_metadata': result.metadata
            }
        }).execute() 