from typing import Dict, Any, Optional
from ...domain.entities import TriggerProvider, TriggerEvent, TriggerResult, Trigger
from ...domain.value_objects import ProviderDefinition, ExecutionVariables


class GenericWebhookProvider(TriggerProvider):
    def __init__(self, provider_definition: ProviderDefinition):
        super().__init__(provider_definition)
    
    async def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        required_fields = self.provider_definition.config_schema.get("required", [])
        for field in required_fields:
            if field not in config:
                raise ValueError(f"Required field '{field}' missing from config")
        return config
    
    async def setup_trigger(self, trigger: Trigger) -> bool:
        return True
    
    async def teardown_trigger(self, trigger: Trigger) -> bool:
        return True
    
    async def process_event(self, event: TriggerEvent) -> TriggerResult:
        try:
            execution_variables = ExecutionVariables()
            
            if self.provider_definition.field_mappings:
                for output_field, input_path in self.provider_definition.field_mappings.items():
                    value = self._extract_field(event.raw_data, input_path)
                    if value is not None:
                        execution_variables = execution_variables.add(output_field, value)
            
            agent_prompt = self._create_agent_prompt(event.raw_data, execution_variables.variables)
            
            # Force agent execution only - never workflows for webhook triggers
            result = TriggerResult(
                success=True,
                should_execute_agent=True,
                should_execute_workflow=False,
                agent_prompt=agent_prompt,
                execution_variables=execution_variables
            )
            
            # Double-check the values are set correctly
            assert result.should_execute_agent == True
            assert result.should_execute_workflow == False
            
            return result
            
        except Exception as e:
            return TriggerResult(
                success=False,
                error_message=f"Error processing webhook event: {str(e)}"
            )
    
    async def health_check(self, trigger: Trigger) -> bool:
        return True
    
    def _extract_field(self, data: Dict[str, Any], path: str) -> Any:
        keys = path.split('.')
        current = data
        
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        
        return current
    
    def _create_agent_prompt(self, raw_data: Dict[str, Any], execution_variables: Dict[str, Any]) -> str:
        if self.provider_definition.response_template:
            template = self.provider_definition.response_template.get('agent_prompt', '')
            
            try:
                return template.format(**execution_variables, **raw_data)
            except KeyError:
                pass
        
        return f"Process webhook data: {raw_data}" 