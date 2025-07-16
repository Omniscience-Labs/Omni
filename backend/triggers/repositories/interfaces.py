"""
Repository Interfaces for the Triggers Domain

These interfaces define the contracts for data access operations.
They follow the Repository pattern to abstract data persistence concerns
from the domain logic.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..domain.entities import Trigger, TriggerEvent, TriggerResult
from ..domain.value_objects import TriggerIdentity


class TriggerRepository(ABC):
    """
    Abstract repository for trigger data persistence
    
    This interface defines the contract for storing and retrieving
    trigger configuration data.
    """
    
    @abstractmethod
    async def save(self, trigger: Trigger) -> None:
        """
        Save a trigger to the repository
        
        Args:
            trigger: The trigger to save
            
        Raises:
            RepositoryError: If the save operation fails
        """
        pass
    
    @abstractmethod
    async def find_by_id(self, trigger_id: str) -> Optional[Trigger]:
        """
        Find a trigger by its ID
        
        Args:
            trigger_id: The trigger ID to search for
            
        Returns:
            The trigger if found, None otherwise
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def find_by_agent_id(self, agent_id: str) -> List[Trigger]:
        """
        Find all triggers for a specific agent
        
        Args:
            agent_id: The agent ID to search for
            
        Returns:
            List of triggers for the agent
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def find_active_triggers(self) -> List[Trigger]:
        """
        Find all active triggers
        
        Returns:
            List of active triggers
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def find_by_provider_id(self, provider_id: str) -> List[Trigger]:
        """
        Find all triggers using a specific provider
        
        Args:
            provider_id: The provider ID to search for
            
        Returns:
            List of triggers using the provider
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def update(self, trigger: Trigger) -> None:
        """
        Update an existing trigger
        
        Args:
            trigger: The trigger to update
            
        Raises:
            RepositoryError: If the update operation fails
            NotFoundError: If the trigger doesn't exist
        """
        pass
    
    @abstractmethod
    async def delete(self, trigger_id: str) -> bool:
        """
        Delete a trigger by ID
        
        Args:
            trigger_id: The trigger ID to delete
            
        Returns:
            True if the trigger was deleted, False if not found
            
        Raises:
            RepositoryError: If the delete operation fails
        """
        pass
    
    @abstractmethod
    async def exists(self, trigger_id: str) -> bool:
        """
        Check if a trigger exists
        
        Args:
            trigger_id: The trigger ID to check
            
        Returns:
            True if the trigger exists, False otherwise
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def count_by_agent_id(self, agent_id: str) -> int:
        """
        Count triggers for a specific agent
        
        Args:
            agent_id: The agent ID to count for
            
        Returns:
            Number of triggers for the agent
            
        Raises:
            RepositoryError: If the query fails
        """
        pass


class TriggerEventLogRepository(ABC):
    """
    Abstract repository for trigger event logging
    
    This interface defines the contract for storing and retrieving
    trigger event execution logs.
    """
    
    @abstractmethod
    async def log_event(
        self,
        event: TriggerEvent,
        result: TriggerResult,
        execution_time_ms: Optional[int] = None
    ) -> str:
        """
        Log a trigger event execution
        
        Args:
            event: The trigger event that was processed
            result: The result of processing the event
            execution_time_ms: Time taken to process the event in milliseconds
            
        Returns:
            The log entry ID
            
        Raises:
            RepositoryError: If the logging operation fails
        """
        pass
    
    @abstractmethod
    async def find_logs_by_trigger_id(
        self,
        trigger_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Find event logs for a specific trigger
        
        Args:
            trigger_id: The trigger ID to search for
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            
        Returns:
            List of log entries
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def find_logs_by_agent_id(
        self,
        agent_id: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Find event logs for a specific agent
        
        Args:
            agent_id: The agent ID to search for
            limit: Maximum number of logs to return
            offset: Number of logs to skip
            
        Returns:
            List of log entries
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def find_failed_events(
        self,
        since: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Find failed trigger events
        
        Args:
            since: Only return events after this timestamp
            limit: Maximum number of events to return
            
        Returns:
            List of failed event logs
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def get_execution_stats(
        self,
        trigger_id: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get execution statistics for a trigger
        
        Args:
            trigger_id: The trigger ID to get stats for
            hours: Number of hours to look back
            
        Returns:
            Dictionary with execution statistics
            
        Raises:
            RepositoryError: If the query fails
        """
        pass
    
    @abstractmethod
    async def cleanup_old_logs(self, days_to_keep: int = 30) -> int:
        """
        Clean up old log entries
        
        Args:
            days_to_keep: Number of days of logs to keep
            
        Returns:
            Number of log entries deleted
            
        Raises:
            RepositoryError: If the cleanup operation fails
        """
        pass


# Repository Exceptions
class RepositoryError(Exception):
    """Base exception for repository operations"""
    pass


class NotFoundError(RepositoryError):
    """Exception raised when a requested entity is not found"""
    pass


class DuplicateError(RepositoryError):
    """Exception raised when trying to create a duplicate entity"""
    pass


class ValidationError(RepositoryError):
    """Exception raised when repository data validation fails"""
    pass 