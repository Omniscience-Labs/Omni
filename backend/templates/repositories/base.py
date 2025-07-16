from abc import ABC, abstractmethod
from typing import Generic, TypeVar, Optional


T = TypeVar('T')


class Repository(ABC, Generic[T]):
    @abstractmethod
    async def find_by_id(self, id: str) -> Optional[T]:
        pass
    
    @abstractmethod
    async def save(self, entity: T) -> T:
        pass
    
    @abstractmethod
    async def delete(self, id: str) -> bool:
        pass 