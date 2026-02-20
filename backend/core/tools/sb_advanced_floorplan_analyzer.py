"""Advanced Floorplan Analyzer: generic tiled image analysis with robust coords and staged deduplication."""

import base64
import json
import math
from io import BytesIO
from typing import Any, Dict, List, Optional, Set, Tuple

from PIL import Image

from core.agentpress.thread_manager import ThreadManager
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.services.llm import make_llm_api_call

# Tiling
MAX_TILE_COUNT = 100
VISION_MODEL = "bedrock/us.anthropic.claude-sonnet-4-6"
OVERLAP_FRACTION = 0.10

# Deduplication
IOU_MERGE_THRESHOLD = 0.3
MAX_MERGE_GAP_PX = 50.0
MAX_MERGE_GAP_PX_ADJACENT = 200.0
MAX_MERGED_AREA_RATIO = 2.5
MAX_MERGED_AREA_RATIO_ADJACENT = 10.0  # allow vertical separation (e.g. same col, adjacent row)

DEFAULT_TYPE = "unknown"


def _extract_bbox_from_detection(raw: Dict[str, Any]) -> Tuple[Optional[Dict[str, float]], Dict[str, Any]]:
    """Parse bbox from detection (object, [x_min,y_min,x_max,y_max], or flat keys). Returns (bbox dict or None, copy of raw)."""
    bbox = raw.get("bbox")
    out: Dict[str, float] = {}
    if isinstance(bbox, dict):
        try:
            out = {
                "x_min": float(bbox.get("x_min")),
                "y_min": float(bbox.get("y_min")),
                "x_max": float(bbox.get("x_max")),
                "y_max": float(bbox.get("y_max")),
            }
        except (TypeError, ValueError, KeyError):
            return None, dict(raw)
    elif isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
        try:
            out = {"x_min": float(bbox[0]), "y_min": float(bbox[1]), "x_max": float(bbox[2]), "y_max": float(bbox[3])}
        except (TypeError, ValueError, IndexError):
            return None, dict(raw)
    else:
        try:
            x_min = raw.get("x_min")
            y_min = raw.get("y_min")
            x_max = raw.get("x_max")
            y_max = raw.get("y_max")
            if all(v is not None for v in (x_min, y_min, x_max, y_max)):
                out = {"x_min": float(x_min), "y_min": float(y_min), "x_max": float(x_max), "y_max": float(y_max)}
        except (TypeError, ValueError):
            return None, dict(raw)
    if not out:
        return None, dict(raw)
    if out["x_min"] > out["x_max"]:
        out["x_min"], out["x_max"] = out["x_max"], out["x_min"]
    if out["y_min"] > out["y_max"]:
        out["y_min"], out["y_max"] = out["y_max"], out["y_min"]
    return out, dict(raw)


def _canonical_bbox_global(
    x_min: float, y_min: float, x_max: float, y_max: float,
    img_width: int, img_height: int,
) -> Dict[str, int]:
    """Return bbox in global image coords as integers, clamped to image bounds."""
    x_min = max(0, min(img_width, int(round(x_min))))
    y_min = max(0, min(img_height, int(round(y_min))))
    x_max = max(0, min(img_width, int(round(x_max))))
    y_max = max(0, min(img_height, int(round(y_max))))
    if x_min > x_max:
        x_min, x_max = x_max, x_min
    if y_min > y_max:
        y_min, y_max = y_max, y_min
    return {"x_min": x_min, "y_min": y_min, "x_max": x_max, "y_max": y_max}


def _bbox_vals(b: Dict[str, Any]) -> Tuple[float, float, float, float]:
    x_min, y_min = b.get("x_min"), b.get("y_min")
    x_max, y_max = b.get("x_max"), b.get("y_max")
    if None in (x_min, y_min, x_max, y_max):
        return (0.0, 0.0, 0.0, 0.0)
    x_min, x_max = min(x_min, x_max), max(x_min, x_max)
    y_min, y_max = min(y_min, y_max), max(y_min, y_max)
    return (float(x_min), float(y_min), float(x_max), float(y_max))


