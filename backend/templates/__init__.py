from utils.logger import logger
from services.supabase import DBConnection

from .facade import TemplateManager
from .domain.entities import (
    AgentTemplate,
    AgentInstance,
    MCPRequirementValue,
    TemplateInstallationRequest,
    TemplateInstallationResult
)

from agent.versioning.facade import version_manager
from agent.versioning.infrastructure.dependencies import set_db_connection

db = DBConnection()

set_db_connection(db)

template_manager = TemplateManager(
    db=db, 
    version_manager=version_manager, 
    logger=logger
)

from . import api
api.template_manager = template_manager

__all__ = [
    'TemplateManager',
    'AgentTemplate',
    'AgentInstance',
    'MCPRequirementValue',
    'TemplateInstallationRequest',
    'TemplateInstallationResult',
    'template_manager',
    'api'
]
