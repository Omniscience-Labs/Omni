"""
Sandbox tool: Convert PDF pages to images for LLM vision.

Renders each PDF page to PNG/JPEG in the sandbox so the agent can load them
with load_image (Image Vision tool). Respects size limits and page caps for
reliable, fast conversion.
"""

import os
import re
from io import BytesIO
from typing import List, Optional, Tuple

from PIL import Image
from core.agentpress.tool import ToolResult, openapi_schema
from core.agentpress.thread_manager import ThreadManager
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger

# Limits (aligned with vision tool constraints)
MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024  # 50MB
MAX_PAGES_TO_CONVERT = 50
DEFAULT_MAX_PAGES = 20
MAX_IMAGE_DIMENSION = 1920  # match vision tool DEFAULT_MAX_WIDTH/HEIGHT
JPEG_QUALITY = 85
PNG_COMPRESS_LEVEL = 6
OUTPUT_DIR = "uploads"


def _sanitize_basename(name: str) -> str:
    """Safe filename prefix (no path, no problematic chars)."""
    base = os.path.basename(name)
    base, _ = os.path.splitext(base)
    base = re.sub(r"[^\w\-.]", "_", base)[:80]
    return base or "pdf"


class SandboxPdfToImagesTool(SandboxToolsBase):
    """Converts a PDF in the sandbox to one image per page, saved under uploads/."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    def _render_pdf_pages_to_images(
        self,
        pdf_bytes: bytes,
        first_n_pages: Optional[int],
        max_pages: int,
        max_dimension: int,
        jpeg_quality: int,
        use_jpeg: bool,
    ) -> List[Tuple[bytes, str]]:
        """
        Render PDF to list of (image_bytes, mime_type) per page.
        Uses PyMuPDF (fitz); resizes so no side exceeds max_dimension.
        """
        import fitz

        results: List[Tuple[bytes, str]] = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        try:
            total = len(doc)
            if total == 0:
                return results
            n_convert = total
            if first_n_pages is not None:
                n_convert = min(n_convert, max(1, first_n_pages))
            n_convert = min(n_convert, max_pages)

            for page_index in range(n_convert):
                page = doc[page_index]
                rect = page.rect
                w, h = int(rect.width), int(rect.height)
                if w <= 0 or h <= 0:
                    continue
                zoom = 1.0
                if max(w, h) > max_dimension:
                    zoom = max_dimension / max(w, h)
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                samples = pix.samples
                img = Image.frombytes("RGB", (pix.width, pix.height), samples)

                out = BytesIO()
                if use_jpeg:
                    img.save(out, format="JPEG", quality=jpeg_quality, optimize=True)
                    mime = "image/jpeg"
                else:
                    img.save(out, format="PNG", optimize=True, compress_level=PNG_COMPRESS_LEVEL)
                    mime = "image/png"
                results.append((out.getvalue(), mime))
        finally:
            doc.close()

        return results

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "convert_pdf_to_images",
            "description": """Convert a PDF file in the workspace to one image per page so you can view and analyze it with the Image Vision tool (load_image).

The images are saved under uploads/<basename>_pdf_page_1.png (or .jpg). You can then call load_image on up to 3 of these paths at a time to add them to context for the LLM.

