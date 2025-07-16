from utils.logger import logger
from services.supabase import DBConnection

from .facade import CredentialManager
from .domain.entities import (
    MCPCredential,
    MCPCredentialProfile,
    MCPRequirement,
    CredentialMapping,
    CredentialRequest,
    ProfileRequest
)

db = DBConnection()

try:
    from pipedream.facade import PipedreamManager
    pipedream_manager = PipedreamManager()
except ImportError:
    pipedream_manager = None

credential_manager = CredentialManager(
    db=db, 
    profile_manager=pipedream_manager,
    logger=logger
)

from . import api
api.credential_manager = credential_manager

__all__ = [
    'CredentialManager',
    'MCPCredential',
    'MCPCredentialProfile', 
    'MCPRequirement',
    'CredentialMapping',
    'CredentialRequest',
    'ProfileRequest',
    'credential_manager',
    'api'
] 