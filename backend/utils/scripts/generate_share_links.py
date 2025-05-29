import asyncio
import sys
import os
from typing import List, Dict, Any
from datetime import datetime
import random
from dotenv import load_dotenv

load_dotenv(".env")

from services.supabase import DBConnection
from utils.logger import logger

db_connection = None


async def get_random_thread_ids(n: int) -> List[str]:
    global db_connection
    if db_connection is None:
        db_connection = DBConnection()
    
    client = await db_connection.client
    
    print(f"Using Supabase URL: {os.getenv('SUPABASE_URL')}")
    
    all_thread_ids = []
    page_size = 1000
    current_page = 0
    has_more = True
    
    print("Fetching all thread IDs from database (paginated)...")
    
    while has_more:
        start_range = current_page * page_size
        end_range = start_range + page_size - 1
        
        print(f"Fetching page {current_page + 1} (rows {start_range}-{end_range})...")
        
        try:
            result = await client.table('threads').select('thread_id').range(start_range, end_range).execute()
            
            if not result.data:
                has_more = False
            else:
                page_thread_ids = [thread['thread_id'] for thread in result.data]
                all_thread_ids.extend(page_thread_ids)
                
                print(f"Loaded {len(page_thread_ids)} thread IDs (total so far: {len(all_thread_ids)})")
                if len(result.data) < page_size:
                    has_more = False
                else:
                    current_page += 1
                    
        except Exception as e:
            logger.error(f"Error during pagination: {str(e)}")
            has_more = False
    
    print(f"Found {len(all_thread_ids)} total thread IDs in database")
    
    if not all_thread_ids:
        logger.info("No threads found in database")
        return []
    
    if len(all_thread_ids) <= n:
        logger.warning(f"Requested {n} threads but only {len(all_thread_ids)} available. Returning all.")
        selected_thread_ids = all_thread_ids
    else:
        selected_thread_ids = random.sample(all_thread_ids, n)
    
    logger.info(f"Retrieved {len(selected_thread_ids)} random thread IDs")
    return selected_thread_ids


async def generate_share_links(n: int) -> List[str]:
    try:
        thread_ids = await get_random_thread_ids(n)
        
        if not thread_ids:
            logger.warning("No thread IDs found, returning empty list")
            return []
        
        share_links = [f"suna.so/share/{thread_id}" for thread_id in thread_ids]
        
        logger.info(f"Generated {len(share_links)} share links")
        return share_links
        
    except Exception as e:
        logger.error(f"Error generating share links: {str(e)}")
        raise


def save_links_to_file(share_links: List[str], filename: str = None) -> str:
    """Save share links to a text file and return the filename."""
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"share_links_{timestamp}.txt"
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(f"Share Links Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 60 + "\n\n")
            
            for i, link in enumerate(share_links, 1):
                f.write(f"{i}. {link}\n")
            
            f.write(f"\nTotal: {len(share_links)} share links generated\n")
        
        logger.info(f"Share links saved to {filename}")
        return filename
        
    except Exception as e:
        logger.error(f"Error saving links to file: {str(e)}")
        raise


async def main():
    logger.info("Starting share link generation process")
    
    try:
        global db_connection
        db_connection = DBConnection()
        
        try:
            n = int(input("Enter the number of share links to generate: "))
            if n <= 0:
                print("Number must be positive")
                return
        except ValueError:
            print("Please enter a valid number")
            return
        
        custom_filename = input("Enter filename (press Enter for auto-generated): ").strip()
        if not custom_filename:
            custom_filename = None
        elif not custom_filename.endswith('.txt'):
            custom_filename += '.txt'
        
        print(f"\nGenerating {n} random share links...")
        
        share_links = await generate_share_links(n)
        
        if not share_links:
            print("No share links were generated")
            return
        
        print(f"\nGenerated {len(share_links)} share links:")
        print("-" * 50)
        for i, link in enumerate(share_links, 1):
            print(f"{i}. {link}")
        
        saved_filename = save_links_to_file(share_links, custom_filename)
        
        print(f"\nTotal: {len(share_links)} share links generated")
        print(f"Links saved to: {saved_filename}")
        logger.info("Share link generation completed")
            
    except Exception as e:
        logger.error(f"Error during share link generation: {str(e)}")
        sys.exit(1)
    finally:
        if db_connection:
            await DBConnection.disconnect()


if __name__ == "__main__":
    asyncio.run(main())