"""
PDF form field detection and OCR for non-interactive PDFs.

Provides normalized JSON-friendly output from FFDNet (blanks) and AWS Textract (labels)
for downstream LLM analysis or matching.
"""

from core.pdf_forms.types import BlankField, LabelBlock, MatchedField
from core.pdf_forms.detector import detect_form_fields
from core.pdf_forms.ocr import extract_text_blocks

__all__ = [
    "BlankField",
    "LabelBlock",
    "MatchedField",
    "detect_form_fields",
    "extract_text_blocks",
]
