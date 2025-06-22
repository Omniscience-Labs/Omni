import asyncio
import argparse
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(".env")

from services.supabase import DBConnection
from daytona_sdk import Sandbox
from sandbox.sandbox import daytona, create_sandbox, delete_sandbox
from utils.logger import logger

db_connection = None
db = None


async def get_db():
    global db_connection, db
    if db_connection is None or db is None:
        db_connection = DBConnection()
        db = await db_connection.client
    return db


async def get_project(project_id: str):
    db = await get_db()
    project = (
        await db.schema("public")
        .from_("projects")
        .select("*")
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )
    return project.data


async def get_threads(project_id: str):
    db = await get_db()
    threads = (
        await db.schema("public")
        .from_("threads")
        .select("*")
        .eq("project_id", project_id)
        .execute()
    )
    return threads.data


async def get_agent_runs(thread_id: str):
    db = await get_db()
    agent_runs = (
        await db.schema("public")
        .from_("agent_runs")
        .select("*")
        .eq("thread_id", thread_id)
        .execute()
    )
    return agent_runs.data


async def get_messages(thread_id: str):
    db = await get_db()
    messages_data = []
    offset = 0
    batch_size = 1000

    while True:
        batch = (
            await db.schema("public")
            .from_("messages")
            .select("*")
            .eq("thread_id", thread_id)
            .range(offset, offset + batch_size - 1)
            .execute()
        )

        if not batch.data:
            break

        messages_data.extend(batch.data)

        if len(batch.data) < batch_size:
            break

        offset += batch_size

    return messages_data


async def get_user(user_id: str):
    db = await get_db()
    user = await db.auth.admin.get_user_by_id(user_id)
    return user.user.model_dump()


async def export_project_to_file(project_id: str, output_file: str):
    """Export all project data to a JSON file."""
    try:
        logger.info(f"Starting export of project {project_id}")
        
        # Get project data
        project = await get_project(project_id)
        if not project:
            raise Exception(f"Project {project_id} not found")
        
        logger.info(f"Exporting project: {project['name']}")
        
        # Get threads
        threads = await get_threads(project_id)
        logger.info(f"Found {len(threads)} threads")
        
        # Get agent runs and messages for each thread
        threads_data = []
        for thread in threads:
            thread_data = dict(thread)
            
            # Get agent runs for this thread
            agent_runs = await get_agent_runs(thread["thread_id"])
            thread_data["agent_runs"] = agent_runs
            
            # Get messages for this thread
            messages = await get_messages(thread["thread_id"])
            thread_data["messages"] = messages
            
            threads_data.append(thread_data)
            logger.info(f"Thread {thread['thread_id']}: {len(agent_runs)} runs, {len(messages)} messages")
        
        # Prepare export data
        export_data = {
            "export_metadata": {
                "export_date": datetime.now().isoformat(),
                "project_id": project_id,
                "project_name": project["name"]
            },
            "project": project,
            "threads": threads_data
        }
        
        # Write to file
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False, default=str)
        
        logger.info(f"Project exported successfully to {output_file}")
        logger.info(f"Export summary: 1 project, {len(threads_data)} threads")
        
        return export_data
        
    except Exception as e:
        logger.error(f"Error exporting project: {e}")
        raise e
    finally:
        await DBConnection.disconnect()


