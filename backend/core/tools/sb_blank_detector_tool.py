"""
Form fields: detect blanks and fill form (single module).
Flow:
  1. detect_form_fields     → tool.result = JSON with labels mapped to blank coords, empty values.
  2. get_form_field_labels → tool.result = extracted labels with empty values (use these exact labels to get answers).
  3. edit_form_mapping     → tool.result = same JSON with values filled (after gathering answers for the labels).
  4. fill_form             → tool.result = output PDF path.
"""
import base64
import io
import json
import re
import threading
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional, Union

import cv2
import numpy as np
import pymupdf
from pdf2image import convert_from_bytes
from PIL import Image

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.files_utils import clean_path
from core.utils.logger import logger

# --- CONFIGURATION ---
REPO_ID = "jbarrow/FFDNet-L"
FILENAME = "FFDNet-L.pt"
DEFAULT_MODEL_DIR = Path("/app/models")
DPI = 300
ROW_TOLERANCE = 30  # Pixels: fields within this Y-range are treated as same line (top-to-bottom, then left-to-right)
IMGSZ = 1280   # Critical: 1280 keeps thin lines sharp (640 blurs them)
CONF = 0.1     # Same as reference FFDNet-L script; avoids misdetections
IOU = 0.45
CLASS_MAP = {0: "text_field", 1: "checkbox", 2: "signature"}
MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB
# Color coding (BGR): Green=Text, Red=Checkbox, Blue=Signature (same as reference)
COLOR_TEXT = (0, 255, 0)
COLOR_CHECKBOX = (0, 0, 255)
COLOR_SIGNATURE = (255, 0, 0)

_model_cache = None
_model_lock = threading.Lock()


def _get_model_path() -> Path:
    local = DEFAULT_MODEL_DIR / FILENAME
    if local.exists():
        return local
    try:
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(repo_id=REPO_ID, filename=FILENAME, local_dir=str(DEFAULT_MODEL_DIR))
        return Path(path)
    except Exception as e:
        logger.warning(f"hf_hub_download failed: {e}")
    return local


def _get_model():
    global _model_cache
    if _model_cache is None:
        with _model_lock:
            if _model_cache is None:
                from ultralytics import YOLO
                model_path = _get_model_path()
                if not model_path.exists():
                    raise FileNotFoundError(
                        f"Model not found at {model_path}. "
                        "Ensure model is downloaded (e.g. via Docker build)."
                    )
                logger.info(f"Loading YOLO form-field model from {model_path}")
                _model_cache = YOLO(str(model_path))
                logger.info("Form-field detection model loaded")
    return _model_cache


def pdf_to_image(pdf_bytes: bytes, dpi: int = DPI, first_page_only: bool = True) -> Tuple[Image.Image, np.ndarray]:
    """
    Convert PDF bytes to image(s). Returns (PIL image, BGR numpy array) for the first page.
    """
    if len(pdf_bytes) > MAX_PDF_SIZE:
        raise ValueError(f"PDF exceeds {MAX_PDF_SIZE // (1024*1024)}MB limit")
    images = convert_from_bytes(
        pdf_bytes,
        dpi=dpi,
        first_page=1,
        last_page=1 if first_page_only else None,
    )
    if not images:
        raise ValueError("PDF produced no images")
    pil_image = images[0]
    image = np.array(pil_image)
    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    return pil_image, image_bgr


