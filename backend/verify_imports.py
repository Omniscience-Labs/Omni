import sys
import os

# Add backend directory to sys.path
sys.path.append('/Users/varnikachabria/work/omni/Omni/backend')

try:
    print("Attempting imports...")
    from core.tools.inbound_order_tool import InboundOrderTool
    from core.tools.setup_inbound_order_credentials_tool import SetupInboundOrderCredentialsTool
    print("✅ Successfully imported new tools")
except ImportError as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    sys.exit(1)
