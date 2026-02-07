"""PDF Editor API endpoints."""
import base64
import io
import tempfile
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Form
from fastapi.responses import JSONResponse
from pdf2image import convert_from_bytes
from PIL import Image
import cv2
import numpy as np
import pymupdf
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.logger import logger
from core.services.supabase import DBConnection
from .model_manager import get_model

router = APIRouter(prefix="/pdf-editor", tags=["pdf-editor"])


def convert_pdf_points_to_pixels(pdf_point: float, dpi: int = 200) -> float:
    """
    Convert PDF point coordinates to pixel coordinates.
    
    PDF uses 72 points per inch, while image is at specified DPI.
    Formula: pixels = (points / 72) * DPI
    
    Args:
        pdf_point: Coordinate in PDF points
        dpi: DPI of the converted image
    
    Returns:
        Coordinate in pixels
    """
    return (pdf_point / 72.0) * dpi


@router.post("/detect")
async def detect_pdf_fields(
    file: UploadFile = File(...),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
):
    """
    Detect form fields in a PDF using YOLO model.
    
    Accepts a PDF file, converts it to an image, runs YOLO inference,
    and returns detected fields with coordinates and a base64-encoded image.
    """
    try:
        # Validate file type
        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only PDF files are supported."
            )
        
        # Read PDF file content
        pdf_content = await file.read()
        
        # Check file size (10MB limit)
        max_size = 10 * 1024 * 1024  # 10MB
        if len(pdf_content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds {max_size / (1024 * 1024):.0f}MB limit"
            )
        
        logger.info(f"Processing PDF file: {file.filename}, size: {len(pdf_content)} bytes")
        
        # Convert PDF to image (first page only for now)
        try:
            images = convert_from_bytes(
                pdf_content,
                dpi=200,  # Good balance between quality and performance
                first_page=1,
                last_page=1
            )
            
            if not images:
                raise HTTPException(
                    status_code=400,
                    detail="Failed to convert PDF to image. The PDF may be corrupted or empty."
                )
            
            # Use first page
            pil_image = images[0]
            
        except Exception as e:
            logger.error(f"Error converting PDF to image: {str(e)}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to convert PDF to image: {str(e)}"
            )
        
        # Convert PIL image to OpenCV format (numpy array)
        cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        
        # Load YOLO model
        try:
            model = get_model()
        except FileNotFoundError as e:
            logger.error(f"Model not found: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="PDF editor model not available. Please contact support."
            )
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load PDF editor model: {str(e)}"
            )
        
        # Run YOLO inference
        try:
            results = model(cv_image)
            logger.info(f"YOLO inference completed. Found {len(results)} result(s)")
        except Exception as e:
            logger.error(f"Error during YOLO inference: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to detect form fields: {str(e)}"
            )
        
        # Extract detected fields from results
        detected_fields = []
        
        if results and len(results) > 0:
            result = results[0]  # Get first result
            
            # Extract boxes, confidence scores, and class IDs
            boxes = result.boxes
            
            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    # Get box coordinates (x1, y1, x2, y2)
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    
                    # Get confidence score
                    confidence = float(box.conf[0].cpu().numpy())
                    
                    # Get class ID and name
                    class_id = int(box.cls[0].cpu().numpy())
                    class_name = model.names[class_id] if hasattr(model, 'names') else f"class_{class_id}"
                    
                    # Convert to relative coordinates (0-1 range) for frontend
                    img_height, img_width = cv_image.shape[:2]
                    x1_rel = float(x1 / img_width)
                    y1_rel = float(y1 / img_height)
                    x2_rel = float(x2 / img_width)
                    y2_rel = float(y2 / img_height)
                    
                    detected_fields.append({
                        "id": len(detected_fields),  # Simple ID for frontend
                        "type": class_name,  # e.g., "text_field", "checkbox", "signature"
                        "confidence": round(confidence, 3),
                        "bbox": {
                            "x1": round(x1_rel, 4),
                            "y1": round(y1_rel, 4),
                            "x2": round(x2_rel, 4),
                            "y2": round(y2_rel, 4),
                        },
                        "bbox_pixels": {
                            "x1": int(x1),
                            "y1": int(y1),
                            "x2": int(x2),
                            "y2": int(y2),
                        }
                    })
        
        logger.info(f"Detected {len(detected_fields)} form fields")
        
        # Calculate PDF page size in points (72 points = 1 inch)
        # Image is converted at 200 DPI, so: PDF size in points = (image size in pixels / DPI) * 72
        dpi = 200
        pdf_width_pt = (pil_image.width / dpi) * 72
        pdf_height_pt = (pil_image.height / dpi) * 72
        
        # Convert image to base64 for frontend
        buffered = io.BytesIO()
        pil_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # Return response
        return JSONResponse(content={
            "success": True,
            "fields": detected_fields,
            "image": {
                "data": img_base64,
                "format": "png",
                "width": pil_image.width,
                "height": pil_image.height
            },
            "page_size": {
                "width_pt": round(pdf_width_pt, 2),  # PDF page width in points
                "height_pt": round(pdf_height_pt, 2),  # PDF page height in points
                "dpi": dpi  # DPI used for image conversion
            },
            "page_count": len(images)  # For future multi-page support
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in PDF field detection: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


def fill_pdf_with_data(
    pdf_content: bytes,
    field_data: Dict[int, Dict[str, Any]],
    detected_fields: List[Dict[str, Any]],
    dpi: int = 200
) -> bytes:
    """
    Fill PDF form fields with provided data using PyMuPDF.
    
    Args:
        pdf_content: Original PDF file content as bytes
        field_data: Dictionary mapping field_id to data value and metadata
        detected_fields: List of detected fields with pixel coordinates
        dpi: DPI used for image conversion (for coordinate conversion)
    
    Returns:
        Filled PDF content as bytes
    """
    try:
        doc = pymupdf.open(stream=pdf_content, filetype="pdf")
        
        # Process first page (for now, single-page support)
        if len(doc) == 0:
            raise ValueError("PDF has no pages")
        
        page = doc[0]
        page_rect = page.rect
        
        # Create mapping from field_id to field info
        field_id_to_info = {}
        for field in detected_fields:
            field_id_to_info[field["id"]] = field
        
        filled_count = 0
        
        # Fill each field
        for field_id, data_info in field_data.items():
            if field_id not in field_id_to_info:
                logger.warning(f"Field ID {field_id} not found in detected fields")
                continue
            
            # Ensure data_info is a dictionary
            if not isinstance(data_info, dict):
                logger.warning(f"Field {field_id} has non-dict data_info: {type(data_info)}, value: {data_info}")
                # If it's a string, treat it as the value
                if isinstance(data_info, str):
                    data_info = {"value": data_info, "label": "", "source": "unknown"}
                else:
                    continue
            
            field_info = field_id_to_info[field_id]
            value = data_info.get("value")
            field_type = field_info.get("type", "text_field").lower()
            
            if value is None or value == "":
                continue
            
            # Get pixel coordinates
            bbox_pixels = field_info.get("bbox_pixels", {})
            x1_pixels = bbox_pixels.get("x1", 0)
            y1_pixels = bbox_pixels.get("y1", 0)
            x2_pixels = bbox_pixels.get("x2", 0)
            y2_pixels = bbox_pixels.get("y2", 0)
            
            # Convert pixel coordinates to PDF points
            x1_pt = convert_pixels_to_pdf_points(x1_pixels, dpi)
            y1_pt = convert_pixels_to_pdf_points(y1_pixels, dpi)
            x2_pt = convert_pixels_to_pdf_points(x2_pixels, dpi)
            y2_pt = convert_pixels_to_pdf_points(y2_pixels, dpi)
            
            # Calculate center position for text placement
            center_x = (x1_pt + x2_pt) / 2
            center_y = (y1_pt + y2_pt) / 2
            
            try:
                if "checkbox" in field_type:
                    # For checkboxes, place a checkmark if value is truthy
                    if isinstance(value, bool):
                        is_checked = value
                    elif isinstance(value, str):
                        is_checked = value.lower() in ['true', '1', 'yes', 'checked', 'x']
                    else:
                        is_checked = bool(value)
                    
                    if is_checked:
                        # Place checkmark at center of checkbox
                        page.insert_text(
                            (center_x, center_y),
                            "✓",
                            fontsize=12,
                            color=(0, 0, 0)
                        )
                        filled_count += 1
                
                elif "signature" in field_type:
                    # For signature fields, just place text indicating signature
                    page.insert_text(
                        (center_x, center_y),
                        str(value)[:50],  # Limit length
                        fontsize=10,
                        color=(0, 0, 0)
                    )
                    filled_count += 1
                
                else:
                    # For text fields, place text value
                    # Adjust position to be slightly above center (for better alignment)
                    text_y = y1_pt + 10  # Small offset from top of field
                    text_x = x1_pt + 5   # Small offset from left
                    
                    # Determine appropriate font size based on field height
                    field_height_pt = y2_pt - y1_pt
                    fontsize = max(8, min(12, int(field_height_pt * 0.7)))
                    
                    # Truncate text if too long for field width
                    field_width_pt = x2_pt - x1_pt
                    max_chars = int(field_width_pt / (fontsize * 0.6))
                    text_value = str(value)
                    if len(text_value) > max_chars:
                        text_value = text_value[:max_chars - 3] + "..."
                    
                    page.insert_text(
                        (text_x, text_y),
                        text_value,
                        fontsize=fontsize,
                        color=(0, 0, 0)
                    )
                    filled_count += 1
                    
            except Exception as e:
                logger.warning(f"Error filling field {field_id}: {e}")
                continue
        
        logger.info(f"Filled {filled_count} fields in PDF")
        
        # Save to bytes
        pdf_bytes = doc.tobytes()
        doc.close()
        
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Error filling PDF: {e}")
        raise
