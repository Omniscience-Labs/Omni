from decimal import Decimal
from typing import Dict, List, Optional
from dataclasses import dataclass

from click.decorators import R
from core.utils.config import config

TRIAL_ENABLED = False
TRIAL_DURATION_DAYS = 7
TRIAL_TIER = "tier_2_20"
TRIAL_CREDITS = Decimal("5.00")

TOKEN_PRICE_MULTIPLIER = Decimal('1.2')
MINIMUM_CREDIT_FOR_RUN = Decimal('0.01')
DEFAULT_TOKEN_COST = Decimal('0.000002')

# Credit capacity check: estimated tokens per LLM iteration (used before auto-continue)
CREDIT_CHECK_ESTIMATED_PROMPT_TOKENS = 12_000
CREDIT_CHECK_ESTIMATED_OUTPUT_TOKENS = 1_000

CREDITS_PER_DOLLAR = 100

FREE_TIER_INITIAL_CREDITS = Decimal('0.00')

# ============================================================================
# Enterprise Mode Tier Configuration
# ============================================================================
# When ENTERPRISE_MODE=true, all users get ULTRA tier capabilities
# This is handled at the application level, not in the database

ENTERPRISE_TIER_NAME = 'enterprise'

# Enterprise tier limits (same as Ultra tier)
ENTERPRISE_TIER_LIMITS = {
    'project_limit': 2500,
    'thread_limit': 2500,
    'concurrent_runs': 20,
    'custom_workers_limit': 100,
    'scheduled_triggers_limit': 50,
    'app_triggers_limit': 100,
    'models': ['all'],
    'can_purchase_credits': False,  # No Stripe purchases in enterprise
    'daily_credits_enabled': False,  # No daily credits in enterprise
}

@dataclass
class Tier:
    name: str
    price_ids: List[str]
    monthly_credits: Decimal
    display_name: str
    can_purchase_credits: bool
    models: List[str]
    project_limit: int
    thread_limit: int
    concurrent_runs: int
    custom_workers_limit: int
    scheduled_triggers_limit: int
    app_triggers_limit: int
    daily_credit_config: Optional[Dict] = None
    monthly_refill_enabled: Optional[bool] = True

