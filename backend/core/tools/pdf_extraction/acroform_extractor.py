"""
AcroForm field extraction using pypdf and PyMuPDF.

Extracts exact field names, types, and locations from PDF AcroForm structures.
"""

import pymupdf
import pypdf
from typing import List, Dict, Any, Optional
from core.utils.logger import logger


def extract_acroform_fields(pdf_path: str) -> List[Dict[str, Any]]:
    """
    Extract AcroForm fields from PDF using pypdf and PyMuPDF.
    
    Args:
        pdf_path: Path to PDF file
        
    Returns:
        List of field dictionaries with stable names and metadata
    """
    fields = []
    
    try:
        # Open with pypdf to get AcroForm structure
        with open(pdf_path, 'rb') as f:
            reader = pypdf.PdfReader(f)
            
            if reader.is_encrypted:
                logger.warning(f"PDF {pdf_path} is encrypted, cannot extract AcroForm fields")
                return fields
            
            catalog = reader.trailer.get("/Root", {})
            if not isinstance(catalog, dict):
                return fields
            
            acroform = catalog.get("/AcroForm")
            if acroform is None:
                return fields
            
            # Get fields array
            fields_array = acroform.get("/Fields")
            if fields_array is None:
                return fields
            
            # Resolve fields array
            if hasattr(fields_array, 'get_object'):
                fields_array = fields_array.get_object()
            
            if not isinstance(fields_array, list):
                return fields
            
            # Open with PyMuPDF to get widget locations
            pymupdf_doc = pymupdf.open(pdf_path)
            
            # Build field name to page/widget mapping
            field_widgets = _map_field_widgets(pymupdf_doc, fields_array)
            
            # Extract each field
            for field_obj in fields_array:
                try:
                    field_dict = _extract_field_info(field_obj, field_widgets, reader)
                    if field_dict:
                        fields.append(field_dict)
                except Exception as e:
                    logger.debug(f"Error extracting field: {e}")
                    continue
            
            pymupdf_doc.close()
            
    except Exception as e:
        logger.error(f"Error extracting AcroForm fields from {pdf_path}: {e}")
    
    return fields


def _map_field_widgets(doc: pymupdf.Document, fields_array: list) -> Dict[str, List[Dict[str, Any]]]:
    """
    Map field names to their widget locations using PyMuPDF.
    
    Returns:
        Dict mapping field names to list of widget info dicts
    """
    field_widgets = {}
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        try:
            widgets = page.widgets()
            for widget in widgets:
                field_name = widget.field_name
                if field_name:
                    if field_name not in field_widgets:
                        field_widgets[field_name] = []
                    
                    rect = widget.rect
                    field_widgets[field_name].append({
                        "page_index": page_num,
                        "bbox_pdf": [float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)],
                        "widget_type": widget.field_type_string
                    })
        except Exception as e:
            logger.debug(f"Error mapping widgets on page {page_num}: {e}")
            continue
    
    return field_widgets


def _extract_field_info(field_obj: Any, field_widgets: Dict[str, List[Dict[str, Any]]], reader: pypdf.PdfReader) -> Optional[Dict[str, Any]]:
    """
    Extract information from a single AcroForm field object.
    
    Args:
        field_obj: pypdf field object
        field_widgets: Mapping of field names to widget locations
        reader: pypdf PdfReader instance
        
    Returns:
        Field dictionary or None if extraction fails
    """
    try:
        # Resolve indirect reference if needed
        if hasattr(field_obj, 'get_object'):
            field_dict = field_obj.get_object()
        else:
            field_dict = field_obj
        
        if not isinstance(field_dict, dict):
            return None
        
        # Get field name (exact PDF name)
        field_name = field_dict.get("/T")
        if field_name is None:
            return None
        
        # Handle string objects
        if hasattr(field_name, 'get_object'):
            field_name = field_name.get_object()
        if isinstance(field_name, bytes):
            field_name = field_name.decode('utf-8', errors='replace')
        elif not isinstance(field_name, str):
            field_name = str(field_name)
        
        # Get field type
        field_type_code = field_dict.get("/FT")
        field_type = _map_field_type(field_type_code)
        
        # Get flags
        flags = field_dict.get("/Ff", 0)
        if hasattr(flags, 'get_object'):
            flags = flags.get_object()
        flags_int = int(flags) if flags else 0
        
        # Check if required (bit 1 = Required)
        required = bool(flags_int & 0x02)
        
        # Get widget location from PyMuPDF mapping
        page_index = None
        bbox_pdf = None
        
        if field_name in field_widgets and field_widgets[field_name]:
            # Use first widget location
            widget_info = field_widgets[field_name][0]
            page_index = widget_info["page_index"]
            bbox_pdf = widget_info["bbox_pdf"]
        
        # Build field dict
        field_info = {
            "source": "acroform",
            "field_type": field_type,
            "name": field_name,
            "page_index": page_index,
            "bbox_pdf": bbox_pdf,
            "required": required,
            "flags": {
                "value": flags_int,
                "read_only": bool(flags_int & 0x01),
                "required": required,
                "no_export": bool(flags_int & 0x04)
            },
            "label": None,
            "label_source": None,
            "raw": {
                "field_type_code": str(field_type_code) if field_type_code else None,
                "flags": flags_int
            }
        }
        
        # Add additional metadata if available
        if "/V" in field_dict:
            field_info["raw"]["value"] = str(field_dict["/V"])
        if "/DV" in field_dict:
            field_info["raw"]["default_value"] = str(field_dict["/DV"])
        
        return field_info
        
    except Exception as e:
        logger.debug(f"Error extracting field info: {e}")
        return None


def _map_field_type(field_type_code: Any) -> str:
    """
    Map pypdf field type code to human-readable type.
    
    Args:
        field_type_code: Field type code from PDF (e.g., "/Tx", "/Btn")
        
    Returns:
        Field type string: "text", "checkbox", "radio", "dropdown", "signature", "unknown"
    """
    if field_type_code is None:
        return "unknown"
    
    field_type_str = str(field_type_code)
    
    # Map common field types
    if field_type_str == "/Tx":
        return "text"
    elif field_type_str == "/Btn":
        return "checkbox"  # Could be checkbox or radio, default to checkbox
    elif field_type_str == "/Ch":
        return "dropdown"
    elif field_type_str == "/Sig":
        return "signature"
    else:
        return "unknown"
