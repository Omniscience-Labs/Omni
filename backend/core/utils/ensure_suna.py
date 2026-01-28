import asyncio
from typing import Optional
from core.utils.logger import logger
from core.services.supabase import DBConnection
from core.utils.suna_default_agent_service import SunaDefaultAgentService

_installation_cache = set()
_installation_in_progress = set()

async def ensure_suna_installed(account_id: str) -> None:
    if account_id in _installation_cache:
        return
    
    if account_id in _installation_in_progress:
        return
    
    try:
        _installation_in_progress.add(account_id)
        
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        existing = await client.from_('agents').select('agent_id').eq(
            'account_id', account_id
        ).eq('metadata->>is_suna_default', 'true').limit(1).execute()
        
        if existing.data:
            _installation_cache.add(account_id)
            logger.debug(f"Suna already installed for account {account_id}")
            return
        
        if existing.data:
            _installation_cache.add(account_id)
            logger.debug(f"Suna already installed for account {account_id}")
            return
            
        # 1. Check/Create in basejump.accounts
        try:
            account_check = await client.schema('basejump').table('accounts').select('id').eq('id', account_id).execute()
            if not account_check.data:
                logger.warning(f"Account {account_id} missing in basejump.accounts. Auto-creating personal account.")
                
                # Generate unique slug to avoid collisions
                import uuid
                unique_suffix = str(uuid.uuid4())[:8]
                new_account = {
                    "id": account_id,
                    "name": "Personal Account",
                    "personal_account": True,
                    "primary_owner_user_id": account_id,
                    "slug": f"user-{account_id[:8]}-{unique_suffix}" 
                }
                
                try:
                    await client.schema('basejump').table('accounts').insert(new_account).execute()
                    logger.info(f"✅ Auto-created Basejump account for {account_id}")
                except Exception as insert_err:
                    logger.error(f"Failed to insert into basejump.accounts: {insert_err}")
                    # Don't raise yet, try public.accounts
        except Exception as e:
             logger.warning(f"Error checking basejump account: {e}")

        # 2. Check/Create in public.accounts (default schema)
        try:
            # We don't specify schema to use default (public)
            public_account_check = await client.table('accounts').select('id').eq('id', account_id).execute()
            if not public_account_check.data:
                logger.warning(f"Account {account_id} missing in public.accounts. Auto-creating personal account.")
                
                # Generate unique slug
                import uuid
                unique_suffix = str(uuid.uuid4())[:8]
                public_account = {
                    "id": account_id,
                    "name": "Personal Account",
                    # "personal_account": True, # Might not exist in public view/table
                    "primary_owner_user_id": account_id,
                    "slug": f"user-{account_id[:8]}-{unique_suffix}" 
                }
                
                try:
                    await client.table('accounts').insert(public_account).execute()
                    logger.info(f"✅ Auto-created Public account for {account_id}")
                except Exception as insert_err:
                    logger.error(f"Failed to insert into public.accounts: {insert_err}")
                    # If both failed, we are in trouble.
        except Exception as e:
             logger.warning(f"Error checking/creating public account: {e}")
             
        # 3. VERIFY account exists before proceeding
        try:
             # Check if account exists now (in public, which projects relies on)
             verify_check = await client.table('accounts').select('id').eq('id', account_id).execute()
             if not verify_check.data:
                 # Check basejump as fallback
                 verify_bj = await client.schema('basejump').table('accounts').select('id').eq('id', account_id).execute()
                 if not verify_bj.data:
                     raise Exception(f"CRITICAL: Account {account_id} could not be provisioned in 'accounts' table. Agent start will fail.")
        except Exception as e:
            logger.error(f"Verification failed: {e}")
            raise

        logger.info(f"Installing Suna agent for account {account_id}")
        service = SunaDefaultAgentService(db)
        agent_id = await service.install_suna_agent_for_user(account_id, replace_existing=False)
        
        if agent_id:
            _installation_cache.add(account_id)
            logger.info(f"Successfully installed Suna agent {agent_id} for account {account_id}")
        else:
            logger.warning(f"Failed to install Suna agent for account {account_id}")
            
    except Exception as e:
        logger.error(f"Error ensuring Suna installation for {account_id}: {e}")
    finally:
        _installation_in_progress.discard(account_id)


def trigger_suna_installation(account_id: str) -> None:
    try:
        asyncio.create_task(ensure_suna_installed(account_id))
    except RuntimeError:
        pass

