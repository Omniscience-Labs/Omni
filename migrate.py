import json
import time
import os
from mem0 import MemoryClient
from supermemory import Supermemory
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
MEM0_KEY = #Your_API_key-Mem0ai
SUPERMEMORY_KEY = #Your_API_key-Supermemory
PROGRESS_FILE = "migration_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r") as f:
                return set(json.load(f))
        except: return set()
    return set()

def save_progress(migrated_ids):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(list(migrated_ids), f)

def run_streaming_migration():
    mem0 = MemoryClient(api_key=MEM0_KEY)
    v3_dest = Supermemory(api_key=SUPERMEMORY_KEY)
    
    migrated_ids = load_progress()
    page = 1
    success_count = 0
    skip_count = 0

    print(f"🚀 Starting STREAMING Migration. Already done: {len(migrated_ids)}")

    try:
        while True:
            # Fetch only 1 page at a time
            print(f"📥 Fetching page {page}...")
            response = mem0.get_all(filters={"user_id": "*"}, page=page)
            results = response.get('results', [])
            
            if not results:
                print("🏁 Finished! No more memories in Mem0.")
                break
            
            # Migrate this page immediately
            for item in results:
                mem_id = item.get("id")
                
                if mem_id in migrated_ids:
                    skip_count += 1
                    continue

                content = item.get('memory') or item.get('content')
                user_id = item.get('user_id', 'legacy_user')
                
                if content:
                    try:
                        v3_dest.add(
                            content=content,
                            container_tags=[f"user_{user_id}", "migrated_from_v2"],
                            metadata={"original_id": mem_id}
                        )
                        migrated_ids.add(mem_id)
                        success_count += 1
                        
                        if success_count % 5 == 0:
                            print(f"✅ Page {page} | Migrated: {success_count} | Skipped: {skip_count}")
                        
                        time.sleep(0.2) # Safer rate limit
                        
                    except Exception as e:
                        if "429" in str(e):
                            print("🛑 Rate limit! Sleeping 30s...")
                            time.sleep(30)
                        else:
                            print(f"⚠️ Item Error: {e}")

            # Save progress after every page to be safe
            save_progress(migrated_ids)
            page += 1

    except Exception as e:
        print(f"❌ Critical Error: {e}")
        save_progress(migrated_ids)

if __name__ == "__main__":
    run_streaming_migration()