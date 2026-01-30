"""
Build canonical field candidate JSON from inspection and extraction results.
"""

import uuid
from typing import Dict, Any, List
from core.utils.logger import logger
from .coordinate_utils import norm_to_pdf_bbox, pdf_to_norm_bbox


def build_field_candidates(
    inspection: Dict[str, Any],
    acro_fields: List[Dict[str, Any]],
    textract_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Build canonical output with inspection and field candidates.
    
    Args:
        inspection: Inspection result from pdf_inspection
        acro_fields: List of AcroForm fields (may have labels assigned)
        textract_data: Textract extraction results
        
    Returns:
        Canonical output dictionary
    """
    page_dims = [
        {
            "width": page.get("width", 0.0),
            "height": page.get("height", 0.0)
        }
        for page in inspection.get("pages", [])
    ]
    
    candidates = {
        "fields": [],
        "selection_elements": [],
        "tables": []
    }
    
    # Add AcroForm fields
    for field in acro_fields:
        field_candidate = _build_field_candidate(field, page_dims, source="acroform")
        if field_candidate:
            candidates["fields"].append(field_candidate)
    
    # Add Textract key-value fields (for non-AcroForm PDFs)
    textract_kv = textract_data.get("key_values", [])
    for kv in textract_kv:
        key_text = kv.get("key", "").strip()
        if not key_text:
            continue
        
        # Remove trailing colon
        key_text = key_text.rstrip(':').strip()
        if not key_text:
            continue
        
        # Get page from value bbox (approximate)
        value_bbox_norm = kv.get("value_bbox", {})
        if not value_bbox_norm:
            continue
        
        # Find which page this belongs to (use first page for now, could be improved)
        page_idx = 0
        if page_dims:
            page_width = page_dims[page_idx]["width"]
            page_height = page_dims[page_idx]["height"]
            value_bbox_pdf = norm_to_pdf_bbox(value_bbox_norm, page_width, page_height)
        else:
            continue
        
        field_candidate = {
            "id": str(uuid.uuid4()),
            "source": "textract",
            "type": "text",  # Textract key-value pairs are typically text fields
            "name": key_text,
            "label": key_text,
            "label_source": "textract_key",
            "page_index": page_idx,
            "bbox_pdf": value_bbox_pdf,
            "bbox_norm": value_bbox_norm,
            "confidence": kv.get("confidence", 0.0),
            "meta": {
                "value_text": kv.get("value", "").strip()
            }
        }
        
        candidates["fields"].append(field_candidate)
    
    # Add selection elements (checkboxes from Textract)
    selection_elements = textract_data.get("selection_elements", [])
    for sel in selection_elements:
        sel_bbox_norm = sel.get("bbox", {})
        if not sel_bbox_norm:
            continue
        
        # Find page
        page_idx = sel.get("page", 1) - 1  # Textract pages are 1-indexed
        if page_idx < 0 or page_idx >= len(page_dims):
            continue
        
        page_width = page_dims[page_idx]["width"]
        page_height = page_dims[page_idx]["height"]
        sel_bbox_pdf = norm_to_pdf_bbox(sel_bbox_norm, page_width, page_height)
        
        candidates["selection_elements"].append({
            "id": str(uuid.uuid4()),
            "selected": sel.get("selected", False),
            "text": sel.get("text", ""),
            "page_index": page_idx,
            "bbox_pdf": sel_bbox_pdf,
            "bbox_norm": sel_bbox_norm,
            "confidence": sel.get("confidence", 0.0)
        })
    
    # Add tables
    tables = textract_data.get("tables", [])
    for table in tables:
        table_bbox_norm = table.get("bbox", {})
        page_idx = table.get("page", 1) - 1
        if page_idx < 0 or page_idx >= len(page_dims):
            continue
        
        page_width = page_dims[page_idx]["width"]
        page_height = page_dims[page_idx]["height"]
        table_bbox_pdf = norm_to_pdf_bbox(table_bbox_norm, page_width, page_height) if table_bbox_norm else None
        
        candidates["tables"].append({
            "id": str(uuid.uuid4()),
            "page_index": page_idx,
            "bbox_pdf": table_bbox_pdf,
            "bbox_norm": table_bbox_norm,
            "rows": table.get("rows", [])
        })
    
    return {
        "pdf_path": inspection.get("pdf_path", ""),
        "doc_type": inspection.get("doc_type", "unknown"),
        "inspection": inspection,
        "candidates": candidates
    }


def _build_field_candidate(
    field: Dict[str, Any],
    page_dims: List[Dict[str, float]],
    source: str
) -> Dict[str, Any]:
    """
    Build a field candidate from an AcroForm field.
    
    Args:
        field: AcroForm field dictionary
        page_dims: List of page dimensions
        source: Source identifier ("acroform")
        
    Returns:
        Field candidate dictionary
    """
    page_idx = field.get("page_index")
    if page_idx is None or page_idx >= len(page_dims):
        return None
    
    page_width = page_dims[page_idx]["width"]
    page_height = page_dims[page_idx]["height"]
    bbox_pdf = field.get("bbox_pdf")
    bbox_norm = None
    
    if bbox_pdf:
        bbox_norm = pdf_to_norm_bbox(bbox_pdf, page_width, page_height)
    
    return {
        "id": str(uuid.uuid4()),
        "source": source,
        "type": field.get("field_type", "unknown"),
        "name": field.get("name", ""),
        "label": field.get("label"),
        "label_source": field.get("label_source"),
        "page_index": page_idx,
        "bbox_pdf": bbox_pdf,
        "bbox_norm": bbox_norm,
        "confidence": None,  # AcroForm fields don't have confidence scores
        "meta": {
            "required": field.get("required", False),
            "flags": field.get("flags", {}),
            "raw": field.get("raw", {})
        }
    }
