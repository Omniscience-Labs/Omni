from typing import Optional

from services.supabase import DBConnection
from utils.logger import logger
from credentials import EncryptionService

from ..repositories.smithery_repository import SmitheryRepository
from ..services.connection_service import ConnectionService
from ..services.tool_service import ToolService
from ..services.registry_service import RegistryService
from ..support.providers import MCPProviderFactory
from ..support.custom_discovery import CustomMCPDiscovery
from ..facade import MCPManager


class MCPDependencies:
    def __init__(self, db: Optional[DBConnection] = None):
        self._db = db
        self._logger = logger
        
        self._encryption_service = None

        self._smithery_repo = None
        

        self._connection_service = None
        self._tool_service = None
        self._registry_service = None
  
        self._provider_factory = None
        self._custom_discovery = None
        
        self._mcp_manager = None
    
    @property
    def encryption_service(self) -> EncryptionService:
        if self._encryption_service is None:
            self._encryption_service = EncryptionService(self._logger)
        return self._encryption_service
    
    @property
    def smithery_repository(self) -> SmitheryRepository:
        if self._smithery_repo is None:
            self._smithery_repo = SmitheryRepository(self._logger)
        return self._smithery_repo
    
    @property
    def provider_factory(self) -> MCPProviderFactory:
        if self._provider_factory is None:
            self._provider_factory = MCPProviderFactory(self._logger)
        return self._provider_factory
    
    @property
    def custom_discovery(self) -> CustomMCPDiscovery:
        if self._custom_discovery is None:
            self._custom_discovery = CustomMCPDiscovery(self._logger)
        return self._custom_discovery
    
    @property
    def connection_service(self) -> ConnectionService:
        if self._connection_service is None:
            self._connection_service = ConnectionService(self.provider_factory, self._logger)
        return self._connection_service
    
    @property
    def tool_service(self) -> ToolService:
        if self._tool_service is None:
            self._tool_service = ToolService(self.connection_service, self._logger)
        return self._tool_service
    
    @property
    def registry_service(self) -> RegistryService:
        if self._registry_service is None:
            self._registry_service = RegistryService(self.smithery_repository, self._logger)
        return self._registry_service
    
    @property
    def mcp_manager(self) -> MCPManager:
        if self._mcp_manager is None:
            self._mcp_manager = MCPManager(
                registry_service=self.registry_service,
                connection_service=self.connection_service,
                tool_service=self.tool_service,
                custom_discovery=self.custom_discovery,
                logger=self._logger
            )
        return self._mcp_manager


_mcp_dependencies: Optional[MCPDependencies] = None


def get_mcp_dependencies(db: Optional[DBConnection] = None) -> MCPDependencies:
    global _mcp_dependencies
    if _mcp_dependencies is None:
        _mcp_dependencies = MCPDependencies(db)
    return _mcp_dependencies


def initialize_mcp_dependencies(db: DBConnection) -> MCPDependencies:
    global _mcp_dependencies
    _mcp_dependencies = MCPDependencies(db)
    return _mcp_dependencies 