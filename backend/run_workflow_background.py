import sentry_sdk
import asyncio
import json
import traceback
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from services import redis
from workflows.executor import WorkflowExecutor
from workflows.models import WorkflowDefinition
from utils.logger import logger
import dramatiq
import uuid
from services.supabase import DBConnection
from dramatiq.brokers.rabbitmq import RabbitmqBroker
import os
from utils.retry import retry

try:
    broker = dramatiq.get_broker()
    if not any(isinstance(m, dramatiq.middleware.AsyncIO) for m in broker.middleware):
        broker.add_middleware(dramatiq.middleware.AsyncIO())
except RuntimeError:
    rabbitmq_host = os.getenv('RABBITMQ_HOST', 'rabbitmq')
    rabbitmq_port = int(os.getenv('RABBITMQ_PORT', 5672))
    rabbitmq_broker = RabbitmqBroker(host=rabbitmq_host, port=rabbitmq_port, middleware=[dramatiq.middleware.AsyncIO()])
    dramatiq.set_broker(rabbitmq_broker)

_initialized = False
db = DBConnection()
workflow_executor = WorkflowExecutor(db)
instance_id = "workflow_worker"

async def initialize():
    """Initialize the workflow worker with resources."""
    global db, workflow_executor, instance_id, _initialized

    if not instance_id:
        instance_id = str(uuid.uuid4())[:8]
    
    await retry(lambda: redis.initialize_async())
    await db.initialize()
    
    _initialized = True
    logger.info(f"Initialized workflow worker with instance ID: {instance_id}")

