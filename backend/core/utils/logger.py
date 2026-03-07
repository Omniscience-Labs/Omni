import asyncio
import structlog, logging, os

ENV_MODE = os.getenv("ENV_MODE", "LOCAL")

# Set default logging level based on environment
if ENV_MODE.upper() == "PRODUCTION":
    default_level = "DEBUG"
else:
    default_level = "DEBUG" 
    # default_level = "INFO"

LOGGING_LEVEL = logging.getLevelNamesMapping().get(
    os.getenv("LOGGING_LEVEL", default_level).upper(), 
    logging.DEBUG  
)

renderer = [structlog.processors.JSONRenderer()]
exc_processor = structlog.processors.dict_tracebacks
if ENV_MODE.lower() == "local".lower() or ENV_MODE.lower() == "staging".lower():
    renderer = [structlog.dev.ConsoleRenderer(colors=True)]
    exc_processor = structlog.processors.format_exc_info

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        exc_processor,
        structlog.processors.CallsiteParameterAdder(
            {
                structlog.processors.CallsiteParameter.FILENAME,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            }
        ),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.contextvars.merge_contextvars,
        *renderer,
    ],
    cache_logger_on_first_use=True,
    wrapper_class=structlog.make_filtering_bound_logger(LOGGING_LEVEL),
)

logger: structlog.stdlib.BoundLogger = structlog.get_logger()


def safe_fire_and_forget(coro, name: str = "background_task"):
    """Create an asyncio task that logs exceptions instead of silently dropping them."""
    task = asyncio.create_task(coro, name=name)
    task.add_done_callback(lambda t: _handle_task_result(t, name))
    return task


def _handle_task_result(task: asyncio.Task, name: str):
    try:
        task.result()
    except asyncio.CancelledError:
        pass
    except Exception:
        logger.warning(f"Background task '{name}' failed", exc_info=task.exception())