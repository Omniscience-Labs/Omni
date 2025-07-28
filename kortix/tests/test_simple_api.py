import os
import asyncio
import pytest
from kortix.config import global_config
from kortix.client import KortixClient


@pytest.mark.asyncio
async def test_api_endpoints(mock_api):
    """Test the basic API endpoints to verify they're working correctly"""
    
    # The mock_api fixture automatically configures the client
    # No need to set URL or API key manually
    
    print("Testing Kortix SDK API endpoints...")
    
    async with KortixClient() as client:
        try:
            # Test 1: Create a thread
            print("1. Testing thread creation...")
            thread = await client.create_thread("Testing API endpoints")
            print(f"   ✓ Thread created: {thread.id}")
            
            # Test 2: Add a message to the thread
            print("2. Testing message addition...")
            message = await client.add_message_to_thread(
                thread.id, 
                "user", 
                "Hello, this is a test message"
            )
            print(f"   ✓ Message added: {message.id}")
            
            # Test 3: Get thread messages
            print("3. Testing message retrieval...")
            messages = await client.get_thread_messages(thread.id)
            print(f"   ✓ Retrieved {len(messages)} messages")
            
            # Test 4: Start an agent run (using default agent)
            print("4. Testing agent run start...")
            agent_run = await client.start_agent_run(thread.id, instructions="Test instructions", model="gpt-4")
            print(f"   ✓ Agent run started: {agent_run.id}")
            
            # Test 5: Get agent run status
            print("5. Testing agent run status...")
            run_status = await client.get_agent_run(agent_run.id)
            print(f"   ✓ Agent run status: {run_status.status}")
            
            print("\n🎉 All API endpoints are working correctly!")
            
        except Exception as e:
            print(f"❌ Error testing API: {str(e)}")
            raise


if __name__ == "__main__":
    asyncio.run(test_api_endpoints()) 