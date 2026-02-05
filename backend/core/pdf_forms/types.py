"""
Shared data structures for PDF form detection and OCR.

All bounding boxes use normalized coordinates (0-1): (left, top, width, height)
for consistency with AWS Textract and downstream LLM or matcher use.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Tuple


@dataclass
class BlankField:
    """A detected empty form field (text box, checkbox, or signature)."""

    page_index: int
    """0-based page number."""

    bbox_normalized: Tuple[float, float, float, float]
    """(left, top, width, height) in normalized 0-1 coordinates."""

    class_id: int
    """0=text field, 1=checkbox, 2=signature."""

    confidence: float
    """Detection confidence from the model (0-1)."""


@dataclass
class LabelBlock:
    """A text block from OCR (e.g. one line) with position."""

    page_index: int
    """0-based page number."""

    text: str
    """Extracted text (e.g. line or word)."""

    bbox_normalized: Tuple[float, float, float, float]
    """(left, top, width, height) in normalized 0-1 coordinates."""

    block_type: str
    """e.g. 'LINE' or 'WORD' (Textract block type)."""


@dataclass
class MatchedField:
    """A blank field paired with a label (for future matcher or LLM use)."""

    label: str
    bbox_normalized: Tuple[float, float, float, float]
    field_type: Literal["text", "checkbox", "signature"]
    page_index: int
    confidence: float = 0.0
