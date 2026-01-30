"""
Coordinate conversion utilities for PDF and normalized coordinates.

Textract returns normalized coordinates (0-1 range), while PDFs use
point-based coordinates. This module provides conversion functions.
"""

from typing import List, Tuple


def norm_to_pdf_bbox(norm_bbox: dict, page_width: float, page_height: float) -> List[float]:
    """
    Convert Textract normalized bbox to PDF coordinates.
    
    Textract bbox format: {"Left": 0.1, "Top": 0.2, "Width": 0.3, "Height": 0.4}
    PDF bbox format: [x0, y0, x1, y1] in PDF points
    
    Args:
        norm_bbox: Dict with Left, Top, Width, Height (all 0-1 normalized)
        page_width: PDF page width in points
        page_height: PDF page height in points
        
    Returns:
        List [x0, y0, x1, y1] in PDF coordinates
    """
    left = norm_bbox.get("Left", 0.0)
    top = norm_bbox.get("Top", 0.0)
    width = norm_bbox.get("Width", 0.0)
    height = norm_bbox.get("Height", 0.0)
    
    x0 = left * page_width
    y0 = top * page_height
    x1 = x0 + (width * page_width)
    y1 = y0 + (height * page_height)
    
    return [x0, y0, x1, y1]


def pdf_to_norm_bbox(pdf_bbox: List[float], page_width: float, page_height: float) -> dict:
    """
    Convert PDF bbox to normalized coordinates.
    
    Args:
        pdf_bbox: [x0, y0, x1, y1] in PDF points
        page_width: PDF page width in points
        page_height: PDF page height in points
        
    Returns:
        Dict with Left, Top, Width, Height (all 0-1 normalized)
    """
    if page_width <= 0 or page_height <= 0:
        return {"Left": 0.0, "Top": 0.0, "Width": 0.0, "Height": 0.0}
    
    x0, y0, x1, y1 = pdf_bbox
    
    left = x0 / page_width
    top = y0 / page_height
    width = (x1 - x0) / page_width
    height = (y1 - y0) / page_height
    
    return {
        "Left": max(0.0, min(1.0, left)),
        "Top": max(0.0, min(1.0, top)),
        "Width": max(0.0, min(1.0, width)),
        "Height": max(0.0, min(1.0, height))
    }


def bbox_overlap(bbox1: List[float], bbox2: List[float], threshold: float = 0.1) -> bool:
    """
    Check if two bboxes overlap or are within threshold distance.
    
    Args:
        bbox1: [x0, y0, x1, y1]
        bbox2: [x0, y0, x1, y1]
        threshold: Maximum distance between bboxes to consider them overlapping (in PDF points)
        
    Returns:
        True if bboxes overlap or are within threshold
    """
    x0_1, y0_1, x1_1, y1_1 = bbox1
    x0_2, y0_2, x1_2, y1_2 = bbox2
    
    # Check if bboxes overlap
    overlap_x = not (x1_1 < x0_2 or x1_2 < x0_1)
    overlap_y = not (y1_1 < y0_2 or y1_2 < y0_1)
    
    if overlap_x and overlap_y:
        return True
    
    # Check if within threshold distance
    # Calculate center points
    center1_x = (x0_1 + x1_1) / 2
    center1_y = (y0_1 + y1_1) / 2
    center2_x = (x0_2 + x1_2) / 2
    center2_y = (y0_2 + y1_2) / 2
    
    distance = ((center1_x - center2_x) ** 2 + (center1_y - center2_y) ** 2) ** 0.5
    
    return distance <= threshold


def bbox_distance(bbox1: List[float], bbox2: List[float]) -> float:
    """
    Calculate minimum distance between two bboxes.
    
    Args:
        bbox1: [x0, y0, x1, y1]
        bbox2: [x0, y0, x1, y1]
        
    Returns:
        Minimum distance between bboxes in PDF points
    """
    x0_1, y0_1, x1_1, y1_1 = bbox1
    x0_2, y0_2, x1_2, y1_2 = bbox2
    
    # Calculate center points
    center1_x = (x0_1 + x1_1) / 2
    center1_y = (y0_1 + y1_1) / 2
    center2_x = (x0_2 + x1_2) / 2
    center2_y = (y0_2 + y1_2) / 2
    
    return ((center1_x - center2_x) ** 2 + (center1_y - center2_y) ** 2) ** 0.5
