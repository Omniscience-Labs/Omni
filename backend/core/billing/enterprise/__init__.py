"""
Enterprise Billing Module

This module implements enterprise mode billing with:
- Shared corporate credit pool
- Per-user monthly spending limits
- Admin credit management
"""

from .service import enterprise_billing_service
from .auth import is_enterprise_admin, is_omni_admin, get_admin_emails, get_omni_admin_emails
from .api import router as enterprise_admin_router

__all__ = [
    'enterprise_billing_service',
    'enterprise_admin_router',
    'is_enterprise_admin',
    'is_omni_admin',
    'get_admin_emails',
    'get_omni_admin_emails',
]
