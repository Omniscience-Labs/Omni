from typing import List, Optional, Dict, Any

from ..domain.entities import AgentTemplate, MCPRequirementValue, QualifiedName, ProfileId, ConfigType
from ..domain.exceptions import TemplateAccessDeniedError
from ..protocols import Logger


class TemplateValidator:
    def __init__(self, logger: Logger):
        self._logger = logger
    
    def validate_ownership(self, template: AgentTemplate, user_id: str) -> None:
        if template.creator_id != user_id:
            self._logger.warning(f"Access denied: User {user_id} doesn't own template {template.template_id}")
            raise TemplateAccessDeniedError("You can only modify your own templates")
    
    def validate_access(self, template: AgentTemplate, user_id: str) -> None:
        if not template.is_public and template.creator_id != user_id:
            self._logger.warning(f"Access denied: User {user_id} can't access private template {template.template_id}")
            raise TemplateAccessDeniedError("Access denied to private template")
    
    def validate_installation_requirements(
        self, 
        requirements: List[MCPRequirementValue],
        profile_mappings: Optional[Dict[QualifiedName, ProfileId]],
        custom_configs: Optional[Dict[QualifiedName, ConfigType]]
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        missing_profiles = []
        missing_configs = []
        
        for req in requirements:
            if req.is_custom():
                if not custom_configs or req.qualified_name not in custom_configs:
                    missing_configs.append({
                        'qualified_name': req.qualified_name,
                        'display_name': req.display_name,
                        'custom_type': req.custom_type,
                        'required_config': req.required_config
                    })
            else:
                if not profile_mappings or req.qualified_name not in profile_mappings:
                    missing_profiles.append({
                        'qualified_name': req.qualified_name,
                        'display_name': req.display_name,
                        'required_config': req.required_config
                    })
        
        return missing_profiles, missing_configs 