def detect_fields(
    pdf_bytes: bytes,
    dpi: int = DPI,
    imgsz: int = IMGSZ,
    conf: float = CONF,
    iou: float = IOU,
) -> Tuple[List[Dict[str, Any]], np.ndarray]:
    """
    Detect form fields in a PDF (bytes). Returns (list of fields with id/type/confidence/bbox, image_bgr).
    """
    pil_image, image_bgr = pdf_to_image(pdf_bytes, dpi=dpi)
    model = _get_model()
    results = model.predict(image_bgr, imgsz=imgsz, conf=conf, iou=iou)[0]
    detected_fields = []
    if results.boxes is not None and len(results.boxes.data) > 0:
        h, w = image_bgr.shape[:2]
        for box in results.boxes.data.tolist():
            x1, y1, x2, y2, score, cls_id = box
            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            cls_id = int(cls_id)
            class_name = CLASS_MAP.get(cls_id, "unknown")
            detected_fields.append({
                "type": class_name,
                "confidence": round(float(score), 3),
                "bbox": {
                    "x1": round(x1 / w, 4),
                    "y1": round(y1 / h, 4),
                    "x2": round(x2 / w, 4),
                    "y2": round(y2 / h, 4),
                },
                "bbox_pixels": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
    return detected_fields, image_bgr


def _color_for_type(field_type: str) -> Tuple[int, int, int]:
    """BGR color by class: Green=Text, Red=Checkbox, Blue=Signature (same as reference script)."""
    t = (field_type or "").lower()
    if "checkbox" in t:
        return COLOR_CHECKBOX
    if "signature" in t:
        return COLOR_SIGNATURE
    return COLOR_TEXT


def draw_boxes_with_ids_and_type(image_bgr: np.ndarray, fields: List[Dict[str, Any]]) -> np.ndarray:
    """Draw boxes with color by type (Green=Text, Red=Checkbox, Blue=Signature) and label 'ID: Type (conf)'. Same logic as reference FFDNet-L script."""
    type_to_display = {"text_field": "Text Field", "checkbox": "Checkbox", "signature": "Signature"}
    for f in fields:
        bp = f.get("bbox_pixels", {})
        x1, y1 = bp.get("x1", 0), bp.get("y1", 0)
        x2, y2 = bp.get("x2", 0), bp.get("y2", 0)
        fid = f.get("id", 0)
        field_type = f.get("type", "text_field")
        conf = f.get("confidence", 0)
        color = _color_for_type(field_type)
        cv2.rectangle(image_bgr, (x1, y1), (x2, y2), color, 2)
        type_display = type_to_display.get(field_type, field_type.replace("_", " ").title())
        label = f"{fid}: {type_display} ({conf:.2f})"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
        cv2.rectangle(image_bgr, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
        cv2.putText(
            image_bgr, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1,
        )
    return image_bgr


def _image_bgr_to_base64_url(image_bgr: np.ndarray, format: str = "png") -> str:
    """Encode BGR image to data URL for vision API."""
    pil = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    pil.save(buf, format=format)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/{format};base64,{b64}"


def _parse_labels_json(text: str) -> Dict[str, str]:
    """Extract JSON object from LLM text (handle markdown code blocks)."""
    text = text.strip()
    # Strip markdown code block if present
    if "```" in text:
        match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
        if match:
            text = match.group(1)
    # Find first { and then match balanced braces
    start = text.find("{")
    if start == -1:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {}
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(text[start : i + 1])
                    return {str(k): str(v).strip() for k, v in obj.items()}
                except json.JSONDecodeError:
                    break
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


@tool_metadata(
    display_name="Form Field Detection",
    description="Detect form fields (text, checkboxes, signatures) in a PDF file in your workspace",
    icon="FileSearch",
    color="bg-amber-100 dark:bg-amber-800/50",
    weight=50,
    visible=True,
)
class SandboxBlankDetectorTool(SandboxToolsBase):
    """In-chat tool to detect blank/form fields in a PDF and label them via default LLM."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    def _resolve_path(self, file_path: str) -> str:
        """Resolve path relative to workspace."""
        return clean_path(file_path, self.workspace_path)

    async def _get_default_model(self) -> str:
        """Resolve default LLM model for the current account (for vision/labeling)."""
        from core.ai_models import model_manager
        from core.ai_models.registry import FREE_MODEL_ID
        try:
            agent_config = getattr(self.thread_manager, "agent_config", None) or {}
            account_id = agent_config.get("account_id")
            client = await self.thread_manager.db.client
            if account_id:
                return await model_manager.get_default_model_for_user(client, account_id)
        except Exception as e:
            logger.warning(f"Could not get default model for user: {e}")
        return FREE_MODEL_ID

    async def _get_labels_for_blanks(self, image_bgr: np.ndarray, fields: List[Dict[str, Any]]) -> Dict[str, str]:
        """Call default LLM to filter real form fields and get a short label per blank id. Only IDs returned are real fields; misdetections are omitted."""
        if not fields:
            return {}
        model_name = await self._get_default_model()
        image_url = _image_bgr_to_base64_url(image_bgr)
        ids_str = ", ".join(str(f["id"]) for f in fields)
        prompt = (
            "This image shows a form with green boxes. Each box has an ID number above it. "
            "The detector often produces MISDETECTIONS: boxes around things that are NOT fillable fields. You must EXCLUDE those.\n\n"
            "**Step 1 – Identify misdetections (do NOT include these in your output):**\n"
            "• Boxes around underlines, horizontal or vertical lines, borders, or rules\n"
            "• Boxes around static text (labels, section titles, instructions, headers)\n"
            "• Boxes around logos, stamps, or decorative areas\n"
            "• Boxes around table borders or layout lines (not the cells where user types)\n"
            "• Any box where the user is NOT expected to type, check, or sign\n"
            "• When in doubt, treat the box as a misdetection and OMIT its ID\n\n"
            "**Step 2 – Real fields only:**\n"
            "A real field is a clear blank: a text field (empty line/box for typing), a checkbox (small square to check), or a signature area. "
            "Include in your JSON ONLY the IDs of boxes that are clearly such fillable areas.\n\n"
            f"Box IDs in the image: {ids_str}. For each box that is a REAL field (not a misdetection), give a short label (e.g. 'First Name', 'Date', 'Signature'). "
            "Output ONLY a valid JSON object: keys = string IDs of real fields, values = label strings. "
            "Do NOT include any ID for a misdetection. No markdown, no code fence, no other text. Example: {\"0\": \"First Name\", \"2\": \"Date\"}."
        )
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ]
        try:
            from core.services.llm import make_llm_api_call
            response = await make_llm_api_call(
                messages=messages,
                model_name=model_name,
                temperature=0,
                max_tokens=1024,
                stream=False,
            )
            if not response or not getattr(response, "choices", None) or len(response.choices) == 0:
                return {}
            content = response.choices[0].message.content or ""
            labels = _parse_labels_json(content)
            return {str(k): str(v).strip() for k, v in labels.items()}
        except Exception as e:
            logger.warning(f"LLM labeling failed: {e}")
            return {}

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "detect_form_fields",
            "description": "Step 1: Detect blanks in a PDF. tool.result = JSON with labels mapped to blank coords (bbox_pixels) and empty values. Saves mapping to mapping_file_path. Next: get_form_field_labels to get exact labels, then gather answers, then edit_form_mapping, then fill_form.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file relative to workspace (e.g. 'document.pdf' or 'forms/application.pdf')",
                    },
                },
                "required": ["file_path"],
            },
        },
    })
    async def detect_form_fields(self, file_path: str) -> ToolResult:
        """Detect form fields in a PDF, draw green boxes, get labels from default LLM, return blanks with id/bbox/label."""
        try:
            await self._ensure_sandbox()
            resolved = self._resolve_path(file_path)
            if not resolved.lower().endswith(".pdf"):
                return ToolResult(success=False, output={"error": "Only PDF files are supported."})
            pdf_candidates = [f"{self.workspace_path}/{resolved}"]
            if "/" not in resolved and "\\" not in resolved:
                pdf_candidates.append(f"{self.workspace_path}/uploads/{file_path.strip()}")
            pdf_bytes = None
            for full_path in pdf_candidates:
                try:
                    pdf_bytes = await self.sandbox.fs.download_file(full_path)
                    resolved = full_path[len(self.workspace_path) :].lstrip("/")
                    break
                except Exception:
                    continue
            if not pdf_bytes:
                return ToolResult(success=False, output={"error": f"Could not read PDF. Tried: {pdf_candidates}. Uploaded files are in the same directory as the PDF (e.g. 'uploads/form.pdf')."})
            if not pdf_bytes:
                return ToolResult(success=False, output={"error": "File is empty."})

            # 1) PDF -> image and detect fields (no id yet; YOLO order is not used)
            fields, image_bgr = detect_fields(pdf_bytes)
            if not fields:
                return ToolResult(
                    success=True,
                    output={
                        "file_path": file_path,
                        "blanks": [],
                        "message": "No form fields detected on the first page.",
                    },
                )

            # 2) Sort by reading order (row tolerance: top-to-bottom, left-to-right) and assign ids 0, 1, 2, ...
            fields = _sort_mapping_reading_order(fields)
            for i, f in enumerate(fields):
                f["id"] = i

            # 3) Draw green bounding boxes with id on the image
            draw_boxes_with_ids_and_type(image_bgr, fields)

            # 4) Call default LLM with image to get label per blank id
            labels_by_id = await self._get_labels_for_blanks(image_bgr, fields)

            # 5) Build final blanks only for IDs the LLM returned (real fields only)
            blanks = []
            for f in fields:
                fid = f.get("id", 0)
                if str(fid) not in labels_by_id:
                    continue
                blanks.append({
                    "id": fid,
                    "bbox": f.get("bbox"),
                    "bbox_pixels": f.get("bbox_pixels"),
                    "label": labels_by_id[str(fid)],
                    "type": f.get("type", "unknown"),
                    "confidence": f.get("confidence", 0),
                    "value": "",  # To be filled from user input or knowledge base document
                })

            # 6) Build mapping JSON (label, bbox_pixels, value) and save; already in reading order from step 2
            mapping_array = [
                {
                    "label": b.get("label", ""),
                    "bbox_pixels": b.get("bbox_pixels"),
                    "value": b.get("value", ""),
                    "type": b.get("type", "text_field"),
                }
                for b in blanks
            ]
            mapping_array = _sort_mapping_reading_order(mapping_array)
            base = resolved[:-4] if resolved.lower().endswith(".pdf") else resolved
            mapping_path = f"{base}_mapping.json"
            mapping_full = f"{self.workspace_path}/{self._resolve_path(mapping_path)}"
            payload = {
                "_instructions": "Only edit the 'value' field for each entry. Do not remove bbox_pixels. Use this file with fill_form(mapping_file_path).",
                "_dpi": DPI,
                "mapping": mapping_array,
            }
            await self.sandbox.fs.upload_file(
                json.dumps(payload, indent=2).encode("utf-8"),
                mapping_full,
            )

            # tool.result = JSON with labels mapped to blank coords, empty values
            return ToolResult(
                success=True,
                output={
                    "mapping_file_path": mapping_path,
                    "mapping": mapping_array,
                    "fields_detected": len(mapping_array),
                    "file_path": file_path,
                    "message": (
                        f"Step 1 done. {len(mapping_array)} fields detected. Mapping JSON saved to {mapping_path}. "
                        "Next: call get_form_field_labels(mapping_file_path) to get the exact field labels, get answers for those labels, then edit_form_mapping(mapping_file_path, form_data), then fill_form."
                    ),
                },
            )
        except FileNotFoundError as e:
            return ToolResult(success=False, output={"error": str(e)})
        except ValueError as e:
            return ToolResult(success=False, output={"error": str(e)})
        except Exception as e:
            logger.exception("Form field detection failed")
            return ToolResult(success=False, output={"error": str(e)})


# --- Shared: resolve mapping file path (same dir as PDF or uploads/) ---
def _mapping_path_candidates(
    workspace_path: str, mapping_file_path: str, pdf_file_path: Optional[str] = None
) -> List[str]:
    """Full paths to try for loading the mapping JSON."""
    base = clean_path(mapping_file_path.strip(), workspace_path)
    candidates = [f"{workspace_path}/{base}"]
    if "/" not in base and "\\" not in base:
        candidates.append(f"{workspace_path}/uploads/{mapping_file_path.strip()}")
    if pdf_file_path and pdf_file_path.strip():
        pdf_resolved = clean_path(pdf_file_path.strip(), workspace_path)
        pdf_dir = str(Path(pdf_resolved).parent) if Path(pdf_resolved).parent != Path(".") else ""
        pdf_stem = Path(pdf_resolved).stem
        if pdf_dir:
            candidates.append(f"{workspace_path}/{pdf_dir}/{Path(mapping_file_path.strip()).name}")
            candidates.append(f"{workspace_path}/{pdf_dir}/{pdf_stem}_mapping.json")
    return candidates


# --- Helpers for edit_form_mapping (map form_data to labels) ---
def _normalize_label(label: str) -> str:
    if not label or not isinstance(label, str):
        return ""
    s = re.sub(r"[\*:]+", " ", label).strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _flatten_form_data(obj: Any, prefix: str = "") -> Dict[str, str]:
    """Flatten nested form_data (e.g. company_info.company_name) to normalized keys -> string values."""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key_part = k.replace("_", " ").strip().lower()
            new_prefix = f"{prefix} {key_part}".strip() if prefix else key_part
            out.update(_flatten_form_data(v, new_prefix))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            new_prefix = f"{prefix} {i + 1}".strip() if prefix else str(i + 1)
            out.update(_flatten_form_data(item, new_prefix))
    else:
        if obj is not None and (not isinstance(obj, str) or obj.strip()):
            key_full = prefix.replace(".", " ").strip().lower() if prefix else ""
            if key_full:
                out[key_full] = str(obj).strip()
    return out


def _apply_form_data_to_mapping(mapping: List[Dict[str, Any]], form_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Set each entry's value by matching its label to flattened form_data. Returns new list (same structure, values filled)."""
    flat = _flatten_form_data(form_data)
    result = []
    for entry in mapping:
        entry = dict(entry)
        label = entry.get("label") or ""
        norm_label = _normalize_label(label)
        if norm_label:
            label_has_ref = "reference" in norm_label
            for flat_key, flat_value in flat.items():
                norm_flat = _normalize_label(flat_key)
                if not norm_flat:
                    continue
                if norm_label == norm_flat:
                    entry["value"] = flat_value
                    break
                if norm_flat.endswith(norm_label) or norm_label in norm_flat:
                    key_has_ref = "reference" in norm_flat
                    if not label_has_ref and key_has_ref:
                        continue
                    if "value" not in entry or not entry.get("value"):
                        entry["value"] = flat_value
                    break
        result.append(entry)
    return result


# --- Form fill (same module: use mapping JSON produced by detect_form_fields) ---
MAPPING_FORMAT = (
    "Array of objects: each { \"label\": \"<form field label>\", "
    "\"bbox_pixels\": { \"x1\", \"y1\", \"x2\", \"y2\" }, \"value\": \"<text to write>\" }. "
    "Optional \"type\": \"text_field\" | \"checkbox\" | \"signature\"."
)


def _entry_has_valid_bbox(entry: Dict[str, Any]) -> bool:
    """Entry must have bbox_pixels with x1, y1, x2, y2 so fill_form knows where to put the value."""
    bp = entry.get("bbox_pixels")
    if not bp or not isinstance(bp, dict):
        return False
    return all(k in bp for k in ("x1", "y1", "x2", "y2"))


def _sort_mapping_reading_order(
    mapping: List[Dict[str, Any]], row_tolerance: int = ROW_TOLERANCE
) -> List[Dict[str, Any]]:
    """Sort mapping in reading order: top-to-bottom, then left-to-right.
    Uses row_tolerance (pixels) so fields within the same Y-range are treated as one line and sorted by x1.
    For 300 DPI, 30–40px is typically a good line height.
    """
    def key(entry: Dict[str, Any]) -> Tuple[float, float]:
        bp = entry.get("bbox_pixels") or {}
        if not _entry_has_valid_bbox(entry):
            return (float("inf"), float("inf"))
        y1 = float(bp.get("y1", 0))
        x1 = float(bp.get("x1", 0))
        y_row = round(y1 / row_tolerance) * row_tolerance
        return (y_row, x1)
    return sorted(mapping, key=key)


def _pixels_to_pdf_points(pixels: float, dpi: int = DPI) -> float:
    """Convert pixel coordinate to PDF points: points = (pixels / dpi) * 72."""
    return (pixels / dpi) * 72.0


def fill_pdf_with_mapping(pdf_bytes: bytes, mapping: List[Dict[str, Any]], dpi: int = DPI) -> bytes:
    """Fill a PDF using mapping entries (each with bbox_pixels, value [, type]). Returns filled PDF as bytes.

    Coordinate system: PyMuPDF uses top-left origin with y increasing downward (same as the detection
    image from pdf2image). So we convert bbox_pixels to points with no Y-flip: point = pixel * 72 / dpi.
    """
    mapping = _sort_mapping_reading_order(mapping)
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    if len(doc) == 0:
        raise ValueError("PDF has no pages")
    page = doc[0]
    page_rect = page.rect
    for entry in mapping:
        value = entry.get("value")
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        if not _entry_has_valid_bbox(entry):
            continue
        field_type = (entry.get("type") or "text_field").lower()
        bbox_pixels = entry.get("bbox_pixels") or {}
        x1 = float(bbox_pixels.get("x1", 0))
        y1 = float(bbox_pixels.get("y1", 0))
        x2 = float(bbox_pixels.get("x2", 0))
        y2 = float(bbox_pixels.get("y2", 0))
        x1_pt = _pixels_to_pdf_points(x1, dpi)
        y1_pt = _pixels_to_pdf_points(y1, dpi)
        x2_pt = _pixels_to_pdf_points(x2, dpi)
        y2_pt = _pixels_to_pdf_points(y2, dpi)
        # Clamp to page (in case of rounding or different page size)
        x1_pt = max(0, min(x1_pt, page_rect.width))
        x2_pt = max(0, min(x2_pt, page_rect.width))
        y1_pt = max(0, min(y1_pt, page_rect.height))
        y2_pt = max(0, min(y2_pt, page_rect.height))
        if x1_pt >= x2_pt or y1_pt >= y2_pt:
            continue
        rect = pymupdf.Rect(x1_pt, y1_pt, x2_pt, y2_pt)
        center_x = (x1_pt + x2_pt) / 2
        center_y = (y1_pt + y2_pt) / 2
        box_height_pt = y2_pt - y1_pt
        fontsize = max(6, min(10, int(box_height_pt * 0.55)))
        try:
            if "checkbox" in field_type:
                is_checked = (
                    value if isinstance(value, bool)
                    else str(value).strip().lower() in ("true", "1", "yes", "checked", "x", "✓")
                )
                if is_checked:
                    page.insert_text((center_x, center_y), "✓", fontsize=fontsize, color=(0, 0, 0))
            elif "signature" in field_type:
                page.insert_textbox(rect, str(value)[:80], fontsize=fontsize, color=(0, 0, 0), align=0)
            else:
                page.insert_textbox(
                    rect,
                    str(value).strip(),
                    fontsize=fontsize,
                    color=(0, 0, 0),
                    align=0,
                )
        except Exception as e:
            logger.warning(f"Form fill: skip entry label={entry.get('label')}: {e}")
    out_bytes = doc.tobytes()
    doc.close()
    return out_bytes


@tool_metadata(
    display_name="Read Form Mapping",
    description="Parse the mapping JSON to get the exact field labels. tool.result = extracted labels with empty values. Use these labels to get answers from user or KB, then call edit_form_mapping.",
    icon="FileSearch",
    color="bg-sky-100 dark:bg-sky-800/50",
    weight=49,
    visible=True,
)
class SandboxFormReadMappingTool(SandboxToolsBase):
    """Read/parse the mapping JSON and return the actual field labels (with empty values) so the LLM can gather answers for those exact labels before editing."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_form_field_labels",
            "description": "Read the mapping JSON and return the exact field labels with empty values. Call this before edit_form_mapping so you know which labels to get answers for (from user, KB, or context). tool.result = extracted labels with empty values.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mapping_file_path": {"type": "string", "description": "Path to the mapping JSON from detect_form_fields (e.g. 'uploads/form_mapping.json')."},
                    "file_path": {"type": "string", "description": "Optional. Path to the PDF from step 1. If mapping file is not found, it will be looked up in the same directory as this file."},
                },
                "required": ["mapping_file_path"],
            },
        },
    })
    async def get_form_field_labels(
        self,
        mapping_file_path: str,
        file_path: Optional[str] = None,
    ) -> ToolResult:
        """Load mapping JSON and return only labels with empty values. These are the fields that must be answered before calling edit_form_mapping."""
        try:
            await self._ensure_sandbox()
            if not mapping_file_path or not mapping_file_path.strip():
                return ToolResult(success=False, output={"error": "mapping_file_path is required."})
            candidates = _mapping_path_candidates(self.workspace_path, mapping_file_path, file_path)
            data = None
            rel_path = None
            last_err = None
            for full_path in candidates:
                try:
                    raw = await self.sandbox.fs.download_file(full_path)
                    data = json.loads(raw.decode("utf-8"))
                    rel_path = full_path[len(self.workspace_path) :].lstrip("/")
                    break
                except Exception as e:
                    last_err = e
                    continue
            if not data or not rel_path:
                return ToolResult(
                    success=False,
                    output={
                        "error": f"Could not load mapping file: {last_err}. Tried: {candidates}. Use the exact mapping_file_path from detect_form_fields."
                    },
                )
            if not isinstance(data, dict) or "mapping" not in data:
                return ToolResult(success=False, output={"error": "File must be a mapping JSON with a 'mapping' array (from detect_form_fields)."})
            mapping_list = data.get("mapping") or []
            if not isinstance(mapping_list, list):
                return ToolResult(success=False, output={"error": "mapping must be an array."})
            mapping_list = _sort_mapping_reading_order(mapping_list)
            fields = [{"label": entry.get("label", ""), "value": entry.get("value") or ""} for entry in mapping_list]
            return ToolResult(
                success=True,
                output={
                    "mapping_file_path": rel_path,
                    "fields": fields,
                    "message": "Get answers for these exact labels (from user or KB), then call edit_form_mapping(mapping_file_path, form_data) with the answers.",
                },
            )
        except Exception as e:
            logger.exception("get_form_field_labels failed")
            return ToolResult(success=False, output={"error": str(e)})


@tool_metadata(
    display_name="Edit Form Mapping",
    description="Map answers to the mapping JSON. Call after get_form_field_labels and gathering answers for those labels. tool.result = same JSON with labels, bbox, and filled values.",
    icon="FileEdit",
    color="bg-amber-100 dark:bg-amber-800/50",
    weight=50,
    visible=True,
)
class SandboxFormEditMappingTool(SandboxToolsBase):
    """Edit the mapping JSON: set values by matching form_data to the labels returned by get_form_field_labels."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    def _resolve_path_fill(self, file_path: str) -> str:
        return clean_path(file_path, self.workspace_path)

    def _candidates_for_mapping_path(
        self, mapping_file_path: str, pdf_file_path: Optional[str] = None
    ) -> List[str]:
        return _mapping_path_candidates(self.workspace_path, mapping_file_path, pdf_file_path)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "edit_form_mapping",
            "description": "Map answers to the mapping JSON. Call after get_form_field_labels and after gathering answers for those exact labels. Keys in form_data are matched to labels; use the labels returned by get_form_field_labels. tool.result = same JSON with labels, bbox, and filled values.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mapping_file_path": {"type": "string", "description": "Path to the mapping JSON (from detect_form_fields or get_form_field_labels, e.g. 'uploads/form_mapping.json')."},
                    "form_data": {"type": "object", "description": "Answers keyed by the exact labels from get_form_field_labels (e.g. {\"Company Name\": \"Acme\", \"Address\": \"123 Main St\"}). Keys are matched to field labels."},
                    "file_path": {"type": "string", "description": "Optional. Path to the PDF from step 1 (e.g. 'uploads/form.pdf'). If mapping file is not found, it will be looked up in the same directory as this file."},
                },
                "required": ["mapping_file_path", "form_data"],
            },
        },
    })
    async def edit_form_mapping(
        self,
        mapping_file_path: str,
        form_data: Dict[str, Any],
        file_path: Optional[str] = None,
    ) -> ToolResult:
        """Load mapping JSON, apply form_data to set values by label, save back. tool.result = JSON with labels, bbox, filled values."""
        try:
            await self._ensure_sandbox()
            if not mapping_file_path or not mapping_file_path.strip():
                return ToolResult(success=False, output={"error": "mapping_file_path is required."})
            candidates = self._candidates_for_mapping_path(mapping_file_path, file_path)
            data = None
            full_path_used = None
            last_err = None
            for full_path in candidates:
                try:
                    raw = await self.sandbox.fs.download_file(full_path)
                    data = json.loads(raw.decode("utf-8"))
                    full_path_used = full_path
                    break
                except Exception as e:
                    last_err = e
                    continue
            if not data or full_path_used is None:
                return ToolResult(
                    success=False,
                    output={
                        "error": f"Could not load mapping file: {last_err}. Tried: {candidates}. Use the exact mapping_file_path from detect_form_fields (same directory as the PDF, e.g. 'uploads/form_mapping.json')."
                    },
                )
            if not isinstance(data, dict) or "mapping" not in data:
                return ToolResult(success=False, output={"error": "File must be a mapping JSON with a 'mapping' array (from detect_form_fields)."})
            mapping_list = data.get("mapping") or []
            if not isinstance(mapping_list, list):
                return ToolResult(success=False, output={"error": "mapping must be an array."})
            mapping_list = _sort_mapping_reading_order(mapping_list)
            updated = _apply_form_data_to_mapping(mapping_list, form_data or {})
            updated = _sort_mapping_reading_order(updated)
            data["mapping"] = updated
            out_bytes = json.dumps(data, indent=2).encode("utf-8")
            await self.sandbox.fs.upload_file(out_bytes, full_path_used)
            # Return workspace-relative path for fill_form (strip workspace prefix)
            rel_path = full_path_used[len(self.workspace_path) :].lstrip("/")
            return ToolResult(
                success=True,
                output={
                    "mapping_file_path": rel_path,
                    "mapping": updated,
                    "message": "Mapping updated with filled values. Next: call fill_form(file_path=..., mapping_file_path=...) using this mapping_file_path.",
                },
            )
        except Exception as e:
            logger.exception("edit_form_mapping failed")
            return ToolResult(success=False, output={"error": str(e)})


