import uuid
from typing import Optional
from core.services import redis
from core.services.supabase import DBConnection
from .utils.logger import logger

# Import and re-export from specialized modules
from .utils.icon_generator import RELEVANT_ICONS, generate_icon_and_colors as generate_agent_icon_and_colors
from .utils.limits_checker import (
    check_agent_run_limit,
    check_agent_count_limit, 
    check_project_count_limit
)
from .utils.run_management import (
    cleanup_instance_runs,
    stop_agent_run_with_helpers,
    check_for_active_project_agent_run
)
from .utils.project_helpers import generate_and_update_project_name
from .utils.mcp_helpers import merge_custom_mcps

# Load Lucide React icons once at module level for performance
try:
    from pathlib import Path
    icons_file_path = Path(__file__).parent.parent / 'lucide_icons_cleaned.json'
    with open(icons_file_path, 'r') as f:
        RELEVANT_ICONS = json.load(f)
    logger.info(f"Loaded {len(RELEVANT_ICONS)} Lucide React icons from file")
except Exception as e:
    logger.warning(f"Failed to load icons file: {e}. Using fallback icons.")
    # Fallback to essential icons if file loading fails
    RELEVANT_ICONS = [
        # Core AI/Agent icons
        "message-circle", "code", "brain", "sparkles", "zap", "rocket", "bot",
        "cpu", "microchip", "terminal", "workflow", "target", "lightbulb",
        
        # Data & Storage
        "database", "file", "files", "folder", "folders", "hard-drive", "cloud",
        "download", "upload", "save", "copy", "trash", "archive",
        
        # User & Communication
        "user", "users", "mail", "phone", "send", "reply", "bell", 
        "headphones", "mic", "video", "camera",
        
        # Navigation & UI
        "house", "globe", "map", "map-pin", "search", "filter", "settings",
        "menu", "grid2x2", "list", "layout-grid", "panel-left", "panel-right",
        
        # Actions & Tools
        "play", "pause", "refresh-cw", "rotate-cw", "wrench", "pen", "pencil", 
        "brush", "scissors", "hammer",
        
        # Status & Feedback
        "check", "x", "plus", "minus", "info", "thumbs-up", "thumbs-down", 
        "heart", "star", "flag", "bookmark",
        
        # Time & Calendar
        "clock", "calendar", "timer", "hourglass", "history",
        
        # Security & Privacy
        "shield", "lock", "key", "fingerprint", "eye",
        
        # Business & Productivity
        "briefcase", "building", "store", "shopping-cart", "credit-card",
        "chart-bar", "chart-pie", "trending-up", "trending-down",
        
        # Creative & Media
        "music", "image", "images", "film", "palette", "paintbrush",
        "speaker", "volume",
        
        # System & Technical
        "cog", "monitor", "laptop", "smartphone", "wifi", "bluetooth", 
        "usb", "plug", "battery", "power",
        
        # Nature & Environment
        "sun", "moon", "leaf", "flower", "mountain", "earth"
    ]

# Global variables (will be set by initialize function)
db = None
instance_id = None

# Helper for version service
async def _get_version_service():
    from .versioning.version_service import get_version_service
    return await get_version_service()

async def cleanup():
    """Clean up resources and stop running agents on shutdown."""
    logger.debug("Starting cleanup of agent API resources")

    # Clean up instance-specific agent runs
    try:
        if instance_id:
            await cleanup_instance_runs(instance_id)
        else:
            logger.warning("Instance ID not set, cannot clean up instance-specific agent runs.")
    except Exception as e:
        logger.error(f"Failed to clean up running agent runs: {str(e)}")

    # Close Redis connection
    await redis.close()
    logger.debug("Completed cleanup of agent API resources")

def initialize(
    _db: DBConnection,
    _instance_id: Optional[str] = None
):
    """Initialize the agent API with resources from the main API."""
    global db, instance_id
    db = _db
    
    # Initialize the versioning module with the same database connection
    from .versioning.api import initialize as initialize_versioning
    initialize_versioning(_db)

    # Use provided instance_id or generate a new one
    if _instance_id:
        instance_id = _instance_id
    else:
        # Generate instance ID
        instance_id = str(uuid.uuid4())[:8]

    logger.debug(f"Initialized agent API with instance ID: {instance_id}")
