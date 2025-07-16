from utils.logger import logger
from services.supabase import DBConnection

from .facade import PipedreamManager
from .domain.entities import (
    Profile,
    Connection,
    App,
    MCPServer,
    MCPTool,
    ConnectionStatus,
    AuthType
)

db = DBConnection()

pipedream_manager = PipedreamManager(
    db=db,
    logger=logger
)

from . import api
api.pipedream_manager = pipedream_manager

__all__ = [
    'PipedreamManager',
    'Profile',
    'Connection', 
    'App',
    'MCPServer',
    'MCPTool',
    'ConnectionStatus',
    'AuthType',
    'pipedream_manager',
    'api'
]
