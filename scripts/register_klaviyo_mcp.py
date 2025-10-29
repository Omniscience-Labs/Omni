#!/usr/bin/env python3
"""
Script to register Klaviyo MCP Server with Omni

This script helps users register the Klaviyo MCP Server as a custom MCP connection
in their Omni instance.

Usage:
    python scripts/register_klaviyo_mcp.py --api-key YOUR_KLAVIYO_API_KEY --account-id YOUR_ACCOUNT_ID

Or set environment variables:
    export KLAVIYO_API_KEY=your_key
    export ACCOUNT_ID=your_account_id
    python scripts/register_klaviyo_mcp.py
"""

import os
import sys
import asyncio
import argparse
import hashlib
from typing import Optional
from pathlib import Path

# Add parent directory to path to import from core
sys.path.append(str(Path(__file__).parent.parent / "backend"))

from core.credentials import EncryptionService
from core.services.supabase import DBConnection


async def register_klaviyo_mcp(
    account_id: str,
    api_key: str,
    mcp_url: Optional[str] = None,
    display_name: str = "Klaviyo",
    enabled_tools: Optional[list] = None
):
    """
    Register Klaviyo MCP Server with the user's account
    
    Args:
        account_id: User's Supabase account ID
        api_key: Klaviyo Private API Key
        mcp_url: URL of the Klaviyo MCP server (defaults to local)
        display_name: Display name for the connection
        enabled_tools: List of enabled tools (defaults to all)
    """
    
    # Default MCP URL (localhost for development, klaviyo-mcp for Docker)
    if mcp_url is None:
        mcp_url = os.getenv("KLAVIYO_MCP_URL", "http://klaviyo-mcp:3010/sse")
    
    # Default enabled tools (all available tools)
    if enabled_tools is None:
        enabled_tools = [
            "get_profiles",
            "get_profile",
            "create_profile",
            "update_profile",
            "get_lists",
            "get_list",
            "create_list",
            "add_profiles_to_list",
            "create_event",
            "get_campaigns",
            "get_campaign",
            "get_flows",
            "get_segments",
            "get_metrics",
        ]
    
    # Prepare configuration
    config = {
        "url": mcp_url,
        "headers": {
            "Content-Type": "application/json"
        },
        "metadata": {
            "api_key": api_key  # This will be encrypted
        }
    }
    
    # Encrypt configuration
    encryption_service = EncryptionService()
    encrypted_config = encryption_service.encrypt_data(config)
    
    # Create config hash for integrity
    config_hash = hashlib.sha256(encrypted_config.encode()).hexdigest()
    
    # Connect to database
    db = DBConnection()
    
    try:
        # Check if credential already exists
        existing = db.fetch_one(
            """
            SELECT credential_id, is_active 
            FROM user_mcp_credentials 
            WHERE account_id = %s AND mcp_qualified_name = %s
            """,
            (account_id, "klaviyo")
        )
        
        if existing:
            # Update existing credential
            db.execute(
                """
                UPDATE user_mcp_credentials 
                SET 
                    encrypted_config = %s,
                    config_hash = %s,
                    is_active = true,
                    updated_at = NOW()
                WHERE credential_id = %s
                """,
                (encrypted_config, config_hash, existing['credential_id'])
            )
            print(f"✅ Updated existing Klaviyo MCP credential (ID: {existing['credential_id']})")
        else:
            # Insert new credential
            result = db.execute(
                """
                INSERT INTO user_mcp_credentials (
                    account_id,
                    mcp_qualified_name,
                    display_name,
                    encrypted_config,
                    config_hash,
                    is_active
                ) VALUES (%s, %s, %s, %s, %s, true)
                RETURNING credential_id
                """,
                (account_id, "klaviyo", display_name, encrypted_config, config_hash)
            )
            credential_id = result[0]['credential_id'] if result else None
            print(f"✅ Created new Klaviyo MCP credential (ID: {credential_id})")
        
        # Add to custom_mcps in agents table for this account
        custom_mcp_config = {
            "qualifiedName": "klaviyo",
            "name": display_name,
            "provider": "http",
            "config": {
                "url": mcp_url
            },
            "enabledTools": enabled_tools,
            "enabled_tools": enabled_tools
        }
        
        print(f"""
✅ Klaviyo MCP Server registered successfully!

Configuration:
- Display Name: {display_name}
- MCP URL: {mcp_url}
- Enabled Tools: {len(enabled_tools)} tools
- Account ID: {account_id}

You can now use Klaviyo tools in your agents by adding this MCP connection
to your agent's configuration.

Next steps:
1. Start the Docker services: docker-compose up -d
2. Add Klaviyo MCP to your agent via the UI or API
3. Use Klaviyo tools like get_profiles, create_list, etc.
        """)
        
    except Exception as e:
        print(f"❌ Error registering Klaviyo MCP: {str(e)}")
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Register Klaviyo MCP Server with Omni"
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("KLAVIYO_API_KEY"),
        help="Klaviyo Private API Key"
    )
    parser.add_argument(
        "--account-id",
        default=os.getenv("ACCOUNT_ID"),
        help="Supabase account ID"
    )
    parser.add_argument(
        "--mcp-url",
        default=None,
        help="URL of Klaviyo MCP server (default: http://klaviyo-mcp:3010/sse)"
    )
    parser.add_argument(
        "--display-name",
        default="Klaviyo",
        help="Display name for the connection"
    )
    
    args = parser.parse_args()
    
    if not args.api_key:
        print("❌ Error: KLAVIYO_API_KEY is required")
        print("   Set via --api-key or KLAVIYO_API_KEY environment variable")
        sys.exit(1)
    
    if not args.account_id:
        print("❌ Error: ACCOUNT_ID is required")
        print("   Set via --account-id or ACCOUNT_ID environment variable")
        sys.exit(1)
    
    # Run registration
    asyncio.run(register_klaviyo_mcp(
        account_id=args.account_id,
        api_key=args.api_key,
        mcp_url=args.mcp_url,
        display_name=args.display_name
    ))


if __name__ == "__main__":
    main()

