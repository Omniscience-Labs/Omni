"""
PDF inspection and classification module.

Provides deterministic PDF analysis using PyMuPDF and pypdf to classify
documents and extract structural metadata.
"""

import os
from typing import Dict, Any, List, Tuple
import pymupdf  # PyMuPDF
import pypdf
from core.utils.logger import logger

# Classification threshold for text detection
T_TEXT = 20  # Minimum characters to consider a page as having text


def inspect_pdf(pdf_path: str) -> Dict[str, Any]:
    """
    Inspect a PDF file and return structured metadata about its structure.
    
    Uses both PyMuPDF and pypdf to gather comprehensive information about:
    - Page count and dimensions
    - AcroForm presence and field count
    - Widget annotations per page
    - Text content per page
    - Image content per page
    - Document type classification
    
    Args:
        pdf_path: Path to the PDF file to inspect
        
    Returns:
        Dictionary with inspection results containing:
        - pdf_path: Original file path
        - file_size_bytes: File size in bytes
        - page_count: Number of pages
        - has_acroform: Whether AcroForm exists
        - acroform_field_count: Number of AcroForm fields
        - pages: List of page metadata dictionaries
        - doc_type: Classification ("acroform" | "overlay" | "hybrid" | "scanned")
        - reason: Explanation of classification
        
    Raises:
        FileNotFoundError: If PDF file doesn't exist
        ValueError: If PDF is encrypted or cannot be parsed
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    
    file_size = os.path.getsize(pdf_path)
    
    # Initialize result structure
    result: Dict[str, Any] = {
        "pdf_path": pdf_path,
        "file_size_bytes": file_size,
        "page_count": 0,
        "has_acroform": False,
        "acroform_field_count": 0,
        "pages": [],
        "doc_type": "hybrid",
        "reason": ""
    }
    
    # Try to open with PyMuPDF first
    pymupdf_doc = None
    pypdf_reader = None
    
    try:
        pymupdf_doc = pymupdf.open(pdf_path)
        
        # Check if encrypted
        if pymupdf_doc.is_encrypted:
            raise ValueError("PDF is encrypted and cannot be inspected without password")
        
        result["page_count"] = len(pymupdf_doc)
        
    except Exception as e:
        logger.warning(f"PyMuPDF failed to open PDF {pdf_path}: {e}")
        if "encrypted" in str(e).lower() or "password" in str(e).lower():
            raise ValueError(f"PDF is encrypted: {e}")
        # Continue with pypdf only if PyMuPDF fails
    
    # Try to open with pypdf for AcroForm detection
    try:
        with open(pdf_path, 'rb') as f:
            pypdf_reader = pypdf.PdfReader(f)
            
            # Check if encrypted
            if pypdf_reader.is_encrypted:
                raise ValueError("PDF is encrypted and cannot be inspected without password")
            
            # Check for AcroForm
            catalog = pypdf_reader.trailer.get("/Root", {})
            if isinstance(catalog, dict):
                acroform = catalog.get("/AcroForm")
                if acroform is not None:
                    result["has_acroform"] = True
                    # Count fields
                    fields = acroform.get("/Fields")
                    if fields is not None:
                        if isinstance(fields, list):
                            result["acroform_field_count"] = len(fields)
                        else:
                            # Fields might be a reference, try to resolve
                            try:
                                if hasattr(fields, 'get_object'):
                                    fields_obj = fields.get_object()
                                    if isinstance(fields_obj, list):
                                        result["acroform_field_count"] = len(fields_obj)
                                    else:
                                        result["acroform_field_count"] = 1
                                else:
                                    result["acroform_field_count"] = 1
                            except Exception:
                                result["acroform_field_count"] = 1
                    
    except Exception as e:
        logger.warning(f"pypdf failed to open PDF {pdf_path}: {e}")
        if "encrypted" in str(e).lower() or "password" in str(e).lower():
            raise ValueError(f"PDF is encrypted: {e}")
        # Continue with PyMuPDF only if pypdf fails
    
    # If both failed, raise error
    if pymupdf_doc is None and pypdf_reader is None:
        raise ValueError(f"Could not open PDF with either PyMuPDF or pypdf: {pdf_path}")
    
    # If we only have pypdf, we can't do page-level inspection
    if pymupdf_doc is None:
        logger.warning(f"PyMuPDF unavailable, skipping page-level inspection for {pdf_path}")
        result["doc_type"] = "hybrid"
        result["reason"] = "Limited inspection: only pypdf available"
        return result
    
    # Process each page with PyMuPDF
    for page_idx in range(len(pymupdf_doc)):
        page = pymupdf_doc[page_idx]
        page_info: Dict[str, Any] = {
            "page_index": page_idx,
            "width": 0.0,
            "height": 0.0,
            "rotation": 0,
            "has_widgets": False,
            "widget_count": 0,
            "text_char_count": 0,
            "image_count": 0,
            "image_area_ratio": 0.0
        }
        
        # Get page dimensions and rotation
        rect = page.rect
        page_info["width"] = float(rect.width)
        page_info["height"] = float(rect.height)
        page_info["rotation"] = int(page.rotation)
        
        # Check for widgets/annotations
        try:
            widgets = page.widgets()
            if widgets:
                page_info["has_widgets"] = True
                page_info["widget_count"] = len(list(widgets))
        except Exception as e:
            logger.debug(f"Error getting widgets for page {page_idx}: {e}")
            # Also try annotations
            try:
                annots = page.annots()
                if annots:
                    widget_annots = [a for a in annots if a.type[1] == "Widget"]
                    if widget_annots:
                        page_info["has_widgets"] = True
                        page_info["widget_count"] = len(widget_annots)
            except Exception:
                pass
        
        # Extract text and count characters
        try:
            text = page.get_text("text")
            # Count non-whitespace characters
            text_chars = len(text.replace(" ", "").replace("\n", "").replace("\t", ""))
            page_info["text_char_count"] = text_chars
        except Exception as e:
            logger.debug(f"Error extracting text from page {page_idx}: {e}")
        
        # Count images and calculate image area ratio
        try:
            images = page.get_images(full=True)
            page_info["image_count"] = len(images)
            
            # Calculate total image area
            total_image_area = 0.0
            page_area = page_info["width"] * page_info["height"]
            
            for img_idx, img_info in enumerate(images):
                xref = img_info[0]
                try:
                    # Get image rectangles (image may appear multiple times)
                    image_rects = page.get_image_rects(xref)
                    for rect in image_rects:
                        # rect is a Rect object with width and height
                        img_area = float(rect.width * rect.height)
                        total_image_area += img_area
                except Exception as e:
                    logger.debug(f"Error getting image rects for image {img_idx} on page {page_idx}: {e}")
            
            # Calculate ratio (clamp to 1.0)
            if page_area > 0:
                page_info["image_area_ratio"] = min(1.0, total_image_area / page_area)
            else:
                page_info["image_area_ratio"] = 0.0
                
        except Exception as e:
            logger.debug(f"Error processing images for page {page_idx}: {e}")
        
        result["pages"].append(page_info)
    
    # Close PyMuPDF document
    if pymupdf_doc:
        pymupdf_doc.close()
    
    # Classify document type
    result["doc_type"], result["reason"] = _classify_document(result)
    
    return result


def _classify_document(inspection: Dict[str, Any]) -> Tuple[str, str]:
    """
    Classify document type based on inspection results.
    
    Classification rules:
    1. If has_acroform and any_widgets: "acroform"
    2. If not has_acroform and mostly_image_heavy and no text: "scanned"
    3. If not has_acroform and has text and not mostly_image_heavy: "overlay"
    4. Otherwise: "hybrid"
    
    Args:
        inspection: Inspection result dictionary
        
    Returns:
        Tuple of (doc_type, reason)
    """
    has_acroform = inspection.get("has_acroform", False)
    pages = inspection.get("pages", [])
    
    if not pages:
        return ("hybrid", "No pages to analyze")
    
    # Compute signals
    any_widgets = any(page.get("has_widgets", False) for page in pages)
    any_text = any(page.get("text_char_count", 0) > T_TEXT for page in pages)
    
    image_heavy_pages = sum(
        1 for page in pages 
        if page.get("image_area_ratio", 0.0) > 0.6
    )
    page_count = len(pages)
    mostly_image_heavy = (image_heavy_pages / page_count) >= 0.7 if page_count > 0 else False
    
    # Classification rules
    if has_acroform and any_widgets:
        if any_text:
            return ("acroform", "Has AcroForm fields and widgets with extractable text")
        else:
            return ("acroform", "Has AcroForm fields and widgets but minimal text")
    
    elif not has_acroform and mostly_image_heavy and not any_text:
        return ("scanned", f"Image-heavy ({image_heavy_pages}/{page_count} pages >60% image area) with no extractable text")
    
    elif not has_acroform and any_text and not mostly_image_heavy:
        return ("overlay", "Has extractable text without AcroForm structure")
    
    else:
        # Mixed signals
        reasons = []
        if any_widgets:
            reasons.append("has widgets")
        if any_text:
            reasons.append("has text")
        if image_heavy_pages > 0:
            reasons.append(f"{image_heavy_pages} image-heavy pages")
        reason_str = ", ".join(reasons) if reasons else "mixed characteristics"
        return ("hybrid", f"Mixed document: {reason_str}")
