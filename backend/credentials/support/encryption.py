import os
import json
import hashlib
from typing import Dict, Any, Tuple

from cryptography.fernet import Fernet

from ..protocols import Logger


class EncryptionService:
    def __init__(self, logger: Logger):
        self._logger = logger
        self._encryption_key = self._get_or_create_encryption_key()
        self._cipher = Fernet(self._encryption_key)
    
    def _get_or_create_encryption_key(self) -> bytes:
        key_env = os.getenv("MCP_CREDENTIAL_ENCRYPTION_KEY")
        
        try:
            if isinstance(key_env, str):
                return key_env.encode('utf-8')
            else:
                return key_env
                
        except Exception as e:
            self._logger.error(f"Invalid encryption key: {e}")
            self._logger.warning("Generating new encryption key for this session")
            key = Fernet.generate_key()
            self._logger.info(f"Generated new encryption key. Set this in your environment:")
            self._logger.info(f"MCP_CREDENTIAL_ENCRYPTION_KEY={key.decode()}")
            return key
    
    def encrypt_config(self, config: Dict[str, Any]) -> Tuple[bytes, str]:
        config_json = json.dumps(config, sort_keys=True)
        config_bytes = config_json.encode('utf-8')
        
        config_hash = hashlib.sha256(config_bytes).hexdigest()
        encrypted_config = self._cipher.encrypt(config_bytes)
        
        return encrypted_config, config_hash
    
    def decrypt_config(self, encrypted_config: bytes, expected_hash: str) -> Dict[str, Any]:
        try:
            decrypted_bytes = self._cipher.decrypt(encrypted_config)
            
            actual_hash = hashlib.sha256(decrypted_bytes).hexdigest()
            if actual_hash != expected_hash:
                raise ValueError("Credential integrity check failed")
            
            config_json = decrypted_bytes.decode('utf-8')
            return json.loads(config_json)
            
        except Exception as e:
            self._logger.error(f"Failed to decrypt credential: {e}")
            raise ValueError("Failed to decrypt credential") 