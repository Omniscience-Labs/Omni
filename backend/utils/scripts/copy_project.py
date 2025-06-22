import asyncio
import argparse
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


async def copy_thread(thread_id: str, account_id: str, project_id: str):
    db = await get_db()
    thread = (
        await db.schema("public")
        .from_("threads")
        .select("*")
        .eq("thread_id", thread_id)
        .maybe_single()
        .execute()
    )

    if not thread.data:
        raise Exception(f"Thread {thread_id} not found")

    thread_data = thread.data
    new_thread = (
        await db.schema("public")
        .from_("threads")
        .insert(
            {
                "account_id": account_id,
                "project_id": project_id,
                "is_public": thread_data["is_public"],
                "agent_id": thread_data["agent_id"],
                "metadata": thread_data["metadata"] or {},
            }
        )
        .execute()
    )
    return new_thread.data[0]


async def copy_project(project_id: str, to_user_id: str, sandbox_data: dict):
    db = await get_db()
    project = await get_project(project_id)
    to_user = await get_user(to_user_id)

    if not project:
        raise Exception(f"Project {project_id} not found")
    if not to_user:
        raise Exception(f"User {to_user_id} not found")

    result = (
        await db.schema("public")
        .from_("projects")
        .insert(
            {
                "name": project["name"],
                "description": project["description"],
                "account_id": to_user["id"],
                "is_public": project["is_public"],
                "sandbox": sandbox_data,
            }
        )
        .execute()
    )
    return result.data[0]


async def copy_agent_runs(thread_id: str, new_thread_id: str):
    db = await get_db()
    agent_runs = (
        await db.schema("public")
        .from_("agent_runs")
        .select("*")
        .eq("thread_id", thread_id)
        .execute()
    )

    async def copy_single_agent_run(agent_run, new_thread_id, db):
        new_agent_run = (
            await db.schema("public")
            .from_("agent_runs")
            .insert(
                {
                    "thread_id": new_thread_id,
                    "status": agent_run["status"],
                    "started_at": agent_run["started_at"],
                    "completed_at": agent_run["completed_at"],
                    "responses": agent_run["responses"],
                    "error": agent_run["error"],
                }
            )
            .execute()
        )
        return new_agent_run.data[0]

    tasks = [
        copy_single_agent_run(agent_run, new_thread_id, db)
        for agent_run in agent_runs.data
    ]
    new_agent_runs = await asyncio.gather(*tasks)
    return new_agent_runs


async def copy_messages(thread_id: str, new_thread_id: str):
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

    async def copy_single_message(message, new_thread_id, db):
        new_message = (
            await db.schema("public")
            .from_("messages")
            .insert(
                {
                    "thread_id": new_thread_id,
                    "type": message["type"],
                    "is_llm_message": message["is_llm_message"],
                    "content": message["content"],
                    "metadata": message["metadata"],
                    "created_at": message["created_at"],
                    "updated_at": message["updated_at"],
                }
            )
            .execute()
        )
        return new_message.data[0]

    tasks = []
    for message in messages_data:
        tasks.append(copy_single_message(message, new_thread_id, db))

    # Process tasks in batches to avoid overwhelming the database
    batch_size = 100
    new_messages = []
    for i in range(0, len(tasks), batch_size):
        batch_tasks = tasks[i : i + batch_size]
        batch_results = await asyncio.gather(*batch_tasks)
        new_messages.extend(batch_results)
        # Add delay between batches
        if i + batch_size < len(tasks):
            await asyncio.sleep(1)

    return new_messages


async def get_user(user_id: str):
    db = await get_db()
    user = await db.auth.admin.get_user_by_id(user_id)
    return user.user.model_dump()


async def copy_sandbox(sandbox_id: str, password: str, project_id: str) -> Sandbox:
    sandbox = daytona.find_one(sandbox_id=sandbox_id)
    if not sandbox:
        raise Exception(f"Sandbox {sandbox_id} not found")

    # TODO: Currently there's no way to create a copy of a sandbox, so we will create a new one
    new_sandbox = create_sandbox(password, project_id)
    return new_sandbox


