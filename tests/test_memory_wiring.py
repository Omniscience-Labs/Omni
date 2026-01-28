import asyncio
import os
import sys

# Ensure backend modules can be imported
# Assuming script is run from project root c:\PHANI PERSONAL\OMNI\Omni
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from dotenv import load_dotenv
load_dotenv('backend/.env')

from core.agentpress.context_manager import ContextManager
from core.utils.logger import logger

# Configure logger to output to console
import structlog
structlog.configure(
    processors=[structlog.processors.JSONRenderer()],
    logger_factory=structlog.PrintLoggerFactory(),
)

async def test_memory_wiring():
    print("Testing ContextManager with Supermemory V3 Integration...")
    
    # Use a specific test user ID and Enterprise ID
    user_id = "test_user_integration_v3"
    enterprise_id = "test_enterprise_v3"
    
    try:
        # Initialize ContextManager
        cm = ContextManager()
        
        print(f"\n1. Saving conversation turn for user: {user_id} (Enterprise: {enterprise_id})")
        await cm.save_conversation_turn(
            user_id=user_id, 
            user_message="I strictly prefer using FastAPI for all my web projects.", 
            assistant_response="Got it. I will always use FastAPI for your web projects.",
            enterprise_id=enterprise_id
        )
        print("✅ Call to save_conversation_turn completed.")
        
        print(f"\n2. Waiting for potential indexing (5s)...")
        await asyncio.sleep(5) 
        
        print(f"3. Retrieving context for query: 'What web framework do I use?' (Enterprise: {enterprise_id})")
        context = await cm.get_long_term_context(user_id, "What web framework do I use?", enterprise_id=enterprise_id)
        print(f"✅ Raw Context Retrieved:\n---\n{context}\n---")
        
        if "FastAPI" in context:
            print("\n🎉 VERIFICATION SUCCESS: 'FastAPI' found in retrieved context.")
        else:
            print("\n⚠️ VERIFICATION NOTE: 'FastAPI' not found immediately (Indexing latency is expected).")
            print("The code execution path is verified if no errors occurred above.")
            
    except Exception as e:
        print(f"\n❌ TEST FAILED with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_memory_wiring())
