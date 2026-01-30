"""
Enterprise Billing Module

This module implements enterprise mode billing with:
- Shared corporate credit pool
- Per-user monthly spending limits
- Admin credit management
"""

from .service import enterprise_billing_service
from .auth import is_enterprise_admin, is_omni_admin, get_admin_emails, get_omni_admin_emails

__all__ = [
    'enterprise_billing_service',
    'is_enterprise_admin',
    'is_omni_admin',
    'get_admin_emails',
    'get_omni_admin_emails',
]