async def import_project_from_file(input_file: str, to_user_id: str = None, create_new_sandbox: bool = True):
    """Import project data from a JSON file and create a new project."""
    new_sandbox = None
    new_project = None
    new_threads = []
    new_agent_runs = []
    new_messages = []
    
    try:
        logger.info(f"Starting import from {input_file}")
        
        # Read data from file
        with open(input_file, 'r', encoding='utf-8') as f:
            import_data = json.load(f)
        
        project_data = import_data["project"]
        threads_data = import_data["threads"]
        
        logger.info(f"Importing project: {project_data['name']}")
        logger.info(f"Found {len(threads_data)} threads to import")
        
        # Determine target user
        to_user_id = to_user_id or project_data["account_id"]
        to_user = await get_user(to_user_id)
        
        logger.info(f"Target user: {to_user['id']} ({to_user['email']})")
        
        # Create new sandbox if requested
        if create_new_sandbox:
            logger.info("Creating new sandbox...")
            new_sandbox = create_sandbox(project_data["sandbox"]["pass"], project_data["project_id"])
            
            if new_sandbox:
                vnc_link = new_sandbox.get_preview_link(6080)
                website_link = new_sandbox.get_preview_link(8080)
                vnc_url = (
                    vnc_link.url
                    if hasattr(vnc_link, "url")
                    else str(vnc_link).split("url='")[1].split("'")[0]
                )
                website_url = (
                    website_link.url
                    if hasattr(website_link, "url")
                    else str(website_link).split("url='")[1].split("'")[0]
                )
                token = None
                if hasattr(vnc_link, "token"):
                    token = vnc_link.token
                elif "token='" in str(vnc_link):
                    token = str(vnc_link).split("token='")[1].split("'")[0]
                
                sandbox_data = {
                    "id": new_sandbox.id,
                    "pass": project_data["sandbox"]["pass"],
                    "token": token,
                    "vnc_preview": vnc_url,
                    "sandbox_url": website_url,
                }
                logger.info(f"New sandbox created: {new_sandbox.id}")
            else:
                raise Exception("Failed to create new sandbox")
        else:
            # Use existing sandbox data
            sandbox_data = project_data["sandbox"]
            logger.info("Using existing sandbox data")
        
        # Create new project
        db = await get_db()
        result = (
            await db.schema("public")
            .from_("projects")
            .insert(
                {
                    "name": project_data["name"],
                    "description": project_data["description"],
                    "account_id": to_user["id"],
                    "is_public": project_data["is_public"],
                    "sandbox": sandbox_data,
                }
            )
            .execute()
        )
        new_project = result.data[0]
        logger.info(f"New project created: {new_project['project_id']} ({new_project['name']})")
        
        # Import threads
        for thread_data in threads_data:
            # Create new thread
            new_thread = (
                await db.schema("public")
                .from_("threads")
                .insert(
                    {
                        "account_id": to_user["id"],
                        "project_id": new_project["project_id"],
                        "is_public": thread_data["is_public"],
                        "agent_id": thread_data["agent_id"],
                        "metadata": thread_data["metadata"] or {},
                    }
                )
                .execute()
            )
            new_thread = new_thread.data[0]
            new_threads.append(new_thread)
            
            # Create agent runs for this thread
            for agent_run_data in thread_data.get("agent_runs", []):
                new_agent_run = (
                    await db.schema("public")
                    .from_("agent_runs")
                    .insert(
                        {
                            "thread_id": new_thread["thread_id"],
                            "status": agent_run_data["status"],
                            "started_at": agent_run_data["started_at"],
                            "completed_at": agent_run_data["completed_at"],
                            "responses": agent_run_data["responses"],
                            "error": agent_run_data["error"],
                        }
                    )
                    .execute()
                )
                new_agent_runs.append(new_agent_run.data[0])
            
            # Create messages for this thread in batches
            messages = thread_data.get("messages", [])
            batch_size = 100
            for i in range(0, len(messages), batch_size):
                batch_messages = messages[i:i + batch_size]
                message_inserts = []
                
                for message_data in batch_messages:
                    message_inserts.append({
                        "thread_id": new_thread["thread_id"],
                        "type": message_data["type"],
                        "is_llm_message": message_data["is_llm_message"],
                        "content": message_data["content"],
                        "metadata": message_data["metadata"],
                        "created_at": message_data["created_at"],
                        "updated_at": message_data["updated_at"],
                    })
                
                if message_inserts:
                    batch_result = (
                        await db.schema("public")
                        .from_("messages")
                        .insert(message_inserts)
                        .execute()
                    )
                    new_messages.extend(batch_result.data)
                    
                    # Add delay between batches
                    if i + batch_size < len(messages):
                        await asyncio.sleep(0.5)
            
            logger.info(f"Thread imported: {len(thread_data.get('agent_runs', []))} runs, {len(messages)} messages")
        
        logger.info(f"Import completed successfully!")
        logger.info(f"Summary: 1 project, {len(new_threads)} threads, {len(new_agent_runs)} agent runs, {len(new_messages)} messages")
        
        return {
            "project": new_project,
            "threads": new_threads,
            "agent_runs": new_agent_runs,
            "messages": new_messages
        }
        
    except Exception as e:
        logger.error(f"Error importing project: {e}")
        
        # Clean up any resources that were created before the error
        db = await get_db()
        
        if new_sandbox:
            try:
                logger.info(f"Cleaning up sandbox: {new_sandbox.id}")
                await delete_sandbox(new_sandbox.id)
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up sandbox {new_sandbox.id}: {cleanup_error}")

        if new_messages:
            for message in new_messages:
                try:
                    await db.table("messages").delete().eq("message_id", message["message_id"]).execute()
                except Exception as cleanup_error:
                    logger.error(f"Error cleaning up message {message['message_id']}: {cleanup_error}")

        if new_agent_runs:
            for agent_run in new_agent_runs:
                try:
                    await db.table("agent_runs").delete().eq("id", agent_run["id"]).execute()
                except Exception as cleanup_error:
                    logger.error(f"Error cleaning up agent run {agent_run['id']}: {cleanup_error}")

        if new_threads:
            for thread in new_threads:
                try:
                    await db.table("threads").delete().eq("thread_id", thread["thread_id"]).execute()
                except Exception as cleanup_error:
                    logger.error(f"Error cleaning up thread {thread['thread_id']}: {cleanup_error}")

        if new_project:
            try:
                await db.table("projects").delete().eq("project_id", new_project["project_id"]).execute()
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up project {new_project['project_id']}: {cleanup_error}")

        await DBConnection.disconnect()
        raise e
    
    finally:
        await DBConnection.disconnect()


async def main():
    """Main function to run the script."""
    parser = argparse.ArgumentParser(description="Export/Import project data")
    parser.add_argument("action", choices=["export", "import"], help="Action to perform")
    parser.add_argument("--project-id", type=str, help="Project ID to export (required for export)")
    parser.add_argument("--file", type=str, help="File path for export/import", required=True)
    parser.add_argument("--user-id", type=str, help="User ID to import project to (optional for import)")
    parser.add_argument("--no-sandbox", action="store_true", help="Don't create new sandbox during import")
    
    args = parser.parse_args()
    
    try:
        if args.action == "export":
            if not args.project_id:
                raise Exception("--project-id is required for export")
            await export_project_to_file(args.project_id, args.file)
            
        elif args.action == "import":
            create_new_sandbox = not args.no_sandbox
            await import_project_from_file(args.file, args.user_id, create_new_sandbox)
            
    except Exception as e:
        logger.error(f"Script failed: {e}")
        raise e


if __name__ == "__main__":
    asyncio.run(main()) 