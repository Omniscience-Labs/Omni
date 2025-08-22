from models import model_manager

_legacy_data = model_manager.get_legacy_constants()

MODELS = _legacy_data["MODELS"]
MODEL_NAME_ALIASES = _legacy_data["MODEL_NAME_ALIASES"]
HARDCODED_MODEL_PRICES = _legacy_data["HARDCODED_MODEL_PRICES"]
MODEL_CONTEXT_WINDOWS = _legacy_data["MODEL_CONTEXT_WINDOWS"]
FREE_TIER_MODELS = _legacy_data["FREE_TIER_MODELS"]
PAID_TIER_MODELS = _legacy_data["PAID_TIER_MODELS"]

MODEL_ACCESS_TIERS = {
    "free": FREE_TIER_MODELS,
    "tier_2_20": PAID_TIER_MODELS,
    "tier_6_50": PAID_TIER_MODELS,
    "tier_12_100": PAID_TIER_MODELS,
    "tier_25_200": PAID_TIER_MODELS,
    "tier_50_400": PAID_TIER_MODELS,
    "tier_125_800": PAID_TIER_MODELS,
    "tier_200_1000": PAID_TIER_MODELS,
    "tier_25_170_yearly_commitment": PAID_TIER_MODELS,
    "tier_6_42_yearly_commitment": PAID_TIER_MODELS,
    "tier_12_84_yearly_commitment": PAID_TIER_MODELS,
}

def get_model_context_window(model_name: str, default: int = 31_000) -> int:
    return model_manager.get_context_window(model_name, default)
