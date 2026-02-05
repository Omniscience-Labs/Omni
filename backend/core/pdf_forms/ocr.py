"""
Extract text blocks from page images using AWS Textract.

Returns LINE (and optionally WORD) blocks with normalized bounding boxes (0-1)
for use with detector output or LLM analysis.
"""

from __future__ import annotations

import io
import os
from typing import List, Optional

from core.pdf_forms.types import LabelBlock
from core.tools.pdf_utils import RasterizedPage


def extract_text_blocks(
    page_images: List[RasterizedPage],
    *,
    region_name: Optional[str] = None,
    use_line_blocks_only: bool = True,
) -> List[LabelBlock]:
    """
    Run AWS Textract on each page image and return text blocks with normalized bboxes.

    Args:
        page_images: List of rasterized pages (from pdf_utils).
        region_name: AWS region for Textract (default: AWS_REGION or us-east-1).
        use_line_blocks_only: If True, return only LINE blocks; else include WORD blocks.

    Returns:
        List of LabelBlock with (page_index, text, bbox_normalized, block_type).
        bbox_normalized is (left, top, width, height) in 0-1.
    """
    import boto3
    from botocore.exceptions import ClientError

    region = region_name or os.environ.get("AWS_REGION", "us-east-1")
    client = boto3.client("textract", region_name=region)
    block_types = ["LINE"] if use_line_blocks_only else ["LINE", "WORD"]
    results: List[LabelBlock] = []

    for page in page_images:
        buf = io.BytesIO()
        page.image.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        try:
            response = client.detect_document_text(Document={"Bytes": image_bytes})
        except ClientError as e:
            raise RuntimeError(f"AWS Textract failed: {e}") from e

        blocks = response.get("Blocks") or []
        for block in blocks:
            block_type = block.get("BlockType")
            if block_type not in block_types:
                continue
            text = (block.get("Text") or "").strip()
            if not text:
                continue
            geom = block.get("Geometry")
            if not geom:
                continue
            bbox = geom.get("BoundingBox")
            if not bbox:
                continue
            # Textract: Left, Top, Width, Height (normalized 0-1)
            left = float(bbox.get("Left", 0))
            top = float(bbox.get("Top", 0))
            width = float(bbox.get("Width", 0))
            height = float(bbox.get("Height", 0))
            results.append(LabelBlock(
                page_index=page.page_index,
                text=text,
                bbox_normalized=(left, top, width, height),
                block_type=block_type,
            ))
    return results
