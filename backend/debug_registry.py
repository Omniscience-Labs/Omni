import sys
import os

# Ensure clean import/reload
import core.ai_models.registry
import importlib
# importlib.reload(core.ai_models.registry) # Don't reload, we want to see CURRENT state

reg_mod = sys.modules['core.ai_models.registry']
from core.utils.config import config, EnvMode

print(f"--- DEBUG REPORT V3 ---")
print(f"Module Object: {reg_mod}")
print(f"File: {getattr(reg_mod, '__file__', 'unknown')}")
print(f"is_local: {getattr(reg_mod, 'is_local', 'NOT FOUND')}")
print(f"has_anthropic: {getattr(reg_mod, 'has_anthropic', 'NOT FOUND')}")
print(f"SHOULD_USE_ANTHROPIC: {getattr(reg_mod, 'SHOULD_USE_ANTHROPIC', 'NOT FOUND')}")
print(f"_BASIC_MODEL_ID: {getattr(reg_mod, '_BASIC_MODEL_ID', 'NOT FOUND')}")

# Check the instance within the module
instance = getattr(reg_mod, 'registry', None)
if instance:
    print(f"Registry Instance found in module: {instance}")
    print(f"Resolved 'kortix/basic': {instance.get_litellm_model_id('kortix/basic')}")
    print(f"Resolved 'anthropic/claude-3-5-haiku-20241022': {instance.get_litellm_model_id('anthropic/claude-3-5-haiku-20241022')}")
else:
    print("Registry Instance NOT FOUND in module")

print(f"--- END REPORT ---")