@dramatiq.actor
async def run_workflow_background(
    execution_id: str,
    workflow_id: str,
    workflow_name: str,
    workflow_definition: Dict[str, Any],
    variables: Optional[Dict[str, Any]] = None,
    triggered_by: str = "MANUAL",
    project_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    agent_run_id: Optional[str] = None
):
    """Run a workflow in the background using Dramatiq."""
    try:
        await initialize()
    except Exception as e:
        logger.critical(f"Failed to initialize workflow worker: {e}")
        raise e

    run_lock_key = f"workflow_run_lock:{execution_id}"
    
    lock_acquired = await redis.set(run_lock_key, instance_id, nx=True, ex=redis.REDIS_KEY_TTL)
    
    if not lock_acquired:
        existing_instance = await redis.get(run_lock_key)
        if existing_instance:
            logger.info(f"Workflow execution {execution_id} is already being processed by instance {existing_instance.decode() if isinstance(existing_instance, bytes) else existing_instance}. Skipping duplicate execution.")
            return
        else:
            lock_acquired = await redis.set(run_lock_key, instance_id, nx=True, ex=redis.REDIS_KEY_TTL)
            if not lock_acquired:
                logger.info(f"Workflow execution {execution_id} is already being processed by another instance. Skipping duplicate execution.")
                return

    sentry_sdk.set_tag("workflow_id", workflow_id)
    sentry_sdk.set_tag("execution_id", execution_id)

    logger.info(f"Starting background workflow execution: {execution_id} for workflow: {workflow_name} (Instance: {instance_id})")
    logger.info(f"🔄 Triggered by: {triggered_by}")

    client = await db.client
    start_time = datetime.now(timezone.utc)
    total_responses = 0
    pubsub = None
    stop_checker = None
    stop_signal_received = False

    # Define Redis keys and channels - use agent_run pattern if agent_run_id provided for frontend compatibility
    if agent_run_id:
        response_list_key = f"agent_run:{agent_run_id}:responses"
        response_channel = f"agent_run:{agent_run_id}:new_response"
        instance_control_channel = f"agent_run:{agent_run_id}:control:{instance_id}"
        global_control_channel = f"agent_run:{agent_run_id}:control"
        instance_active_key = f"active_run:{instance_id}:{agent_run_id}"
    else:
        # Fallback to workflow execution pattern
        response_list_key = f"workflow_execution:{execution_id}:responses"
        response_channel = f"workflow_execution:{execution_id}:new_response"
        instance_control_channel = f"workflow_execution:{execution_id}:control:{instance_id}"
        global_control_channel = f"workflow_execution:{execution_id}:control"
        instance_active_key = f"active_workflow:{instance_id}:{execution_id}"

    async def check_for_stop_signal():
        nonlocal stop_signal_received
        if not pubsub: return
        try:
            while not stop_signal_received:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if isinstance(data, bytes): data = data.decode('utf-8')
                    if data == "STOP":
                        logger.info(f"Received STOP signal for workflow execution {execution_id} (Instance: {instance_id})")
                        stop_signal_received = True
                        break
                if total_responses % 50 == 0:
                    try: await redis.expire(instance_active_key, redis.REDIS_KEY_TTL)
                    except Exception as ttl_err: logger.warning(f"Failed to refresh TTL for {instance_active_key}: {ttl_err}")
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            logger.info(f"Stop signal checker cancelled for {execution_id} (Instance: {instance_id})")
        except Exception as e:
            logger.error(f"Error in stop signal checker for {execution_id}: {e}", exc_info=True)
            stop_signal_received = True

    try:
        pubsub = await redis.create_pubsub()
        try:
            await retry(lambda: pubsub.subscribe(instance_control_channel, global_control_channel))
        except Exception as e:
            logger.error(f"Redis failed to subscribe to control channels: {e}", exc_info=True)
            raise e

        logger.debug(f"Subscribed to control channels: {instance_control_channel}, {global_control_channel}")
        stop_checker = asyncio.create_task(check_for_stop_signal())
        await redis.set(instance_active_key, "running", ex=redis.REDIS_KEY_TTL)

        await client.table('workflow_executions').update({
            "status": "running",
            "started_at": start_time.isoformat()
        }).eq('id', execution_id).execute()

        workflow = WorkflowDefinition(**workflow_definition)
        
        # Use provided thread_id or generate new one
        if not thread_id:
            thread_id = str(uuid.uuid4())

        final_status = "running"
        error_message = None
        pending_redis_operations = []

        async for response in workflow_executor.execute_workflow(
            workflow=workflow,
            variables=variables,
            thread_id=thread_id,
            project_id=project_id
        ):
            if stop_signal_received:
                logger.info(f"Workflow execution {execution_id} stopped by signal.")
                final_status = "stopped"
                break

            response_json = json.dumps(response)
            pending_redis_operations.append(asyncio.create_task(redis.rpush(response_list_key, response_json)))
            pending_redis_operations.append(asyncio.create_task(redis.publish(response_channel, "new")))
            total_responses += 1

            if response.get('type') == 'workflow_status':
                status_val = response.get('status')
                if status_val in ['completed', 'failed', 'stopped']:
                    logger.info(f"Workflow execution {execution_id} finished via status message: {status_val}")
                    final_status = status_val
                    if status_val == 'failed' or status_val == 'stopped':
                        error_message = response.get('error', f"Workflow ended with status: {status_val}")
                    break

        if final_status == "running":
            final_status = "completed"
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.info(f"Workflow execution {execution_id} completed normally (duration: {duration:.2f}s, responses: {total_responses})")
            completion_message = {"type": "workflow_status", "status": "completed", "message": "Workflow execution completed successfully"}
            await redis.rpush(response_list_key, json.dumps(completion_message))
            await redis.publish(response_channel, "new")

        await update_workflow_execution_status(client, execution_id, final_status, error=error_message, agent_run_id=agent_run_id)

        control_signal = "END_STREAM" if final_status == "completed" else "ERROR" if final_status == "failed" else "STOP"
        try:
            await redis.publish(global_control_channel, control_signal)
            logger.debug(f"Published final control signal '{control_signal}' to {global_control_channel}")
        except Exception as e:
            logger.warning(f"Failed to publish final control signal {control_signal}: {str(e)}")

    except Exception as e:
        error_message = str(e)
        traceback_str = traceback.format_exc()
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.error(f"Error in workflow execution {execution_id} after {duration:.2f}s: {error_message}\n{traceback_str} (Instance: {instance_id})")
        final_status = "failed"

        error_response = {"type": "workflow_status", "status": "error", "message": error_message}
        try:
            await redis.rpush(response_list_key, json.dumps(error_response))
            await redis.publish(response_channel, "new")
        except Exception as redis_err:
            logger.error(f"Failed to push error response to Redis for {execution_id}: {redis_err}")

        await update_workflow_execution_status(client, execution_id, "failed", error=f"{error_message}\n{traceback_str}", agent_run_id=agent_run_id)
        try:
            await redis.publish(global_control_channel, "ERROR")
            logger.debug(f"Published ERROR signal to {global_control_channel}")
        except Exception as e:
            logger.warning(f"Failed to publish ERROR signal: {str(e)}")

    finally:
        if stop_checker and not stop_checker.done():
            stop_checker.cancel()
            try: await stop_checker
            except asyncio.CancelledError: pass
            except Exception as e: logger.warning(f"Error during stop_checker cancellation: {e}")

        if pubsub:
            try:
                await pubsub.unsubscribe()
                await pubsub.close()
                logger.debug(f"Closed pubsub connection for {execution_id}")
            except Exception as e:
                logger.warning(f"Error closing pubsub for {execution_id}: {str(e)}")

        await _cleanup_redis_response_list(execution_id, agent_run_id)
        await _cleanup_redis_instance_key(execution_id, agent_run_id)
        await _cleanup_redis_run_lock(execution_id)

        try:
            await asyncio.wait_for(asyncio.gather(*pending_redis_operations), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for pending Redis operations for {execution_id}")

        logger.info(f"Workflow execution background task fully completed for: {execution_id} (Instance: {instance_id}) with final status: {final_status}")

async def update_workflow_execution_status(client, execution_id: str, status: str, error: Optional[str] = None, agent_run_id: Optional[str] = None):
    """Update workflow execution status in database."""
    try:
        update_data = {
            "status": status,
            "completed_at": datetime.now(timezone.utc).isoformat() if status in ['completed', 'failed', 'stopped'] else None,
            "error": error
        }
        
        await client.table('workflow_executions').update(update_data).eq('id', execution_id).execute()
        logger.info(f"Updated workflow execution {execution_id} status to {status}")
        
        # Also update agent_runs table if agent_run_id provided (for frontend streaming compatibility)
        if agent_run_id:
            await client.table('agent_runs').update(update_data).eq('id', agent_run_id).execute()
            logger.info(f"Updated agent run {agent_run_id} status to {status}")
        
    except Exception as e:
        logger.error(f"Failed to update workflow execution status: {e}")

async def _cleanup_redis_response_list(execution_id: str, agent_run_id: Optional[str] = None):
    """Set TTL on workflow execution response list."""
    try:
        if agent_run_id:
            response_list_key = f"agent_run:{agent_run_id}:responses"
        else:
            response_list_key = f"workflow_execution:{execution_id}:responses"
        await redis.expire(response_list_key, redis.REDIS_KEY_TTL)
        logger.debug(f"Set TTL on {response_list_key}")
    except Exception as e:
        logger.warning(f"Failed to set TTL on response list for {execution_id}: {e}")

async def _cleanup_redis_instance_key(execution_id: str, agent_run_id: Optional[str] = None):
    """Remove instance-specific active run key."""
    try:
        if agent_run_id:
            instance_active_key = f"active_run:{instance_id}:{agent_run_id}"
        else:
            instance_active_key = f"active_workflow:{instance_id}:{execution_id}"
        await redis.delete(instance_active_key)
        logger.debug(f"Cleaned up instance key {instance_active_key}")
    except Exception as e:
        logger.warning(f"Failed to clean up instance key for {execution_id}: {e}")

async def _cleanup_redis_run_lock(execution_id: str):
    """Remove workflow execution lock."""
    try:
        run_lock_key = f"workflow_run_lock:{execution_id}"
        await redis.delete(run_lock_key)
        logger.debug(f"Cleaned up run lock {run_lock_key}")
    except Exception as e:
        logger.warning(f"Failed to clean up run lock for {execution_id}: {e}") 