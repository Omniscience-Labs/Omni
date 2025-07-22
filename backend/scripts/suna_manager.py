#!/usr/bin/env python3
"""
🌞 SUNA AGENT MANAGER

Dead simple interface for managing Suna agents across all users.

Usage:
    python suna_manager.py sync              # Sync all agents to current config
    python suna_manager.py sync --dry-run    # Check what would be synced
    python suna_manager.py install           # Install for users who don't have Suna
    python suna_manager.py status            # Show current sync status
    python suna_manager.py config            # Show current configuration

Examples:
    python suna_manager.py sync              # Most common command
    python suna_manager.py status            # Check current state
"""

import asyncio
import argparse
import sys
import json
from pathlib import Path

# Add the backend directory to the path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from agent.suna import SunaSyncService
from utils.logger import logger


def print_success(message: str):
    """Print success message"""
    print(f"✅ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"❌ {message}")

def print_info(message: str):
    """Print info message"""
    print(f"ℹ️  {message}")

def print_warning(message: str):
    """Print warning message"""
    print(f"⚠️  {message}")


class SunaManagerCLI:
    """Clean CLI interface for Suna management"""
    
    def __init__(self):
        self.sync_service = SunaSyncService()
    
    async def sync_command(self, dry_run: bool = False):
        action = "🔍 Checking what would be synced" if dry_run else "🔬 Surgical sync: updating system prompt & tools only"
        print(action)
        print("   ✅ Preserves: Integrations, Workflows, Knowledge Base, Triggers, Custom MCPs")
        
        result = await self.sync_service.sync_all_agents(dry_run=dry_run)
        
        if result.success:
            if result.synced_count == 0:
                print_success("All agents are already up to date!")
            else:
                print_success(f"Successfully synced {result.synced_count} agents")
                
            if dry_run and result.details:
                detail = result.details[0]
                if "agents" in detail:
                    print(f"\nWould sync {len(detail['agents'])} agents:")
                    for agent in detail['agents'][:5]:  # Show first 5
                        print(f"  - Agent {agent['agent_id']} (User {agent['account_id']})")
                    if len(detail['agents']) > 5:
                        print(f"  ... and {len(detail['agents']) - 5} more")
        else:
            print_error("Sync failed!")
            for error in result.errors:
                print(f"  💥 {error}")
        
        if result.failed_count > 0:
            print_warning(f"{result.failed_count} agents failed to sync")
            for detail in result.details:
                if detail.get('status') == 'failed':
                    print(f"  - Agent {detail['agent_id']}: {detail.get('error', 'Unknown error')}")
    
    async def install_command(self):
        """Install Suna for users who don't have it"""
        print("🚀 Installing Suna for users who don't have it")
        
        result = await self.sync_service.install_for_all_missing_users()
        
        if result.success:
            if result.synced_count == 0:
                print_success("All users already have Suna agents!")
            else:
                print_success(f"Successfully installed Suna for {result.synced_count} users")
        else:
            print_error("Installation failed!")
            for error in result.errors:
                print(f"  💥 {error}")
        
        if result.failed_count > 0:
            print_warning(f"Failed to install for {result.failed_count} users")
    
    async def status_command(self):
        """Show current sync status"""
        print("📊 Suna Agent Status")
        print("=" * 50)
        
        status = await self.sync_service.get_sync_status()
        
        if "error" in status:
            print_error(f"Failed to get status: {status['error']}")
            return
        
        print(f"🏷️  Current Config Version: {status.get('current_config_version', 'unknown')}")
        print(f"👥 Total Agents: {status.get('total_agents', 0)}")
        print(f"🔄 Agents Needing Sync: {status.get('agents_needing_sync', 0)}")
        
        if status.get('agents_needing_sync', 0) > 0:
            print_warning(f"{status['agents_needing_sync']} agents need syncing")
        else:
            print_success("All agents are up to date")
        
        version_dist = status.get('version_distribution', {})
        if version_dist:
            print(f"\n📈 Version Distribution:")
            for version, count in sorted(version_dist.items(), key=lambda x: x[1], reverse=True):
                print(f"  {version}: {count} agents")
        
        print(f"\n🔧 Version System Available: {'Yes' if status.get('version_system_available') else 'No'}")
        print(f"📅 Last Sync: {status.get('last_sync', 'unknown')}")
    
    async def config_command(self):
        """Show current configuration"""
        print("⚙️  Current Suna Configuration")
        print("=" * 50)
        
        try:
            config = self.sync_service.config_manager.get_current_config()
            
            print(f"📛 Name: {config.name}")
            print(f"📝 Description: {config.description}")
            print(f"🏷️  Version Tag: {config.version_tag}")
            print(f"🌞 Avatar: {config.avatar} ({config.avatar_color})")
            
            print(f"\n🛠️  Enabled Tools ({len([t for t, c in config.agentpress_tools.items() if c.get('enabled', False)])} total):")
            for tool_name, tool_config in config.agentpress_tools.items():
                if isinstance(tool_config, dict) and tool_config.get('enabled', False):
                    desc = tool_config.get('description', 'No description')
                    print(f"  ✅ {tool_name}: {desc}")
            
            print(f"\n🔒 User Restrictions:")
            for restriction, enabled in config.restrictions.items():
                status = "🚫" if not enabled else "✅"
                print(f"  {status} {restriction}: {'disabled' if not enabled else 'enabled'}")
            
            print(f"\n📋 System Prompt Preview:")
            preview = config.system_prompt[:200].replace('\n', ' ')
            print(f"  {preview}{'...' if len(config.system_prompt) > 200 else ''}")
            
        except Exception as e:
            print_error(f"Failed to load configuration: {e}")


async def main():
    parser = argparse.ArgumentParser(
        description="🌞 Suna Agent Manager - Simple and robust",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Sync command
    sync_parser = subparsers.add_parser('sync', help='🔄 Sync all agents to current config')
    sync_parser.add_argument('--dry-run', action='store_true', help='Check what would be synced without making changes')
    
    # Install command
    subparsers.add_parser('install', help='📦 Install Suna for users who don\'t have it')
    
    # Status command
    subparsers.add_parser('status', help='📊 Show current sync status')
    
    # Config command
    subparsers.add_parser('config', help='⚙️  Show current configuration')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    cli = SunaManagerCLI()
    
    try:
        if args.command == 'sync':
            await cli.sync_command(dry_run=args.dry_run)
        elif args.command == 'install':
            await cli.install_command()
        elif args.command == 'status':
            await cli.status_command()
        elif args.command == 'config':
            await cli.config_command()
        else:
            parser.print_help()
            
    except KeyboardInterrupt:
        print_warning("Operation cancelled by user")
    except Exception as e:
        print_error(f"Unexpected error: {str(e)}")
        logger.error(f"CLI error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main()) 