TIERS: Dict[str, Tier] = {
    'none': Tier(
        name='none',
        price_ids=[],
        monthly_credits=Decimal('0.00'),
        display_name='No Plan',
        can_purchase_credits=False,
        models=['haiku'],
        project_limit=0,
        thread_limit=0,
        concurrent_runs=0,
        custom_workers_limit=0,
        scheduled_triggers_limit=0,
        app_triggers_limit=0,
    ),
    'free': Tier(
        name='free',
        price_ids=[config.STRIPE_FREE_TIER_ID],
        monthly_credits=Decimal('0.00'),
        display_name='Basic',
        can_purchase_credits=False,
        models=['haiku'],
        project_limit=3,
        thread_limit=3,
        concurrent_runs=1,
        custom_workers_limit=0,
        scheduled_triggers_limit=0,
        app_triggers_limit=0,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=False
    ),
    'tier_2_20': Tier(
        name='tier_2_20',
        price_ids=[
            config.STRIPE_TIER_2_20_ID,
            config.STRIPE_TIER_2_20_YEARLY_ID,
            config.STRIPE_TIER_2_17_YEARLY_COMMITMENT_ID
        ],
        monthly_credits=Decimal('20.00'),
        display_name='Plus',
        can_purchase_credits=False,
        models=['all'],
        project_limit=100,
        thread_limit=100,
        concurrent_runs=3,
        custom_workers_limit=5,
        scheduled_triggers_limit=5,
        app_triggers_limit=10,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    'tier_6_50': Tier(
        name='tier_6_50',
        price_ids=[
            config.STRIPE_TIER_6_50_ID,
            config.STRIPE_TIER_6_50_YEARLY_ID,
            config.STRIPE_TIER_6_42_YEARLY_COMMITMENT_ID
        ],
        monthly_credits=Decimal('50.00'),
        display_name='Pro',
        can_purchase_credits=False,
        models=['all'],
        project_limit=500,
        thread_limit=500,
        concurrent_runs=5,
        custom_workers_limit=20,
        scheduled_triggers_limit=10,
        app_triggers_limit=25,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    'tier_25_200': Tier(
        name='tier_25_200',
        price_ids=[
            config.STRIPE_TIER_25_200_ID,
            config.STRIPE_TIER_25_200_YEARLY_ID,
            config.STRIPE_TIER_25_170_YEARLY_COMMITMENT_ID
        ],
        monthly_credits=Decimal('200.00'),
        display_name='Ultra',
        can_purchase_credits=True,
        models=['all'],
        project_limit=2500,
        thread_limit=2500,
        concurrent_runs=20,
        custom_workers_limit=100,
        scheduled_triggers_limit=50,
        app_triggers_limit=100,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    
    # Legacy tiers - users may still be on these from previous pricing
    'tier_12_100': Tier(
        name='tier_12_100',
        price_ids=[],
        monthly_credits=Decimal('100.00'),
        display_name='Legacy Pro',
        can_purchase_credits=True,
        models=['all'],
        project_limit=1000,
        thread_limit=1000,
        concurrent_runs=10,
        custom_workers_limit=20,
        scheduled_triggers_limit=20,
        app_triggers_limit=50,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    'tier_50_400': Tier(
        name='tier_50_400',
        price_ids=[],
        monthly_credits=Decimal('400.00'),
        display_name='Legacy Business',
        can_purchase_credits=True,
        models=['all'],
        project_limit=5000,
        thread_limit=5000,
        concurrent_runs=30,
        custom_workers_limit=100,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        scheduled_triggers_limit=100,
        app_triggers_limit=200,
        monthly_refill_enabled=True
    ),
    'tier_125_800': Tier(
        name='tier_125_800',
        price_ids=[],
        monthly_credits=Decimal('800.00'),
        display_name='Legacy Enterprise',
        can_purchase_credits=True,
        models=['all'],
        project_limit=10000,
        thread_limit=10000,
        concurrent_runs=50,
        custom_workers_limit=200,
        scheduled_triggers_limit=200,
        app_triggers_limit=500,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    'tier_200_1000': Tier(
        name='tier_200_1000',
        price_ids=[],
        monthly_credits=Decimal('1000.00'),
        display_name='Legacy Enterprise Plus',
        can_purchase_credits=True,
        models=['all'],
        project_limit=25000,
        thread_limit=25000,
        concurrent_runs=100,
        custom_workers_limit=500,
        scheduled_triggers_limit=500,
        app_triggers_limit=1000,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
    'tier_150_1200': Tier(
        name='tier_150_1200',
        price_ids=[],
        monthly_credits=Decimal('1200.00'),
        display_name='Legacy Enterprise Max',
        can_purchase_credits=True,
        models=['all'],
        project_limit=25000,
        thread_limit=25000,
        concurrent_runs=100,
        custom_workers_limit=500,
        scheduled_triggers_limit=500,
        app_triggers_limit=1000,
        daily_credit_config={
            'enabled': True,
            'amount': Decimal('2.00'),
            'refresh_interval_hours': 24
        },
        monthly_refill_enabled=True
    ),
}

CREDIT_PACKAGES = [
    {'amount': Decimal('10.00'), 'stripe_price_id': config.STRIPE_CREDITS_10_PRICE_ID},
    {'amount': Decimal('25.00'), 'stripe_price_id': config.STRIPE_CREDITS_25_PRICE_ID},
    {'amount': Decimal('50.00'), 'stripe_price_id': config.STRIPE_CREDITS_50_PRICE_ID},
    {'amount': Decimal('100.00'), 'stripe_price_id': config.STRIPE_CREDITS_100_PRICE_ID},
    {'amount': Decimal('250.00'), 'stripe_price_id': config.STRIPE_CREDITS_250_PRICE_ID},
    {'amount': Decimal('500.00'), 'stripe_price_id': config.STRIPE_CREDITS_500_PRICE_ID},
]

ADMIN_LIMITS = {
    'max_credit_adjustment': Decimal('1000.00'),
    'max_bulk_grant': Decimal('10000.00'),
    'require_super_admin_above': Decimal('500.00'),
}

def get_tier_by_price_id(price_id: str) -> Optional[Tier]:
    for tier in TIERS.values():
        if price_id in tier.price_ids:
            return tier
    return None

def get_tier_by_name(tier_name: str) -> Optional[Tier]:
    return TIERS.get(tier_name)

def get_monthly_credits(tier_name: str) -> Decimal:
    tier = TIERS.get(tier_name)
    return tier.monthly_credits if tier else TIERS['none'].monthly_credits

def can_purchase_credits(tier_name: str) -> bool:
    tier = TIERS.get(tier_name)
    return tier.can_purchase_credits if tier else False

def is_model_allowed(tier_name: str, model: str) -> bool:
    # Enterprise mode override - all models allowed
    if config.ENTERPRISE_MODE:
        return True
    
    tier = TIERS.get(tier_name, TIERS['none'])
    
    # Tier has access to all models
    if 'all' in tier.models:
        return True
    
    from core.ai_models import model_manager
    resolved_model_id = model_manager.resolve_model_id(model)
    model_obj = model_manager.get_model(resolved_model_id) if resolved_model_id else None
    
    if not model_obj:
        return False
    
    # Check the model's tier_availability from the registry
    # This is the PRIMARY source of truth for model access - if set, it's definitive
    if model_obj.tier_availability:
        if tier_name in ['free', 'none']:
            # Free tier can only access models with "free" in tier_availability
            return 'free' in model_obj.tier_availability
        else:
            # Paid tiers can access models with "paid" in tier_availability
            return 'paid' in model_obj.tier_availability
    
    # Fallback: only use pattern matching if tier_availability is not set (legacy models)
    for allowed_pattern in tier.models:
        if allowed_pattern.lower() in model_obj.name.lower():
            return True
        if allowed_pattern.lower() in model_obj.id.lower():
            return True
        for alias in model_obj.aliases:
            if allowed_pattern.lower() in alias.lower():
                return True
    
    return False

def get_project_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['project_limit']
    tier = TIERS.get(tier_name)
    return tier.project_limit if tier else 3

def is_commitment_price_id(price_id: str) -> bool:
    commitment_price_ids = [
        config.STRIPE_TIER_2_17_YEARLY_COMMITMENT_ID,
        config.STRIPE_TIER_6_42_YEARLY_COMMITMENT_ID,
        config.STRIPE_TIER_25_170_YEARLY_COMMITMENT_ID
    ]
    return price_id in commitment_price_ids

def get_commitment_duration_months(price_id: str) -> int:
    if is_commitment_price_id(price_id):
        return 12
    return 0

def get_price_type(price_id: str) -> str:
    if is_commitment_price_id(price_id):
        return 'yearly_commitment'
    
    yearly_price_ids = [
        config.STRIPE_TIER_2_20_YEARLY_ID,
        config.STRIPE_TIER_6_50_YEARLY_ID,
        config.STRIPE_TIER_25_200_YEARLY_ID
    ]
    
    if price_id in yearly_price_ids:
        return 'yearly'
    
    return 'monthly'

def get_plan_type(price_id: str) -> str:
    price_type = get_price_type(price_id)
    return price_type

def get_thread_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['thread_limit']
    tier = TIERS.get(tier_name)
    return tier.thread_limit if tier else TIERS['free'].thread_limit

def get_concurrent_runs_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['concurrent_runs']
    tier = TIERS.get(tier_name)
    return tier.concurrent_runs if tier else TIERS['free'].concurrent_runs

def get_custom_workers_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['custom_workers_limit']
    tier = TIERS.get(tier_name)
    return tier.custom_workers_limit if tier else TIERS['free'].custom_workers_limit

def get_scheduled_triggers_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['scheduled_triggers_limit']
    tier = TIERS.get(tier_name)
    return tier.scheduled_triggers_limit if tier else TIERS['free'].scheduled_triggers_limit

def get_app_triggers_limit(tier_name: str) -> int:
    # Enterprise mode override
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_LIMITS['app_triggers_limit']
    tier = TIERS.get(tier_name)
    return tier.app_triggers_limit if tier else TIERS['free'].app_triggers_limit

def get_tier_limits(tier_name: str) -> Dict:
    # Enterprise mode override - all users get enterprise limits
    if config.ENTERPRISE_MODE:
        return {
            'project_limit': ENTERPRISE_TIER_LIMITS['project_limit'],
            'thread_limit': ENTERPRISE_TIER_LIMITS['thread_limit'],
            'concurrent_runs': ENTERPRISE_TIER_LIMITS['concurrent_runs'],
            'custom_workers_limit': ENTERPRISE_TIER_LIMITS['custom_workers_limit'],
            'scheduled_triggers_limit': ENTERPRISE_TIER_LIMITS['scheduled_triggers_limit'],
            'app_triggers_limit': ENTERPRISE_TIER_LIMITS['app_triggers_limit'],
            'agent_limit': ENTERPRISE_TIER_LIMITS['custom_workers_limit'],
            'can_purchase_credits': ENTERPRISE_TIER_LIMITS['can_purchase_credits'],
            'models': ENTERPRISE_TIER_LIMITS['models']
        }
    
    tier = TIERS.get(tier_name, TIERS['free'])
    return {
        'project_limit': tier.project_limit,
        'thread_limit': tier.thread_limit,
        'concurrent_runs': tier.concurrent_runs,
        'custom_workers_limit': tier.custom_workers_limit,
        'scheduled_triggers_limit': tier.scheduled_triggers_limit,
        'app_triggers_limit': tier.app_triggers_limit,
        'agent_limit': tier.custom_workers_limit,
        'can_purchase_credits': tier.can_purchase_credits,
        'models': tier.models
    }


# ============================================================================
# Enterprise Mode Helper Functions
# ============================================================================

def is_enterprise_mode() -> bool:
    """Check if the application is running in enterprise mode."""
    return bool(config.ENTERPRISE_MODE)


def get_effective_tier_name(tier_name: str) -> str:
    """
    Get the effective tier name, considering enterprise mode.
    
    In enterprise mode, returns 'enterprise' regardless of the actual tier.
    """
    if config.ENTERPRISE_MODE:
        return ENTERPRISE_TIER_NAME
    return tier_name


def get_enterprise_project_limit() -> int:
    """Get the project limit for enterprise users."""
    return ENTERPRISE_TIER_LIMITS['project_limit']


def get_enterprise_thread_limit() -> int:
    """Get the thread limit for enterprise users."""
    return ENTERPRISE_TIER_LIMITS['thread_limit']


def get_enterprise_concurrent_runs_limit() -> int:
    """Get the concurrent runs limit for enterprise users."""
    return ENTERPRISE_TIER_LIMITS['concurrent_runs']


def should_use_daily_credits(tier_name: str) -> bool:
    """
    Check if daily credits should be used for a tier.
    
    Returns False in enterprise mode (daily credits are disabled).
    """
    if config.ENTERPRISE_MODE:
        return False
    
    tier = TIERS.get(tier_name)
    if not tier or not tier.daily_credit_config:
        return False
    
    return tier.daily_credit_config.get('enabled', False)
