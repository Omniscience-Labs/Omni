"""
Diagnostic script to test model ID resolution for LiteLLM.
This verifies that custom model IDs are correctly mapped to provider-specific IDs.
"""

from core.ai_models import model_manager
from core.utils.logger import logger

def test_model_resolution():
    """Test that model IDs are resolved correctly"""
    
    test_cases = [
        ("anthropic/claude-4.1-haiku", "claude-4.1-haiku"),
        ("anthropic/claude-sonnet-4-20250514", "claude-sonnet-4-20250514"),
        ("claude-4.1-haiku", "claude-4.1-haiku"),  # Test alias resolution
        ("claude-sonnet-4", "claude-sonnet-4-20250514"),  # Test alias resolution
    ]
    
    print("\n" + "="*80)
    print("MODEL ID RESOLUTION TEST")
    print("="*80 + "\n")
    
    all_passed = True
    
    for input_id, expected_output in test_cases:
        resolved = model_manager.resolve_model_id(input_id)
        status = "✅ PASS" if resolved == expected_output else "❌ FAIL"
        
        print(f"{status}")
        print(f"  Input:    {input_id}")
        print(f"  Expected: {expected_output}")
        print(f"  Got:      {resolved}")
        print()
        
        if resolved != expected_output:
            all_passed = False
    
    print("="*80)
    if all_passed:
        print("✅ ALL TESTS PASSED - Model resolution is working correctly!")
    else:
        print("❌ SOME TESTS FAILED - Check the mappings in registry.py")
    print("="*80 + "\n")
    
    return all_passed

if __name__ == "__main__":
    test_model_resolution()

