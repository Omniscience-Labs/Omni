"""
Label assignment from Textract to AcroForm fields.

Deterministically assigns human-readable labels from Textract key-value pairs
and lines to AcroForm fields based on spatial relationships.
"""

from typing import List, Dict, Any, Optional, Tuple
from core.utils.logger import logger
from .coordinate_utils import norm_to_pdf_bbox, bbox_overlap, bbox_distance


def assign_labels_to_acroform_fields(
    acro_fields: List[Dict[str, Any]],
    textract_kv: List[Dict[str, Any]],
    textract_lines: List[Dict[str, Any]],
    page_dims: List[Dict[str, float]]
) -> List[Dict[str, Any]]:
    """
    Assign labels from Textract output to AcroForm fields.
    
    Rules:
    A) Preferred: KEY-VALUE association - if VALUE bbox overlaps field bbox
    B) Fallback: Nearby LINE text - search LEFT, ABOVE, or nearest
    C) Ambiguity: If multiple candidates or low confidence, leave label=null
    
    Args:
        acro_fields: List of AcroForm field dictionaries
        textract_kv: List of Textract key-value pairs
        textract_lines: List of Textract line blocks
        page_dims: List of {width, height} for each page
        
    Returns:
        List of AcroForm fields with assigned labels
    """
    labeled_fields = []
    
    for field in acro_fields:
        field_labeled = field.copy()
        page_idx = field.get("page_index")
        
        if page_idx is None or page_idx >= len(page_dims):
            # No page info, skip labeling
            labeled_fields.append(field_labeled)
            continue
        
        page_width = page_dims[page_idx]["width"]
        page_height = page_dims[page_idx]["height"]
        field_bbox = field.get("bbox_pdf")
        
        if not field_bbox:
            # No bbox, skip labeling
            labeled_fields.append(field_labeled)
            continue
        
        # Rule A: Try KEY-VALUE association
        label, label_source = _try_key_value_association(
            field_bbox, textract_kv, page_width, page_height
        )
        
        # Rule B: Fallback to nearby LINE text
        if not label:
            label, label_source = _try_nearby_line(
                field_bbox, textract_lines, page_idx, page_width, page_height
            )
        
        # Assign label (or leave null if ambiguous)
        field_labeled["label"] = label
        field_labeled["label_source"] = label_source
        
        labeled_fields.append(field_labeled)
    
    return labeled_fields


def _try_key_value_association(
    field_bbox: List[float],
    textract_kv: List[Dict[str, Any]],
    page_width: float,
    page_height: float,
    overlap_threshold: float = 10.0
) -> Tuple[Optional[str], Optional[str]]:
    """
    Try to find a KEY-VALUE pair where VALUE overlaps the field.
    
    Args:
        field_bbox: Field bbox in PDF coordinates [x0, y0, x1, y1]
        textract_kv: List of key-value pairs from Textract
        page_width: Page width in PDF points
        page_height: Page height in PDF points
        overlap_threshold: Maximum distance for overlap (PDF points)
        
    Returns:
        Tuple of (label, label_source) or (None, None)
    """
    best_match = None
    best_score = float('inf')
    
    for kv in textract_kv:
        value_bbox_norm = kv.get("value_bbox", {})
        if not value_bbox_norm:
            continue
        
        # Convert VALUE bbox to PDF coordinates
        value_bbox_pdf = norm_to_pdf_bbox(value_bbox_norm, page_width, page_height)
        
        # Check if VALUE overlaps or is very close to field
        if bbox_overlap(field_bbox, value_bbox_pdf, threshold=overlap_threshold):
            # Use KEY text as label
            key_text = kv.get("key", "").strip()
            if key_text:
                # Remove trailing colon if present
                key_text = key_text.rstrip(':').strip()
                if key_text:
                    # Calculate distance for scoring
                    distance = bbox_distance(field_bbox, value_bbox_pdf)
                    if distance < best_score:
                        best_score = distance
                        best_match = (key_text, "textract_key")
    
    if best_match:
        return best_match
    
    return (None, None)