def _bbox_area(b: Dict[str, Any]) -> float:
    x_min, y_min, x_max, y_max = _bbox_vals(b)
    return max(0.0, (x_max - x_min) * (y_max - y_min))


def _iou(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    ax0, ay0, ax1, ay1 = _bbox_vals(a)
    bx0, by0, bx1, by1 = _bbox_vals(b)
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    union = _bbox_area(a) + _bbox_area(b) - inter
    return inter / union if union > 0 else 0.0


def _gap_px(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    ax0, ay0, ax1, ay1 = _bbox_vals(a)
    bx0, by0, bx1, by1 = _bbox_vals(b)
    gx = max(0, max(ax0 - bx1, bx0 - ax1))
    gy = max(0, max(ay0 - by1, by0 - ay1))
    return math.sqrt(gx * gx + gy * gy)


def _merge_bbox(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, float]:
    ax0, ay0, ax1, ay1 = _bbox_vals(a)
    bx0, by0, bx1, by1 = _bbox_vals(b)
    return {"x_min": min(ax0, bx0), "y_min": min(ay0, by0), "x_max": max(ax1, bx1), "y_max": max(ay1, by1)}


def _tiles_adjacent(r1: int, c1: int, r2: int, c2: int) -> bool:
    return (r1, c1) != (r2, c2) and abs(r1 - r2) <= 1 and abs(c1 - c2) <= 1


def _deduplicate_detections(
    detections: List[Dict[str, Any]],
    iou_threshold: float,
) -> List[Dict[str, Any]]:
    """Merge same-type detections: Stage 1 same/overlap tile (IoU or small gap), Stage 2 adjacent (gap <= 200px)."""
    if not detections:
        return []

    normalized: List[Dict[str, Any]] = []
    for d in detections:
        if not isinstance(d, dict):
            continue
        bbox = d.get("bbox_global") or d.get("bbox")
        if not bbox or not isinstance(bbox, dict):
            continue
        label = str(d.get("type") or d.get("label") or DEFAULT_TYPE).strip().lower()
        tr = d.get("tile_row") if d.get("tile_row") is not None else -1
        tc = d.get("tile_col") if d.get("tile_col") is not None else -1
        bounds = d.get("tile_bounds_global") or d.get("tile_bounds")
        bounds = bounds if isinstance(bounds, dict) else {}
        normalized.append({
            "bbox_global": dict(bbox),
            "type": label,
            "base_type": _base_type(label),
            "tile_row": tr,
            "tile_col": tc,
            "tile_bounds_global": bounds,
            "raw": d,
        })

    normalized.sort(key=lambda x: -_bbox_area(x["bbox_global"]))
    merged: List[Dict[str, Any]] = []

    for det in normalized:
        bbox = det["bbox_global"]
        typ = det["type"]
        base = det["base_type"]
        tr, tc = det["tile_row"], det["tile_col"]
        bounds = det.get("tile_bounds_global") or {}
        found = False
        for m in merged:
            if (m.get("base_type") or _base_type(m.get("type") or "")) != base:
                continue
            m_bbox = m.get("bbox_global") or {}
            m_tr, m_tc = m.get("tile_row", -1), m.get("tile_col", -1)
            iou = _iou(bbox, m_bbox)
            gap = _gap_px(bbox, m_bbox)
            same_tile = (tr == m_tr and tc == m_tc)
            adjacent = _tiles_adjacent(tr, tc, m_tr, m_tc)

            def try_merge(max_ratio: float) -> bool:
                candidate = _merge_bbox(m_bbox, bbox)
                area_c = _bbox_area(candidate)
                if area_c <= max_ratio * max(_bbox_area(m_bbox), _bbox_area(bbox)):
                    m["bbox_global"] = candidate
                    return True
                return False

            if iou > 0 and iou >= iou_threshold and gap <= MAX_MERGE_GAP_PX and try_merge(MAX_MERGED_AREA_RATIO):
                found = True
                break
            if same_tile and gap <= MAX_MERGE_GAP_PX and try_merge(MAX_MERGED_AREA_RATIO):
                found = True
                break
            if adjacent and gap <= MAX_MERGE_GAP_PX_ADJACENT and try_merge(MAX_MERGED_AREA_RATIO_ADJACENT):
                found = True
                break

        if not found:
            raw = det.get("raw", {})
            skip = {"bbox_global", "bbox", "x_min", "y_min", "x_max", "y_max"}
            merged.append({
                "type": typ,
                "base_type": base,
                "bbox_global": dict(bbox),
                "tile_row": tr,
                "tile_col": tc,
                "tile_bounds_global": bounds,
                **{k: v for k, v in raw.items() if k not in skip},
            })

    return merged


def run_deduplication(
    tiles: List[Dict[str, Any]],
    img_width: int,
    img_height: int,
) -> List[Dict[str, Any]]:
    """Flatten tile detections to global coords, run staged merge, return merged list."""
    all_detections: List[Dict[str, Any]] = []
    for tile in tiles:
        if not isinstance(tile, dict):
            continue
        row = tile.get("row")
        col = tile.get("col")
        bounds = tile.get("global_bbox_px")
        if not isinstance(bounds, dict):
            continue
        x0 = bounds.get("x0", 0)
        y0 = bounds.get("y0", 0)
        x1 = bounds.get("x1", 0)
        y1 = bounds.get("y1", 0)
        analysis = tile.get("analysis")
        if analysis is None:
            continue
        if isinstance(analysis, list):
            raw_detections = analysis
        elif isinstance(analysis, dict):
            raw_detections = analysis.get("detections")
        else:
            continue
        if not isinstance(raw_detections, list):
            continue
        for det in raw_detections:
            if not isinstance(det, dict):
                continue
            bbox_dict, det_copy = _extract_bbox_from_detection(det)
            if bbox_dict is None:
                continue
            x_min_g = x0 + bbox_dict["x_min"]
            y_min_g = y0 + bbox_dict["y_min"]
            x_max_g = x0 + bbox_dict["x_max"]
            y_max_g = y0 + bbox_dict["y_max"]
            bbox_global = _canonical_bbox_global(x_min_g, y_min_g, x_max_g, y_max_g, img_width, img_height)
            det_copy["bbox_global"] = bbox_global
            det_copy["tile_row"] = row
            det_copy["tile_col"] = col
            det_copy["tile_bounds_global"] = dict(bounds)
            det_copy.setdefault("type", str(det_copy.get("label", DEFAULT_TYPE)))
            all_detections.append(det_copy)
    return _deduplicate_detections(all_detections, IOU_MERGE_THRESHOLD)


def _normalize_detection_types(detection_types: Any) -> List[str]:
    """Validate and normalize detection_types: list of non-empty strings, stripped and deduped. Accepts list or single string."""
    if isinstance(detection_types, str):
        detection_types = [detection_types]
    if not isinstance(detection_types, list):
        return []
    out: List[str] = []
    seen: Set[str] = set()
    for t in detection_types:
        s = str(t).strip() if t is not None else ""
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _build_vision_prompts(
    detection_types: List[str],
    task_instruction: str,
    tile_id: int,
    row: int,
    col: int,
    tile_width_px: int,
    tile_height_px: int,
    global_bbox_px: Dict[str, int],
) -> Tuple[str, str]:
    """Build system and user prompts from structured spec (request + output_format + tile_context)."""
    types_str = ", ".join(detection_types)
    system_prompt = (
        "You are an image detection assistant. Detect only the following types in this tile image: "
        f"{types_str}. Return valid JSON only (no markdown) with a single key \"detections\": an array of objects. "
        "Each object must have \"label\" (exactly one of the types above) and \"bbox\" as [x_min, y_min, x_max, y_max] "
        "in tile pixels, top-left origin (0,0)."
    )
    payload = {
        "request": {"detection_types": detection_types, "task_instruction": task_instruction.strip() or None},
        "output_format": {
            "detections": [{"label": "<one of detection_types>", "bbox": ["x_min", "y_min", "x_max", "y_max"]}],
            "coordinate_system": "tile pixels, top-left origin (0,0)",
        },
        "tile_context": {
            "tile_id": tile_id,
            "row": row,
            "col": col,
            "tile_width_px": tile_width_px,
            "tile_height_px": tile_height_px,
            "global_bbox_px": dict(global_bbox_px),
        },
    }
    user_lines = [f"Input (JSON):\n{json.dumps(payload, indent=2)}"]
    if task_instruction and task_instruction.strip():
        user_lines.append(f"\nAdditional guidance: {task_instruction.strip()}")
    user_prompt = "\n".join(user_lines)
    return system_prompt, user_prompt


def _parse_llm_content(response: Any) -> str:
    """Extract text content from LLM response (object with .choices or dict)."""
    if not response:
        return ""
    if isinstance(response, str):
        return response.strip()
    if getattr(response, "choices", None):
        content = getattr(response.choices[0].message, "content", None)
        return _parse_message_content(content) if content else ""
    if isinstance(response, dict):
        choices = response.get("choices") or []
        if choices:
            content = (choices[0].get("message") or {}).get("content")
            return _parse_message_content(content) if content else ""
    return ""


def _parse_message_content(content: Any) -> str:
    """Normalize message content to a single string."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            str(item.get("text", ""))
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
        return "\n".join(parts).strip()
    return str(content) if content is not None else ""


def _base_type(label: str) -> str:
    """Normalize label to base form for grouping. E.g. 'B20 breaker (20A)' -> 'b20'."""
    s = str(label or DEFAULT_TYPE).strip().lower()
    if not s:
        return DEFAULT_TYPE
    first = (s.split()[0] if s.split() else s)
    base = []
    for c in first:
        if c.isalnum() or c == ",":
            base.append(c)
        else:
            break
    return "".join(base) if base else first


@tool_metadata(
    display_name="Advanced Floorplan Analyzer",
    description="Analyze an image by dividing it into tiles (one LLM call per tile). Only use when the user explicitly asks to divide or split the image into tiles; do not use for general image analysis.",
    icon="ScanSearch",
    color="bg-pink-100 dark:bg-pink-800/50",
    weight=41,
    visible=True,
)
class SandboxAdvancedFloorplanAnalyzerTool(SandboxToolsBase):
    """Tiled image analysis: one LLM call per tile, 10% overlap, staged deduplication."""

    def __init__(self, project_id: str, thread_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.thread_id = thread_id
        self.thread_manager = thread_manager

    # ---- JSON / grid / parsing ----
    @staticmethod
    def _extract_json(text: str) -> Any:
        content = (text or "").strip()
        if not content:
            raise ValueError("Empty response")
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            if end != -1:
                return json.loads(content[start:end].strip())
        if "```" in content:
            start = content.find("```") + 3
            end = content.find("```", start)
            if end != -1:
                block = content[start:end].strip()
                if block.lower().startswith("json"):
                    block = block[4:].strip()
                return json.loads(block)
        for left, right in [("{", "}"), ("[", "]")]:
            i, j = content.find(left), content.rfind(right)
            if i != -1 and j != -1 and j > i:
                return json.loads(content[i : j + 1])
        raise ValueError("Could not parse JSON")

    @staticmethod
    def _compute_grid(width: int, height: int, tile_count: int) -> Tuple[int, int, int, int]:
        best_wide, best_high = tile_count, 1
        best_diff = float("inf")
        for th in range(1, tile_count + 1):
            if tile_count % th != 0:
                continue
            tw = tile_count // th
            diff = abs((tw / max(th, 1)) - (width / max(height, 1)))
            if diff < best_diff:
                best_diff = diff
                best_wide, best_high = tw, th
        tile_w = math.ceil(width / best_wide)
        tile_h = math.ceil(height / best_high)
        return best_wide, best_high, tile_w, tile_h

    @openapi_schema(
        {
            "type": "function",
            "function": {
                "name": "analyze_floorplan_tiles",
                "description": "Only call when the user explicitly asks to divide or split the image into tiles (e.g. 'analyze by tiles', 'split into tiles'). Do not use for general image analysis. Splits the image into tiles, one LLM call per tile, 10% overlap, merge duplicates. Pass detection_types (e.g. [\"B0\", \"B20\"]); infer from user request. Optional task_instruction.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "image_path": {"type": "string", "description": "Relative path to image in workspace (e.g. uploads/drawing.png)."},
                        "detection_types": {"type": "array", "items": {"type": "string"}, "description": "List of component types to detect (e.g. [\"B0\", \"B20\"]). Inferred from user request. Required."},
                        "task_instruction": {"type": "string", "description": "Optional. Short extra guidance (e.g. ignore text annotations)."},
                        "tile_count": {"type": "integer", "description": "Total number of tiles (default 2).", "default": 2, "minimum": 1, "maximum": MAX_TILE_COUNT},
                        "tiles_wide": {"type": "integer", "description": "Optional. Force number of columns (use with tiles_high)."},
                        "tiles_high": {"type": "integer", "description": "Optional. Force number of rows (use with tiles_wide)."},
                    },
                    "required": ["image_path", "detection_types"],
                },
            },
        }
    )
    async def analyze_floorplan_tiles(
        self,
        image_path: str,
        detection_types: Any,
        task_instruction: str = "",
        tile_count: int = 2,
        tiles_wide: Optional[int] = None,
        tiles_high: Optional[int] = None,
    ) -> ToolResult:
        try:
            detection_types = _normalize_detection_types(detection_types)
            if not detection_types:
                return self.fail_response("detection_types must be a non-empty list of types to detect (e.g. [\"B0\", \"B20\"]). Infer from user request.")
            try:
                tile_count = int(tile_count)
            except (TypeError, ValueError):
                return self.fail_response("tile_count must be a positive integer.")
            if tile_count < 1 or tile_count > MAX_TILE_COUNT:
                return self.fail_response(f"tile_count must be between 1 and {MAX_TILE_COUNT}.")

            await self._ensure_sandbox()
            cleaned_path = self.clean_path(image_path)
            full_path = f"{self.workspace_path}/{cleaned_path}"

            try:
                fi = await self.sandbox.fs.get_file_info(full_path)
                if fi.is_dir:
                    return self.fail_response(f"Path '{cleaned_path}' is a directory.")
            except Exception:
                return self.fail_response(f"Image not found: '{cleaned_path}'.")

            try:
                image_bytes = await self.sandbox.fs.download_file(full_path)
            except Exception:
                return self.fail_response(f"Cannot read file: '{cleaned_path}'.")

            try:
                image = Image.open(BytesIO(image_bytes)).convert("RGB")
            except Exception as e:
                return self.fail_response(f"Failed to open image: {e}")

            width, height = image.size
            use_explicit_grid = False
            if tiles_wide is not None and tiles_high is not None:
                try:
                    tw, th = int(tiles_wide), int(tiles_high)
                    if tw >= 1 and th >= 1:
                        use_explicit_grid = True
                        tiles_wide, tiles_high = tw, th
                except (TypeError, ValueError):
                    pass
            if use_explicit_grid:
                total_tiles = tiles_wide * tiles_high
                if total_tiles > MAX_TILE_COUNT:
                    return self.fail_response(
                        f"Grid {tiles_wide}×{tiles_high} = {total_tiles} tiles exceeds maximum {MAX_TILE_COUNT}."
                    )
                tile_width = math.ceil(width / tiles_wide)
                tile_height = math.ceil(height / tiles_high)
                tile_count_requested = total_tiles
            else:
                tiles_wide, tiles_high, tile_width, tile_height = self._compute_grid(width, height, tile_count)
                total_tiles = tiles_wide * tiles_high
                tile_count_requested = tile_count

            overlap_half_x = max(1, int(tile_width * (OVERLAP_FRACTION / 2)))
            overlap_half_y = max(1, int(tile_height * (OVERLAP_FRACTION / 2)))

            tiles_result: List[Dict[str, Any]] = []

            for row in range(tiles_high):
                for col in range(tiles_wide):
                    tile_id = row * tiles_wide + col
                    x0 = max(0, col * tile_width - overlap_half_x)
                    y0 = max(0, row * tile_height - overlap_half_y)
                    x1 = min(width, (col + 1) * tile_width + overlap_half_x)
                    y1 = min(height, (row + 1) * tile_height + overlap_half_y)
                    tile_bounds = {"x0": x0, "y0": y0, "x1": x1, "y1": y1}
                    tile_w_px = x1 - x0
                    tile_h_px = y1 - y0

                    system_prompt, user_prompt = _build_vision_prompts(
                        detection_types,
                        task_instruction or "",
                        tile_id,
                        row,
                        col,
                        tile_w_px,
                        tile_h_px,
                        tile_bounds,
                    )

                    tile_image = image.crop((x0, y0, x1, y1))
                    buf = BytesIO()
                    tile_image.save(buf, format="PNG")
                    data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": [{"type": "text", "text": user_prompt}, {"type": "image_url", "image_url": {"url": data_uri}}]},
                    ]
                    llm_response = await make_llm_api_call(messages=messages, model_name=VISION_MODEL, stream=False, temperature=0)
                    content = _parse_llm_content(llm_response)
                    if not content:
                        return self.fail_response(f"Tile {tile_id}: empty model response.")

                    try:
                        parsed = self._extract_json(content)
                    except Exception:
                        parsed = {"raw_text": content}

                    tile_result = {
                        "tile_id": tile_id,
                        "row": row,
                        "col": col,
                        "global_bbox_px": tile_bounds,
                        "analysis": parsed,
                    }
                    tiles_result.append(tile_result)

            merged = run_deduplication(tiles_result, width, height)
            # Sort by type then position (y_min, x_min) for consistent output
            def _merged_sort_key(c: Dict[str, Any]) -> tuple:
                t = c.get("type") or c.get("label") or ""
                b = c.get("bbox_global") or {}
                return (t, b.get("y_min", 0), b.get("x_min", 0))
            merged = sorted(merged, key=_merged_sort_key)
            component_counts: Dict[str, int] = {}
            for c in merged:
                t = c.get("type") or DEFAULT_TYPE
                component_counts[t] = component_counts.get(t, 0) + 1

            return self.success_response({
                "image": {
                    "path": cleaned_path,
                    "width_px": width,
                    "height_px": height,
                    "tile_count_requested": tile_count_requested,
                    "tiles_wide": tiles_wide,
                    "tiles_high": tiles_high,
                    "tile_width_px": tile_width,
                    "tile_height_px": tile_height,
                    "tile_count_actual": total_tiles,
                    "overlap_fraction": OVERLAP_FRACTION,
                },
                "detection_types": detection_types,
                "task_instruction": task_instruction or None,
                "merged_components": merged,
                "component_counts": component_counts,
                "model_used": VISION_MODEL,
            })
        except Exception as e:
            return self.fail_response(f"Advanced floorplan analyzer failed: {e}")
