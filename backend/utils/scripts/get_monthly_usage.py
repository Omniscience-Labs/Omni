"""
Monthly Usage Script

This script calculates the monthly usage (in agent run minutes) for a specific user during a specific month.

Usage:
    python backend/utils/scripts/get_monthly_usage.py --user-id <USER_ID> --year <YEAR> --month <MONTH> [--verbose]

Arguments:
    --user-id    The user ID to get usage for (required)
    --year       The year (e.g., 2024) (required)
    --month      The month (1-12) (required)
    --verbose    Enable verbose logging (optional)

Examples:
    # Get usage for December 2024
    python backend/utils/scripts/get_monthly_usage.py --user-id "user123" --year 2024 --month 12

    # Get usage with verbose logging
    python backend/utils/scripts/get_monthly_usage.py --user-id "user123" --year 2024 --month 11 --verbose

Output:
    The script will output:
    - User information (email and ID)
    - Month and year
    - Total usage in minutes and hours
    - Average usage per day (if any usage exists)

    Example output:
    === Monthly Usage Report ===
    User: user@example.com (user123)
    Month: December 2024
    Total Usage: 150.45 minutes
    Total Usage: 2.51 hours
    Average per day: 5.02 minutes

Features:
    - Validates agent runs to exclude invalid durations (>2 hours)
    - Handles incomplete agent runs appropriately
    - Provides detailed logging for debugging
    - Calculates usage only for the specified month
    - Shows average daily usage

Notes:
    - The script requires access to the Supabase database
    - Make sure the .env file is properly configured
    - The script uses the same logic as the billing system for consistency
"""

import asyncio
import argparse
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv(".env")

from services.supabase import DBConnection
from utils.logger import logger

db_connection = None
db = None


async def get_db():
    global db_connection, db
    if db_connection is None or db is None:
        db_connection = DBConnection()
        db = await db_connection.client
    return db


async def get_user(user_id: str):
    """Get user information by user ID."""
    db = await get_db()
    user = await db.auth.admin.get_user_by_id(user_id)
    return user.user.model_dump()


async def calculate_monthly_usage(client, user_id: str, year: int, month: int):
    """Calculate total agent run minutes for a specific month for a user."""
    # Get start and end of specified month in UTC
    start_of_month = datetime(year, month, 1, tzinfo=timezone.utc)

    # Calculate start of next month for end boundary
    if month == 12:
        end_of_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_of_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    # First get all threads for this user
    threads_result = (
        await client.table("threads")
        .select("thread_id")
        .eq("account_id", user_id)
        .execute()
    )

    if not threads_result.data:
        return 0.0, []

    thread_ids = [t["thread_id"] for t in threads_result.data]
    logger.info(f"Found {len(thread_ids)} threads for user {user_id}")

    # Then get all agent runs for these threads in specified month
    runs_result = (
        await client.table("agent_runs")
        .select("id, started_at, completed_at, thread_id")
        .in_("thread_id", thread_ids)
        .gte("started_at", start_of_month.isoformat())
        .lt("started_at", end_of_month.isoformat())
        .execute()
    )

    if not runs_result.data:
        return 0.0, []

    logger.info(f"Found {len(runs_result.data)} agent runs in {year}-{month:02d}")

    # Calculate total minutes and collect run details
    total_seconds = 0
    valid_runs = 0
    run_details = []

    for run in runs_result.data:
        start_time = datetime.fromisoformat(
            run["started_at"].replace("Z", "+00:00")
        ).timestamp()

        if run["completed_at"]:
            end_time = datetime.fromisoformat(
                run["completed_at"].replace("Z", "+00:00")
            ).timestamp()
            # Skip runs that seem invalid (more than 2 hours)
            if start_time < end_time - 7200:
                logger.warning(f"Skipping run with duration > 2 hours: {run}")
                continue
            status = "completed"
        else:
            # For incomplete runs, use end of month as boundary if run started in that month
            end_time = min(
                end_of_month.timestamp(), datetime.now(timezone.utc).timestamp()
            )
            # Skip runs that started more than 1 hour ago and are still incomplete
            if start_time < datetime.now(timezone.utc).timestamp() - 3600:
                logger.warning(f"Skipping incomplete run started > 1 hour ago: {run}")
                continue
            status = "incomplete"

        duration = end_time - start_time
        total_seconds += duration
        valid_runs += 1

        # Store run details
        run_details.append(
            {
                "id": run["id"],
                "thread_id": run["thread_id"],
                "started_at": run["started_at"],
                "completed_at": run["completed_at"],
                "duration_minutes": duration / 60,
                "status": status,
            }
        )

        logger.debug(f"Run duration: {duration/60:.2f} minutes")

    logger.info(
        f"Processed {valid_runs} valid runs out of {len(runs_result.data)} total runs"
    )

    # Sort runs by duration (longest first)
    run_details.sort(key=lambda x: x["duration_minutes"], reverse=True)

    return total_seconds / 60, run_details  # Convert to minutes


async def main():
    """Main function to run the script."""
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Get monthly usage for a specific user and month"
    )
    parser.add_argument(
        "--user-id", type=str, help="User ID to get usage for", required=True
    )
    parser.add_argument("--year", type=int, help="Year (e.g., 2024)", required=True)
    parser.add_argument("--month", type=int, help="Month (1-12)", required=True)
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose logging"
    )

    args = parser.parse_args()

    # Validate month
    if args.month < 1 or args.month > 12:
        raise ValueError("Month must be between 1 and 12")

    try:
        # Get user information
        try:
            user = await get_user(args.user_id)
            logger.info(f"User: {user['id']} ({user['email']})")
        except Exception as e:
            logger.warning(f"Could not fetch user details: {e}")
            user = {"id": args.user_id, "email": "unknown"}

        # Get database connection
        db = await get_db()

        # Calculate monthly usage
        usage_minutes, run_details = await calculate_monthly_usage(
            db, args.user_id, args.year, args.month
        )

        # Display results
        month_name = datetime(args.year, args.month, 1).strftime("%B")
        print(f"\n=== Monthly Usage Report ===")
        print(f"User: {user['email']} ({user['id']})")
        print(f"Month: {month_name} {args.year}")
        print(f"Total Usage: {usage_minutes:.2f} minutes")
        print(f"Total Usage: {usage_minutes/60:.2f} hours")

        if usage_minutes > 0:
            print(f"Average per day: {usage_minutes/30:.2f} minutes")

        # Display top 10 runs
        if run_details:
            print(f"\n=== Top Longest Runs ===")
            for i, run in enumerate(run_details, 1):
                started_at = datetime.fromisoformat(
                    run["started_at"].replace("Z", "+00:00")
                )
                print(
                    f"{i:2d}. {run['duration_minutes']:6.2f} min | {started_at.strftime('%Y-%m-%d %H:%M')} | {run['status']:10} | Thread: {run['thread_id']} | Run: {run['id']}"
                )
        else:
            print("\nNo runs found for this period.")

    except Exception as e:
        logger.error(f"Error: {e}")
        raise e

    finally:
        await DBConnection.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
