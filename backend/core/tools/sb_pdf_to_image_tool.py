"""
PDF-to-Image sandbox tool: convert a PDF (sandbox path or URL) to per-page images.

Uses shared rasterization from core.tools.pdf_utils (PyMuPDF, async API).
Output: base64-encoded PNGs or paths in sandbox (.pdf_pages/).
"""

from __future__ import annotations

import base64
import io
from typing import Optional, Union

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.agentpress.thread_manager import ThreadManager
from core.sandbox.tool_base import SandboxToolsBase
from core.tools.pdf_utils import (
    PDFRasterizationError,
    pdf_to_page_images_async,
    RasterizedPage,
    DEFAULT_MAX_SIZE,
    DEFAULT_URL_MAX_BYTES,
    DEFAULT_URL_TIMEOUT_SEC,
)
from core.utils.logger import logger


@tool_metadata(
    display_name="PDF to Images",
    description="Convert a PDF to page images. Accepts a sandbox path or URL. Useful for previews, OCR, or form processing.",
    icon="FileImage",
    color="bg-blue-100 dark:bg-blue-800/50",
    weight=45,
    visible=True,
)
class SandboxPdfToImageTool(SandboxToolsBase):
    """Tool to convert a PDF file (sandbox path or URL) to a list of page images."""

    def __init__(self, project_id: str, thread_manager: Optional[ThreadManager] = None):
        super().__init__(project_id, thread_manager)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "pdf_to_images",
            "description": "Convert a PDF file to a list of page images. Accepts a sandbox path (relative to /workspace) or a URL (http/https). Useful for previews, OCR, or form processing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "Path to the PDF in the sandbox (e.g. 'documents/form.pdf') or a URL (http/https).",
                    },
                    "max_size": {
                        "type": "integer",
                        "description": "Long edge of each page image in pixels (default 1600).",
                    },
                    "dpi": {
                        "type": "integer",
                        "description": "DPI for rasterization; if not set, resolution is driven by max_size.",
                    },
                    "output_format": {
                        "type": "string",
                        "description": "Response format: 'base64' (inline base64-encoded PNG images) or 'sandbox_paths' (write PNGs to sandbox and return paths). Default: 'base64'.",
                    },
                },
                "required": ["pdf_path"],
            },
        },
    })
    async def pdf_to_images(
        self,
        pdf_path: str,
        max_size: Optional[int] = None,
        dpi: Optional[int] = None,
        output_format: str = "base64",
    ) -> ToolResult:
        try:
            if not (pdf_path and pdf_path.strip()):
                return self.fail_response("pdf_path is required and cannot be empty")

            of = (output_format or "base64").strip().lower()
            if of not in ("base64", "sandbox_paths"):
                return self.fail_response("output_format must be 'base64' or 'sandbox_paths'")

            is_url = pdf_path.strip().lower().startswith(("http://", "https://"))
            need_sandbox = not is_url or of == "sandbox_paths"
            if need_sandbox:
                await self._ensure_sandbox()

            if is_url:
                pdf_source: Union[str, bytes] = pdf_path.strip()
            else:
                cleaned = self.clean_path(pdf_path.strip())
                full_path = f"{self.workspace_path}/{cleaned}"
                try:
                    pdf_bytes = await self.sandbox.fs.download_file(full_path)
                except Exception as e:
                    logger.warning(f"Failed to download PDF from sandbox: {full_path}", exc_info=True)
                    return self.fail_response(f"PDF not found or failed to read in sandbox: {cleaned}")
                if not pdf_bytes or len(pdf_bytes) == 0:
                    return self.fail_response("PDF file is empty")
                pdf_source = pdf_bytes

            pages: list[RasterizedPage] = await pdf_to_page_images_async(
                pdf_source,
                max_size=max_size if max_size is not None else DEFAULT_MAX_SIZE,
                dpi=dpi,
                url_max_bytes=DEFAULT_URL_MAX_BYTES,
                url_timeout_sec=DEFAULT_URL_TIMEOUT_SEC,
            )

            result_list: list[dict] = []
            for page in pages:
                buf = io.BytesIO()
                page.image.save(buf, format="PNG")
                png_bytes = buf.getvalue()

                if of == "base64":
                    image_base64 = base64.b64encode(png_bytes).decode("ascii")
                    result_list.append({
                        "page_index": page.page_index,
                        "image_base64": image_base64,
                        "width_px": page.width_px,
                        "height_px": page.height_px,
                    })
                else:
                    full_path = f"{self.workspace_path}/.pdf_pages/page_{page.page_index}.png"
                    await self.sandbox.fs.upload_file(png_bytes, full_path)
                    result_list.append({
                        "page_index": page.page_index,
                        "path": full_path,
                        "width_px": page.width_px,
                        "height_px": page.height_px,
                    })

            return self.success_response({
                "pages": result_list,
                "total_pages": len(result_list),
            })

        except ValueError as e:
            return self.fail_response(str(e))
        except PDFRasterizationError as e:
            return self.fail_response(f"Rasterization failed: {e}")
        except Exception as e:
            logger.error("Failed to convert PDF to images", exc_info=True)
            return self.fail_response(f"Failed to convert PDF to images: {e!s}")
