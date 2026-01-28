import asyncio
import os
import sys

# Ensure backend modules can be imported
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from dotenv import load_dotenv
load_dotenv('backend/.env')

from core.services.memory_service import MemoryService

def test_memory_service_sync():
    print("Testing MemoryService with Supermemory V3 Integration...")
    
    # Use a specific test user ID
    user_id = "test_user_service_v3"
    
    try:
        # Initialize MemoryService
        ms = MemoryService()
        print("✅ MemoryService initialized.")
        
        print(f"\n1. Saving chat turn for user: {user_id}")
        # Note: save_chat_turn is NOT async in the code I viewed earlier?
        # Let me re-check the file content.
        # file:///c:/PHANI%20PERSONAL/OMNI/Omni/backend/core/services/memory_service.py
        # It calls self.client.add() which is from `supermemory`.
        # I need to check if supermemory.add is async.
        # usually SDKs are sync unless specified.
        # But ThreadManager calls it with asyncio.create_task? 
        # Wait, if it's sync, create_task will fail or block loop?
        # If it's sync, create_task(sync_func()) is WRONG.
        # ThreadManager code: asyncio.create_task(self.context_manager.memory_service.save_chat_turn(...))
        # If save_chat_turn is synchronous, this will throw an error!
        # "Task function must be a coroutine".
        
        # Let's assume I need to verify if save_chat_turn needs to be async.
        # The view_file output showed: 
        # def save_chat_turn(self, user_id: str, message: str, role: str):
        # ... return self.client.add(...)
        
        # If self.client.add is sync, I MUST define save_chat_turn as async and wrap it, or run it in executor.
        # OR ThreadManager code assumes it returns a coroutine.
        # I MUST CHECK THIS.
        
        # For this test script, I will treat it as it is defined.
        result = ms.save_chat_turn(user_id=user_id, message="I love simplified tests.", role="user")
        print(f"✅ Saved chat turn. Result: {result}")
        
    except Exception as e:
        print(f"\n❌ TEST FAILED with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_memory_service_sync()
