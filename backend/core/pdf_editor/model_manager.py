"""Model manager for PDF editor YOLO model."""
import threading
from pathlib import Path
from ultralytics import YOLO
from core.utils.logger import logger

_model_cache = None
_model_lock = threading.Lock()

def get_model():
    """Get or load YOLO model (thread-safe, per-worker singleton)"""
    global _model_cache
    
    if _model_cache is None:
        with _model_lock:
            if _model_cache is None:
                model_path = Path("/app/models/FFDNet-L.pt")
                
                if not model_path.exists():
                    raise FileNotFoundError(
                        f"Model not found at {model_path}. "
                        "Model should be downloaded during Docker build."
                    )
                
                logger.info(f"Loading YOLO model from {model_path}")
                _model_cache = YOLO(str(model_path))
                logger.info("YOLO model loaded successfully")
    
    return _model_cache