@tool_metadata(
    display_name="Form Fill",
    description="Fill form from JSON (after edit_form_mapping). tool.result = output PDF path.",
    icon="FileEdit",
    color="bg-emerald-100 dark:bg-emerald-800/50",
    weight=51,
    visible=True,
)
class SandboxFormFillTool(SandboxToolsBase):
    """Fill form using the mapping JSON produced by detect_form_fields (same module)."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    def _resolve_path_fill(self, file_path: str) -> str:
        return clean_path(file_path, self.workspace_path)

    def _mapping_path_candidates(self, mapping_file_path: str, pdf_file_path: Optional[str] = None) -> List[str]:
        """Full paths to try for loading mapping (same directory as PDF or uploads/)."""
        base = self._resolve_path_fill(mapping_file_path.strip())
        candidates = [f"{self.workspace_path}/{base}"]
        if "/" not in base and "\\" not in base:
            candidates.append(f"{self.workspace_path}/uploads/{mapping_file_path.strip()}")
        if pdf_file_path and pdf_file_path.strip():
            pdf_resolved = self._resolve_path_fill(pdf_file_path.strip())
            pdf_dir = str(Path(pdf_resolved).parent) if Path(pdf_resolved).parent != Path(".") else ""
            pdf_stem = Path(pdf_resolved).stem
            if pdf_dir:
                candidates.append(f"{self.workspace_path}/{pdf_dir}/{Path(mapping_file_path.strip()).name}")
                candidates.append(f"{self.workspace_path}/{pdf_dir}/{pdf_stem}_mapping.json")
        return candidates

    async def _load_mapping(
        self, mapping: Union[str, List[Dict[str, Any]]], pdf_file_path: Optional[str] = None
    ) -> Tuple[Optional[List[Dict[str, Any]]], Optional[int]]:
        """Load mapping list and optional _dpi from file. Returns (mapping_list, dpi_or_none)."""
        if isinstance(mapping, list) and len(mapping) > 0:
            return (mapping, None)
        if not isinstance(mapping, str) or not mapping.strip():
            return (None, None)
        s = mapping.strip()
        if s.endswith(".json") or "/" in s or "\\" in s:
            candidates = self._mapping_path_candidates(s, pdf_file_path)
            for full_path in candidates:
                try:
                    raw = await self.sandbox.fs.download_file(full_path)
                    data = json.loads(raw.decode("utf-8"))
                    dpi = None
                    if isinstance(data, dict) and "mapping" in data:
                        dpi = data.get("_dpi") if isinstance(data.get("_dpi"), (int, float)) else None
                        if dpi is not None:
                            dpi = int(dpi)
                        return (data["mapping"], dpi)
                    if isinstance(data, list):
                        return (data, None)
                    if isinstance(data, dict):
                        lst = [{"label": k, "bbox_pixels": v.get("bbox_pixels"), "value": v.get("value"), "type": v.get("type")} for k, v in data.items() if isinstance(v, dict) and v.get("bbox_pixels")]
                        return (lst, None) if lst else (None, None)
                    return (None, None)
                except Exception:
                    continue
            return (None, None)
        try:
            data = json.loads(s)
            return (data if isinstance(data, list) else None, None)
        except json.JSONDecodeError:
            return (None, None)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "fill_form",
            "description": "Fill form from the latest mapping JSON. Call after edit_form_mapping. Reads mapping and writes values to their coordinates. tool.result = output PDF path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string", "description": "Path to the original PDF in the workspace (e.g. 'form.pdf')"},
                    "mapping_file_path": {"type": "string", "description": "Path to the mapping JSON in the workspace (returned by detect_form_fields as mapping_file_path)."},
                    "mapping": {"type": "array", "description": "Mapping array inline; use this OR mapping_file_path.", "items": {"type": "object", "properties": {"label": {"type": "string"}, "bbox_pixels": {"type": "object"}, "value": {"type": "string"}, "type": {"type": "string"}}}},
                    "output_path": {"type": "string", "description": "Path for the filled PDF (default: overwrites the original file_path)"},
                },
                "required": ["file_path"],
            },
        },
    })
    async def fill_form(
        self,
        file_path: str,
        mapping_file_path: Optional[str] = None,
        mapping: Optional[List[Dict[str, Any]]] = None,
        output_path: Optional[str] = None,
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            resolved = self._resolve_path_fill(file_path)
            if not resolved.lower().endswith(".pdf"):
                return ToolResult(success=False, output={"error": "Only PDF files are supported."})
            pdf_candidates = [f"{self.workspace_path}/{resolved}"]
            if "/" not in resolved and "\\" not in resolved:
                pdf_candidates.append(f"{self.workspace_path}/uploads/{file_path.strip()}")
            pdf_bytes = None
            for full_path in pdf_candidates:
                try:
                    pdf_bytes = await self.sandbox.fs.download_file(full_path)
                    resolved = full_path[len(self.workspace_path) :].lstrip("/")
                    break
                except Exception:
                    continue
            if not pdf_bytes:
                return ToolResult(success=False, output={"error": f"Could not read PDF. Tried: {pdf_candidates}. Use the same file_path as in step 1 (e.g. 'uploads/form.pdf')."})
            if not pdf_bytes:
                return ToolResult(success=False, output={"error": "File is empty."})
            mapping_list = None
            mapping_dpi = None
            if mapping and isinstance(mapping, list) and len(mapping) > 0:
                mapping_list = mapping
            elif mapping_file_path:
                mapping_list, mapping_dpi = await self._load_mapping(mapping_file_path, pdf_file_path=file_path)
            if not mapping_list:
                return ToolResult(success=False, output={"error": "Provide mapping_file_path (from detect_form_fields) or mapping array. " + MAPPING_FORMAT})
            missing_bbox = [e.get("label", "?") for e in mapping_list if not _entry_has_valid_bbox(e)]
            if missing_bbox:
                return ToolResult(
                    success=False,
                    output={
                        "error": (
                            "Every mapping entry must have bbox_pixels (x1, y1, x2, y2) so values can be placed on the PDF. "
                            f"Entries missing bbox_pixels: {missing_bbox[:10]}{'...' if len(missing_bbox) > 10 else ''}. "
                            "Use the JSON file saved by detect_form_fields (it has label, bbox_pixels, and value). Only edit the 'value' field for each entry; do not create a new JSON with only label and value."
                        ),
                    },
                )
            fill_dpi = int(mapping_dpi) if mapping_dpi else DPI
            filled_bytes = fill_pdf_with_mapping(pdf_bytes, mapping_list, dpi=fill_dpi)
            if output_path is None or not str(output_path).strip():
                output_path = resolved  # overwrite the original PDF
            else:
                output_path = self._resolve_path_fill(output_path)
                if not output_path.lower().endswith(".pdf"):
                    output_path = f"{output_path}.pdf"
            out_full = f"{self.workspace_path}/{output_path}"
            try:
                await self.sandbox.fs.delete_file(out_full)
            except Exception:
                pass  # File may not exist; proceed to create
            await self.sandbox.fs.upload_file(filled_bytes, out_full)
            return ToolResult(success=True, output={"output_pdf_path": output_path, "message": "Form filled and saved.", "file_path": file_path, "filled_count": sum(1 for m in mapping_list if m.get("value"))})
        except ValueError as e:
            return ToolResult(success=False, output={"error": str(e)})
        except Exception as e:
            logger.exception("Form fill failed")
            return ToolResult(success=False, output={"error": str(e)})
