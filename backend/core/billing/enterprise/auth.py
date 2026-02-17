"""
Enterprise Admin Authentication

This module provides email-based admin checks for enterprise mode.
These checks work alongside (not replacing) the existing database-based
user_roles system.

Environment Variables:
- ADMIN_EMAILS: Comma-separated list of admin emails (can view users, edit limits)
- OMNI_ADMIN: Comma-separated list of super admin emails (can load/negate credits)
"""

from typing import List, Optional
from core.utils.config import config
from core.utils.logger import logger


def get_admin_emails() -> List[str]:
    """
    Get list of admin emails from ADMIN_EMAILS environment variable.
    
    Returns:
        List of lowercase email addresses that have admin access.
    """
    emails_str = config.ADMIN_EMAILS
    if not emails_str:
        return []
    
    emails = [e.strip().lower() for e in emails_str.split(',') if e.strip()]
    return emails


def get_omni_admin_emails() -> List[str]:
    """
    Get list of omni admin emails from OMNI_ADMIN environment variable.
    
    Omni admins have elevated privileges:
    - Can load credits to the enterprise pool
    - Can negate credits from the enterprise pool
    - All regular admin privileges
    
    Returns:
        List of lowercase email addresses that have omni admin access.
    """
    emails_str = config.OMNI_ADMIN
    if not emails_str:
        return []
    
    emails = [e.strip().lower() for e in emails_str.split(',') if e.strip()]
    return emails


def is_enterprise_admin(user_email: Optional[str]) -> bool:
    """
    Check if a user email is an enterprise admin.
    
    Enterprise admins can:
    - View all users and their limits
    - Edit user monthly limits
    - View enterprise pool status
    
    Note: Omni admins are also considered regular admins.
    
    Args:
        user_email: The email address to check.
        
    Returns:
        True if the email is in ADMIN_EMAILS or OMNI_ADMIN.
    """
    if not user_email:
        return False
    
    email_lower = user_email.lower()
    admin_emails = get_admin_emails()
    omni_emails = get_omni_admin_emails()
    
    is_admin = email_lower in admin_emails or email_lower in omni_emails
    
    if is_admin:
        logger.debug(f"[ENTERPRISE_AUTH] User {email_lower} is an enterprise admin")
    
    return is_admin


def is_omni_admin(user_email: Optional[str]) -> bool:
    """
    Check if a user email is an omni admin (super admin).
    
    Omni admins have elevated privileges beyond regular admins:
    - Can load credits to the enterprise pool
    - Can negate credits from the enterprise pool
    
    Args:
        user_email: The email address to check.
        
    Returns:
        True if the email is in OMNI_ADMIN.
    """
    if not user_email:
        return False
    
    email_lower = user_email.lower()
    omni_emails = get_omni_admin_emails()
    
    is_omni = email_lower in omni_emails
    
    if is_omni:
        logger.debug(f"[ENTERPRISE_AUTH] User {email_lower} is an omni admin")
    
    return is_omni


def get_admin_status(user_email: Optional[str]) -> dict:
    """
    Get the admin status for a user email.
    
    Args:
        user_email: The email address to check.
        
    Returns:
        Dict with is_admin and is_omni boolean flags.
    """
    return {
        'is_admin': is_enterprise_admin(user_email),
        'is_omni': is_omni_admin(user_email),
        'email': user_email
    }
