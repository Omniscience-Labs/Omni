"""
Phase A: PDF Page Preprocessing and Routing Module

This module analyzes PDF pages to determine whether each page should use:
- TEXT_VECTOR: PyMuPDF text extraction (sufficient extractable text)
- OCR: Textract + image-based methods (insufficient text, high raster content)

Deterministic heuristics are used - no LLM guessing.
"""

import json
import os
import io
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
import fitz  # PyMuPDF

from core.utils.logger import logger


# Routing thresholds - tune these constants as needed
TEXT_CHAR_THRESHOLD = 200  # Minimum characters for TEXT_VECTOR route
TEXT_COVERAGE_THRESHOLD = 0.01  # Minimum text coverage ratio (1% of page area)
HIGH_RASTER_AREA_THRESHOLD = 0.5  # If >50% raster AND low text => OCR
LOW_TEXT_CHARS_THRESHOLD = 50  # Very low text threshold for OCR route


class PhaseAPageRouter:
    """
    Analyzes PDF pages and routes them to TEXT_VECTOR or OCR processing.
    
    For each page, computes:
    - Text statistics (blocks, spans, chars, words, coverage)
    - Drawing statistics (drawings, rects, lines)
    - Image statistics (count, raster area ratio)
    - Route decision (TEXT_VECTOR or OCR) with confidence and reasons
    """
    
    def __init__(
        self,
        text_char_threshold: int = TEXT_CHAR_THRESHOLD,
        text_coverage_threshold: float = TEXT_COVERAGE_THRESHOLD,
        high_raster_threshold: float = HIGH_RASTER_AREA_THRESHOLD,
        low_text_chars_threshold: int = LOW_TEXT_CHARS_THRESHOLD
    ):
        """
        Initialize router with configurable thresholds.
        
        Args:
            text_char_threshold: Minimum characters for TEXT_VECTOR route
            text_coverage_threshold: Minimum text coverage ratio for TEXT_VECTOR
            high_raster_threshold: High raster area ratio that triggers OCR
            low_text_chars_threshold: Very low text threshold for OCR route
        """
        self.text_char_threshold = text_char_threshold
        self.text_coverage_threshold = text_coverage_threshold
        self.high_raster_threshold = high_raster_threshold
        self.low_text_chars_threshold = low_text_chars_threshold
    
    def analyze_pdf(self, pdf_path: Optional[str] = None, pdf_bytes: Optional[bytes] = None) -> Dict[str, Any]:
        """
        Analyze a PDF file and return per-page routing metadata.
        
        Args:
            pdf_path: Path to PDF file (if provided)
            pdf_bytes: PDF file content as bytes (if provided, takes precedence)
            
        Returns:
            Dictionary with:
            - pdf_path: Original PDF path (or "stream" if bytes provided)
            - page_count: Number of pages
            - has_acroform: Document-level AcroForm flag
            - pages: List of page metadata dicts
            - summary: Summary statistics
        """
        if pdf_bytes is not None:
            # Open from bytes stream
            doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
            source_path = pdf_path or "stream"
        elif pdf_path and os.path.exists(pdf_path):
            # Open from file path
            doc = fitz.open(pdf_path)
            source_path = pdf_path
        else:
            raise ValueError("Either pdf_path (existing file) or pdf_bytes must be provided")
        
        try:
            # Document-level metadata
            has_acroform = self._check_acroform(doc)
            page_count = len(doc)
            
            # Analyze each page
            pages = []
            for page_idx in range(page_count):
                page = doc[page_idx]
                page_metadata = self._analyze_page(page, page_idx, has_acroform)
                pages.append(page_metadata)
            
            # Compute summary
            summary = self._compute_summary(pages)
            
            result = {
                "pdf_path": source_path,
                "page_count": page_count,
                "has_acroform": has_acroform,
                "pages": pages,
                "summary": summary
            }
            
            return result
            
        finally:
            doc.close()
    
    def _check_acroform(self, doc: fitz.Document) -> bool:
        """
        Check if PDF has AcroForm fields (document-level).
        
        Note: We compute this but DO NOT use it for routing in Phase A.
        
        Args:
            doc: PyMuPDF document
            
        Returns:
            True if AcroForm fields detected, False otherwise
        """
        try:
            # Check for form fields
            if doc.is_form_pdf:
                return True
            
            # Also check metadata
            metadata = doc.metadata
            if metadata and metadata.get("form", "").lower() in ["acroform", "xfdf"]:
                return True
            
            return False
        except Exception as e:
            logger.debug(f"Error checking AcroForm: {e}")
            return False
    
    def _analyze_page(
        self, 
        page: fitz.Page, 
        page_index: int,
        has_acroform: bool
    ) -> Dict[str, Any]:
        """
        Analyze a single PDF page and compute routing metadata.
        
        Args:
            page: PyMuPDF page object
            page_index: 0-based page index
            has_acroform: Document-level AcroForm flag
            
        Returns:
            Dictionary with page metadata including routing decision
        """
        # Page dimensions
        rect = page.rect
        width = rect.width
        height = rect.height
        page_area = width * height
        
        # Rotation (if available)
        rotation = page.rotation
        
        # Text statistics
        text_stats = self._compute_text_stats(page, page_area)
        
        # Drawing statistics
        drawing_stats = self._compute_drawing_stats(page)
        
        # Image statistics
        image_stats = self._compute_image_stats(page, page_area)
        
        # Routing decision
        route_decision = self._decide_route(text_stats, image_stats)
        
        return {
            "page_index": page_index,
            "width": width,
            "height": height,
            "rotation": rotation,
            "has_acroform": has_acroform,
            "text_stats": text_stats,
            "drawing_stats": drawing_stats,
            "image_stats": image_stats,
            "route_mode": route_decision["mode"],
            "route_reasons": route_decision["reasons"],
            "confidence": route_decision["confidence"]
        }
    
    def _compute_text_stats(
        self, 
        page: fitz.Page, 
        page_area: float
    ) -> Dict[str, Any]:
        """
        Compute text extraction statistics from page.
        
        Uses page.get_text("dict") to get text blocks with bounding boxes.
        
        Args:
            page: PyMuPDF page
            page_area: Total page area in PDF units
            
        Returns:
            Dictionary with text statistics
        """
        try:
            text_dict = page.get_text("dict")
            
            num_text_blocks = len(text_dict.get("blocks", []))
            num_text_spans = 0
            num_chars = 0
            num_words = 0
            text_bbox_area = 0.0
            
            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:  # 0 = text block
                    continue
                
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        num_text_spans += 1
                        text = span.get("text", "")
                        num_chars += len(text)
                        
                        # Approximate word count (split on whitespace)
                        words = text.split()
                        num_words += len(words)
                        
                        # Get bounding box
                        bbox = span.get("bbox", [0, 0, 0, 0])
                        if len(bbox) == 4:
                            span_width = abs(bbox[2] - bbox[0])
                            span_height = abs(bbox[3] - bbox[1])
                            text_bbox_area += span_width * span_height
            
            # Text coverage ratio
            text_coverage_ratio = text_bbox_area / page_area if page_area > 0 else 0.0
            
            return {
                "num_text_blocks": num_text_blocks,
                "num_text_spans": num_text_spans,
                "num_chars": num_chars,
                "num_words": num_words,
                "text_coverage_ratio": round(text_coverage_ratio, 6)
            }
            
        except Exception as e:
            logger.warning(f"Error computing text stats: {e}")
            return {
                "num_text_blocks": 0,
                "num_text_spans": 0,
                "num_chars": 0,
                "num_words": 0,
                "text_coverage_ratio": 0.0
            }
    
    def _compute_drawing_stats(self, page: fitz.Page) -> Dict[str, Any]:
        """
        Compute drawing/vector statistics from page.
        
        Uses page.get_drawings() to analyze vector graphics.
        
        Args:
            page: PyMuPDF page
            
        Returns:
            Dictionary with drawing statistics
        """
        try:
            drawings = page.get_drawings()
            num_drawings = len(drawings)
            num_rects = 0
            num_lines = 0
            
            for drawing in drawings:
                items = drawing.get("items", [])
                for item in items:
                    item_type = item[0]  # First element is type
                    if item_type == "re":  # rectangle
                        num_rects += 1
                    elif item_type == "l":  # line
                        num_lines += 1
            
            return {
                "num_drawings": num_drawings,
                "num_rects": num_rects,
                "num_lines": num_lines
            }
            
        except Exception as e:
            logger.warning(f"Error computing drawing stats: {e}")
            return {
                "num_drawings": 0,
                "num_rects": 0,
                "num_lines": 0
            }
    
    def _compute_image_stats(
        self, 
        page: fitz.Page, 
        page_area: float
    ) -> Dict[str, Any]:
        """
        Compute image statistics from page.
        
        Uses page.get_images(full=True) to get image information.
        Also checks text dict for image blocks.
        
        Args:
            page: PyMuPDF page
            page_area: Total page area in PDF units
            
        Returns:
            Dictionary with image statistics
        """
        try:
            # Get images from page
            images = page.get_images(full=True)
            num_images = len(images)
            
            # Also check text dict for image blocks
            text_dict = page.get_text("dict")
            image_blocks = [
                block for block in text_dict.get("blocks", [])
                if block.get("type") == 1  # 1 = image block
            ]
            num_images += len(image_blocks)
            
            # Estimate raster area coverage
            raster_area = 0.0
            
            # Sum up image bounding boxes from image blocks
            for block in image_blocks:
                bbox = block.get("bbox", [0, 0, 0, 0])
                if len(bbox) == 4:
                    img_width = abs(bbox[2] - bbox[0])
                    img_height = abs(bbox[3] - bbox[1])
                    raster_area += img_width * img_height
            
            # For images from get_images(), we don't have easy bbox access
            # So we estimate based on image count and typical sizes
            # This is approximate - could be improved with more detailed analysis
            if num_images > 0 and raster_area == 0:
                # Rough estimate: assume images cover some portion
                # This is a heuristic - actual implementation would need
                # to extract image dimensions from XObject references
                estimated_area_per_image = page_area * 0.1  # Assume 10% per image
                raster_area = min(num_images * estimated_area_per_image, page_area)
            
            raster_area_ratio = raster_area / page_area if page_area > 0 else 0.0
            
            return {
                "num_images": num_images,
                "raster_area_ratio": round(raster_area_ratio, 6)
            }
            
        except Exception as e:
            logger.warning(f"Error computing image stats: {e}")
            return {
                "num_images": 0,
                "raster_area_ratio": 0.0
            }
    
    def _decide_route(
        self,
        text_stats: Dict[str, Any],
        image_stats: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Decide routing mode (TEXT_VECTOR or OCR) based on heuristics.
        
        Heuristics:
        1. If text_chars >= threshold AND text_coverage >= threshold => TEXT_VECTOR
        2. If text_chars < very_low_threshold => OCR
        3. If high raster_area AND low text => OCR
        4. Default: TEXT_VECTOR (if we have some text)
        
        Args:
            text_stats: Text statistics dict
            image_stats: Image statistics dict
            
        Returns:
            Dictionary with:
            - mode: "TEXT_VECTOR" or "OCR"
            - reasons: List of reason strings
            - confidence: 0.0-1.0 confidence score
        """
        num_chars = text_stats.get("num_chars", 0)
        text_coverage = text_stats.get("text_coverage_ratio", 0.0)
        num_images = image_stats.get("num_images", 0)
        raster_area_ratio = image_stats.get("raster_area_ratio", 0.0)
        
        reasons = []
        confidence = 0.5  # Default confidence
        
        # Heuristic 1: Very low text => OCR
        if num_chars < self.low_text_chars_threshold:
            reasons.append("low_text_chars")
            confidence = 0.9
            return {
                "mode": "OCR",
                "reasons": reasons,
                "confidence": confidence
            }
        
        # Heuristic 2: High raster + low text => OCR
        if (num_images > 0 and 
            raster_area_ratio > self.high_raster_threshold and 
            num_chars < self.text_char_threshold):
            reasons.append("high_raster_area")
            reasons.append("low_text_chars")
            confidence = 0.85
            return {
                "mode": "OCR",
                "reasons": reasons,
                "confidence": confidence
            }
        
        # Heuristic 3: Sufficient text => TEXT_VECTOR
        if (num_chars >= self.text_char_threshold and 
            text_coverage >= self.text_coverage_threshold):
            reasons.append("sufficient_text_chars")
            reasons.append("sufficient_text_coverage")
            confidence = 0.95
            return {
                "mode": "TEXT_VECTOR",
                "reasons": reasons,
                "confidence": confidence
            }
        
        # Heuristic 4: Moderate text => TEXT_VECTOR (with lower confidence)
        if num_chars >= self.text_char_threshold:
            reasons.append("sufficient_text_chars")
            reasons.append("low_text_coverage")
            confidence = 0.75
            return {
                "mode": "TEXT_VECTOR",
                "reasons": reasons,
                "confidence": confidence
            }
        
        # Heuristic 5: Some text but below threshold => OCR
        if num_chars > 0:
            reasons.append("low_text_chars")
            confidence = 0.7
            return {
                "mode": "OCR",
                "reasons": reasons,
                "confidence": confidence
            }
        
        # Fallback: No text at all => OCR
        reasons.append("no_text")
        confidence = 0.95
        return {
            "mode": "OCR",
            "reasons": reasons,
            "confidence": confidence
        }
    
    def _compute_summary(self, pages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compute summary statistics across all pages.
        
        Args:
            pages: List of page metadata dicts
            
        Returns:
            Dictionary with summary statistics
        """
        if not pages:
            return {
                "total_pages": 0,
                "text_vector_count": 0,
                "ocr_count": 0,
                "avg_text_chars": 0.0,
                "avg_text_coverage": 0.0,
                "avg_raster_area_ratio": 0.0
            }
        
        text_vector_count = sum(1 for p in pages if p.get("route_mode") == "TEXT_VECTOR")
        ocr_count = sum(1 for p in pages if p.get("route_mode") == "OCR")
        
        total_text_chars = sum(p.get("text_stats", {}).get("num_chars", 0) for p in pages)
        total_text_coverage = sum(p.get("text_stats", {}).get("text_coverage_ratio", 0.0) for p in pages)
        total_raster_area = sum(p.get("image_stats", {}).get("raster_area_ratio", 0.0) for p in pages)
        
        return {
            "total_pages": len(pages),
            "text_vector_count": text_vector_count,
            "ocr_count": ocr_count,
            "avg_text_chars": round(total_text_chars / len(pages), 2),
            "avg_text_coverage": round(total_text_coverage / len(pages), 6),
            "avg_raster_area_ratio": round(total_raster_area / len(pages), 6)
        }
    
    def save_routing_json(
        self, 
        routing_data: Dict[str, Any], 
        output_dir: str = "/workspace/pdfs/phase_a_routing"
    ) -> str:
        """
        Save routing metadata to JSON file.
        
        Args:
            routing_data: Routing data from analyze_pdf()
            output_dir: Output directory (default: /workspace/pdfs/phase_a_routing)
            
        Returns:
            Path to saved JSON file
        """
        # Create output directory if needed
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate output filename
        pdf_path = routing_data["pdf_path"]
        pdf_basename = Path(pdf_path).stem
        output_path = os.path.join(output_dir, f"{pdf_basename}.routing.json")
        
        # Write JSON
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(routing_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved routing metadata to: {output_path}")
        return output_path
