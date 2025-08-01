from typing import Optional
from composio import Composio
from composio.types import auth_scheme
import os
import threading
from utils.logger import logger
from utils.config import config

class ComposioServiceError(Exception):
    pass

class ComposioService:
    _instance: Optional['ComposioService'] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
                    cls._instance._client = None
        return cls._instance

    def __init__(self):
        pass

    def initialize(self) -> None:
        if self._initialized:
            return
                
        try:
            composio_api_key = self._get_api_key()
            
            if not composio_api_key:
                logger.error("Missing COMPOSIO_API_KEY environment variable")
                raise ComposioServiceError("COMPOSIO_API_KEY environment variable must be set")

            logger.debug("Initializing Composio client")
            
            self._client = Composio(api_key=composio_api_key)
            
            self._initialized = True
            logger.debug("Composio client initialized successfully")
            
        except Exception as e:
            logger.error(f"Composio service initialization error: {e}")
            raise ComposioServiceError(f"Failed to initialize Composio service: {str(e)}")

    def _get_api_key(self) -> Optional[str]:
        api_key = os.getenv("COMPOSIO_API_KEY")
        
        if not api_key and hasattr(config, 'COMPOSIO_API_KEY'):
            api_key = config.COMPOSIO_API_KEY
            
        return api_key

    @property
    def client(self) -> Composio:
        if not self._initialized:
            logger.debug("Composio client not initialized, initializing now")
            self.initialize()
        
        if not self._client:
            logger.error("Composio client is None after initialization")
            raise ComposioServiceError("Composio client not initialized")
            
        return self._client

    @classmethod
    def get_instance(cls) -> 'ComposioService':
        return cls()

    @classmethod
    def reset(cls):
        with cls._lock:
            if cls._instance:
                cls._instance._initialized = False
                cls._instance._client = None
            cls._instance = None

    def is_initialized(self) -> bool:
        return self._initialized
    
def get_composio_service() -> ComposioService:
    return ComposioService.get_instance()


def get_composio_client() -> Composio:
    return get_composio_service().client

composio_service = get_composio_service()
composio = get_composio_client()