"""
Form field detection using FFDNet-L (YOLO-based).

Detects text fields, checkboxes, and signature blocks; returns normalized
bounding boxes (0-1) for use with OCR output or LLM analysis.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

from core.pdf_forms.types import BlankField
from core.tools.pdf_utils import RasterizedPage

# Lazy-loaded model
_model = None


def _get_model_path(model_path: Optional[str] = None) -> str:
    """Resolve model path: env FFDNET_MODEL_PATH first, else download from Hugging Face."""
    if model_path and Path(model_path).exists():
        return model_path
    env_path = os.environ.get("FFDNET_MODEL_PATH")
    if env_path and Path(env_path).exists():
        return env_path
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(
            repo_id="jbarrow/FFDNet-L",
            filename="FFDNet-L.pt",
        )
        return path
    except Exception as e:
        raise FileNotFoundError(
            "FFDNet-L model not found. Set FFDNET_MODEL_PATH to a local FFDNet-L.pt path, "
            "or install huggingface_hub to download from Hugging Face."
        ) from e


def _load_model(model_path: Optional[str] = None, device: str = "cpu"):
    """Load YOLO model once; cache in module."""
    global _model
    if _model is not None:
        return _model
    try:
        from ultralytics import YOLO
    except ImportError as e:
        raise ImportError(
            "ultralytics is required for form field detection. Install with: pip install ultralytics"
        ) from e
    path = _get_model_path(model_path)
    _model = YOLO(path)
    return _model


def detect_form_fields(
    page_images: List[RasterizedPage],
    *,
    model_path: Optional[str] = None,
    confidence_threshold: float = 0.35,
    device: str = "cpu",
) -> List[BlankField]:
    """
    Detect form fields (text, checkbox, signature) on each page image.

    Returns list of BlankField with normalized bbox (left, top, width, height) 0-1.
    """
    model = _load_model(model_path, device)
    results: List[BlankField] = []

    for page in page_images:
        # ultralytics accepts PIL Image
        pred = model.predict(
            page.image,
            conf=confidence_threshold,
            device=device,
            verbose=False,
        )
        if not pred:
            continue
        boxes = pred[0].boxes
        if boxes is None:
            continue
        # Normalized xyxy (left, top, right, bottom) in 0-1
        xyxy = boxes.xyxyn
        if xyxy is None or len(xyxy) == 0:
            continue
        clss = boxes.cls
        confs = boxes.conf
        def _scalar(x):
            return x.item() if hasattr(x, "item") else float(x)

        for i in range(len(xyxy)):
            left = _scalar(xyxy[i, 0])
            top = _scalar(xyxy[i, 1])
            right = _scalar(xyxy[i, 2])
            bottom = _scalar(xyxy[i, 3])
            width = right - left
            height = bottom - top
            # Clamp to 0-1
            left = max(0.0, min(1.0, left))
            top = max(0.0, min(1.0, top))
            width = max(0.0, min(1.0, width))
            height = max(0.0, min(1.0, height))
            class_id = int(_scalar(clss[i])) if clss is not None else 0
            conf = _scalar(confs[i]) if confs is not None else 0.0
            results.append(BlankField(
                page_index=page.page_index,
                bbox_normalized=(left, top, width, height),
                class_id=class_id,
                confidence=conf,
            ))
    return results