async def main():
    """Main function to run the script."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Create copy of a project")
    parser.add_argument(
        "--project-id", type=str, help="Project ID to copy", required=True
    )
    parser.add_argument(
        "--new-user-id",
        type=str,
        default=None,
        help="[OPTIONAL] User ID to copy the project to",
        required=False,
    )
    args = parser.parse_args()

    # Initialize variables for cleanup
    new_sandbox = None
    new_project = None
    new_threads = []
    new_agent_runs = []
    new_messages = []

    try:
        project = await get_project(args.project_id)
        if not project:
            raise Exception(f"Project {args.project_id} not found")

        to_user_id = args.new_user_id or project["account_id"]
        to_user = await get_user(to_user_id)

        logger.info(
            f"Project: {project['project_id']} ({project['name']}) -> User: {to_user['id']} ({to_user['email']})"
        )

        new_sandbox = await copy_sandbox(
            project["sandbox"]["id"], project["sandbox"]["pass"], args.project_id
        )
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
        else:
            raise Exception("Failed to create new sandbox")

        sandbox_data = {
            "id": new_sandbox.id,
            "pass": project["sandbox"]["pass"],
            "token": token,
            "vnc_preview": vnc_url,
            "sandbox_url": website_url,
        }
        logger.info(f"New sandbox: {new_sandbox.id}")

        new_project = await copy_project(
            project["project_id"], to_user["id"], sandbox_data
        )
        logger.info(f"New project: {new_project['project_id']} ({new_project['name']})")

        threads = await get_threads(project["project_id"])
        if threads:
            for thread in threads:
                new_thread = await copy_thread(
                    thread["thread_id"], to_user["id"], new_project["project_id"]
                )
                new_threads.append(new_thread)
            logger.info(f"New threads: {len(new_threads)}")

            for i in range(len(new_threads)):
                runs = await copy_agent_runs(
                    threads[i]["thread_id"], new_threads[i]["thread_id"]
                )
                new_agent_runs.extend(runs)
            logger.info(f"New agent runs: {len(new_agent_runs)}")

            for i in range(len(new_threads)):
                messages = await copy_messages(
                    threads[i]["thread_id"], new_threads[i]["thread_id"]
                )
                new_messages.extend(messages)
            logger.info(f"New messages: {len(new_messages)}")
        else:
            logger.info("No threads found for this project")

    except Exception as e:
        db = await get_db()
        # Clean up any resources that were created before the error
        if new_sandbox:
            try:
                logger.info(f"Cleaning up sandbox: {new_sandbox.id}")
                await delete_sandbox(new_sandbox.id)
            except Exception as cleanup_error:
                logger.error(
                    f"Error cleaning up sandbox {new_sandbox.id}: {cleanup_error}"
                )

        if new_messages:
            for message in new_messages:
                try:
                    logger.info(f"Cleaning up message: {message['message_id']}")
                    await db.table("messages").delete().eq(
                        "message_id", message["message_id"]
                    ).execute()
                except Exception as cleanup_error:
                    logger.error(
                        f"Error cleaning up message {message['message_id']}: {cleanup_error}"
                    )

        if new_agent_runs:
            for agent_run in new_agent_runs:
                try:
                    logger.info(f"Cleaning up agent run: {agent_run['id']}")
                    await db.table("agent_runs").delete().eq(
                        "id", agent_run["id"]
                    ).execute()
                except Exception as cleanup_error:
                    logger.error(
                        f"Error cleaning up agent run {agent_run['id']}: {cleanup_error}"
                    )

        if new_threads:
            for thread in new_threads:
                try:
                    logger.info(f"Cleaning up thread: {thread['thread_id']}")
                    await db.table("threads").delete().eq(
                        "thread_id", thread["thread_id"]
                    ).execute()
                except Exception as cleanup_error:
                    logger.error(
                        f"Error cleaning up thread {thread['thread_id']}: {cleanup_error}"
                    )

        if new_project:
            try:
                logger.info(f"Cleaning up project: {new_project['project_id']}")
                await db.table("projects").delete().eq(
                    "project_id", new_project["project_id"]
                ).execute()
            except Exception as cleanup_error:
                logger.error(
                    f"Error cleaning up project {new_project['project_id']}: {cleanup_error}"
                )

        await DBConnection.disconnect()
        raise e

    finally:
        await DBConnection.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