def _try_nearby_line(
    field_bbox: List[float],
    textract_lines: List[Dict[str, Any]],
    page_idx: int,
    page_width: float,
    page_height: float,
    search_radius: float = 50.0
) -> Tuple[Optional[str], Optional[str]]:
    """
    Find nearby LINE text to use as label.
    
    Search order:
    1) LEFT of field (same baseline preferred)
    2) ABOVE field (same column)
    3) Nearest within radius
    
    Args:
        field_bbox: Field bbox in PDF coordinates
        textract_lines: List of line blocks from Textract
        page_idx: Page index
        page_width: Page width in PDF points
        page_height: Page height in PDF points
        search_radius: Maximum search radius in PDF points
        
    Returns:
        Tuple of (label, label_source) or (None, None)
    """
    field_x0, field_y0, field_x1, field_y1 = field_bbox
    field_center_x = (field_x0 + field_x1) / 2
    field_center_y = (field_y0 + field_y1) / 2
    field_height = field_y1 - field_y0
    
    # Filter lines on same page
    page_lines = [
        line for line in textract_lines
        if line.get("page", 1) - 1 == page_idx  # Textract pages are 1-indexed
    ]
    
    if not page_lines:
        return (None, None)
    
    candidates = []
    
    for line in page_lines:
        line_bbox_norm = line.get("bbox", {})
        if not line_bbox_norm:
            continue
        
        # Convert to PDF coordinates
        line_bbox_pdf = norm_to_pdf_bbox(line_bbox_norm, page_width, page_height)
        line_x0, line_y0, line_x1, line_y1 = line_bbox_pdf
        line_center_x = (line_x0 + line_x1) / 2
        line_center_y = (line_y0 + line_y1) / 2
        line_text = line.get("text", "").strip()
        
        if not line_text:
            continue
        
        # Reject very long lines (paragraph-like)
        line_width = line_x1 - line_x0
        if line_width > page_width * 0.8:
            continue
        
        # Reject lines in header/footer margins (top/bottom 10%)
        if line_y0 < page_height * 0.1 or line_y1 > page_height * 0.9:
            continue
        
        # Calculate position relative to field
        dx = field_x0 - line_x1  # Distance from line end to field start
        dy = abs(line_center_y - field_center_y)  # Vertical offset
        
        # Check if within search radius
        distance = ((line_center_x - field_center_x) ** 2 + (line_center_y - field_center_y) ** 2) ** 0.5
        if distance > search_radius:
            continue
        
        # Determine position category and score
        position = None
        score = distance
        
        # 1) LEFT of field (same baseline preferred)
        if line_x1 < field_x0:
            if dy < field_height * 0.5:  # Same baseline
                position = "left_same_baseline"
                score = distance * 0.5  # Prefer same baseline
            else:
                position = "left"
        
        # 2) ABOVE field (same column)
        elif line_y1 < field_y0:
            if abs(line_center_x - field_center_x) < (field_x1 - field_x0) * 0.5:
                position = "above_same_column"
                score = distance * 0.7
            else:
                position = "above"
        
        # 3) Nearest within radius
        else:
            position = "nearby"
        
        candidates.append({
            "text": line_text,
            "position": position,
            "score": score,
            "distance": distance,
            "dx": dx,
            "dy": dy
        })
    
    if not candidates:
        return (None, None)
    
    # Sort by score (lower is better)
    candidates.sort(key=lambda c: c["score"])
    
    # Check for ambiguity: if top 2 candidates are very close in score
    if len(candidates) > 1:
        score_diff = candidates[1]["score"] - candidates[0]["score"]
        if score_diff < 5.0:  # Within 5 points, consider ambiguous
            return (None, None)
    
    # Use best candidate
    best = candidates[0]
    return (best["text"], "textract_line")


def _is_ambiguous(candidates: List[Dict[str, Any]], threshold: float = 5.0) -> bool:
    """
    Check if label assignment is ambiguous.
    
    Args:
        candidates: List of candidate dictionaries with scores
        threshold: Score difference threshold for ambiguity
        
    Returns:
        True if assignment is ambiguous
    """
    if len(candidates) < 2:
        return False
    
    candidates.sort(key=lambda c: c.get("score", float('inf')))
    score_diff = candidates[1].get("score", float('inf')) - candidates[0].get("score", float('inf'))
    
    return score_diff < threshold