Use this when the user uploads or references a PDF and you need to 'see' its contents. For multi-page PDFs, convert first then load the most relevant pages (e.g. first page, or specific page numbers).""",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file relative to /workspace (e.g. 'uploads/document.pdf').",
                    },
                    "first_n_pages": {
                        "type": "integer",
                        "description": "Convert only the first N pages (default: all pages, up to max_pages). Use e.g. 3 to only convert the first 3 pages.",
                    },
                    "max_pages": {
                        "type": "integer",
                        "description": "Maximum number of pages to convert (default 20). Caps conversion for large PDFs.",
                        "default": 20,
                    },
                    "max_dimension": {
                        "type": "integer",
                        "description": "Maximum width or height of each page image in pixels (default 1920). Keeps images within vision tool limits.",
                        "default": 1920,
                    },
                    "use_jpeg": {
                        "type": "boolean",
                        "description": "If true, output JPEG instead of PNG (smaller files, slightly lower quality). Default false.",
                        "default": False,
                    },
                },
                "required": ["file_path"],
            },
        },
    })
    async def convert_pdf_to_images(
        self,
        file_path: str,
        first_n_pages: Optional[int] = None,
        max_pages: int = DEFAULT_MAX_PAGES,
        max_dimension: int = MAX_IMAGE_DIMENSION,
        use_jpeg: bool = False,
    ) -> ToolResult:
        """Convert PDF in sandbox to page images; return list of paths for load_image."""
        try:
            await self._ensure_sandbox()

            cleaned = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{cleaned}"

            if not cleaned.lower().endswith(".pdf"):
                return self.fail_response(
                    f"File is not a PDF: '{cleaned}'. Only .pdf files are supported."
                )

            try:
                file_info = await self.sandbox.fs.get_file_info(full_path)
                if file_info.is_dir:
                    return self.fail_response(f"Path is a directory, not a file: '{cleaned}'")
                if file_info.size > MAX_PDF_SIZE_BYTES:
                    return self.fail_response(
                        f"PDF is too large ({file_info.size / (1024 * 1024):.1f}MB). "
                        f"Maximum size is {MAX_PDF_SIZE_BYTES / (1024 * 1024):.0f}MB."
                    )
            except Exception as e:
                return self.fail_response(f"PDF file not found at '{cleaned}': {e}")

            pdf_bytes = await self.sandbox.fs.download_file(full_path)

            max_pages = max(1, min(max_pages, MAX_PAGES_TO_CONVERT))
            max_dimension = max(256, min(max_dimension, 4096))
            jpeg_quality = max(50, min(95, JPEG_QUALITY))

            try:
                page_images = self._render_pdf_pages_to_images(
                    pdf_bytes,
                    first_n_pages=first_n_pages,
                    max_pages=max_pages,
                    max_dimension=max_dimension,
                    jpeg_quality=jpeg_quality,
                    use_jpeg=use_jpeg,
                )
            except Exception as e:
                logger.exception("PDF render failed")
                return self.fail_response(
                    f"Failed to convert PDF to images: {e}. "
                    "The file may be encrypted, corrupted, or not a valid PDF."
                )

            if not page_images:
                return self.fail_response(
                    "No pages could be converted. The PDF may be empty or invalid."
                )

            ext = "jpg" if use_jpeg else "png"
            basename = _sanitize_basename(cleaned)
            output_dir_clean = OUTPUT_DIR.strip("/")
            image_paths: List[str] = []

            for i, (img_bytes, _mime) in enumerate(page_images):
                page_num = i + 1
                filename = f"{basename}_pdf_page_{page_num}.{ext}"
                rel_path = f"{output_dir_clean}/{filename}"
                full_out = f"{self.workspace_path}/{rel_path}"

                try:
                    await self.sandbox.fs.upload_file(img_bytes, full_out)
                    image_paths.append(rel_path)
                except Exception as e:
                    logger.warning("Failed to upload page image %s: %s", rel_path, e)
                    return self.fail_response(
                        f"Converted page {page_num} but failed to save image: {e}"
                    )

            total_pages = len(page_images)
            note = (
                f"Use load_image with paths like '{image_paths[0]}' to add pages to context "
                "(max 3 images at a time)."
            )
            return self.success_response({
                "message": f"Converted {total_pages} page(s) of PDF to images.",
                "image_paths": image_paths,
                "total_pages": total_pages,
                "output_dir": f"{output_dir_clean}/",
                "note": note,
            })

        except Exception as e:
            logger.exception("convert_pdf_to_images error")
            return self.fail_response(f"Unexpected error converting PDF: {e}")
