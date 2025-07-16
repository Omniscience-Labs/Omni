from ..domain.exceptions import EncryptionException


class EncryptionService:
    def encrypt(self, data: str) -> str:
        try:
            from utils.encryption import encrypt_data
            return encrypt_data(data)
        except Exception as e:
            raise EncryptionException("encrypt", str(e))
    
    def decrypt(self, encrypted_data: str) -> str:
        try:
            from utils.encryption import decrypt_data
            return decrypt_data(encrypted_data)
        except Exception as e:
            raise EncryptionException("decrypt", str(e)) 