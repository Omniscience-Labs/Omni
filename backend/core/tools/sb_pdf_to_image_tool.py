"""
PDF to image tool. Use only when the user explicitly asks to convert a PDF to images
(e.g. "convert this pdf to img", "turn this pdf into images").
"""

import os
from typing import List, Optional

from core.agentpress.tool import ToolResult, openapi_schema, usage_example
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None  # type: ignore

MAX_PAGES = 100  # Limit for efficiency
DEFAULT_DPI = 150  # Good balance of quality and size


class SandboxPdfToImageTool(SandboxToolsBase):
    """Converts a PDF file to PNG images (one per page). Only use when user explicitly asks to convert PDF to images."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.workspace_path = "/workspace"

    def _pdf_to_image_bytes(self, pdf_bytes: bytes) -> List[bytes]:
        """Render each PDF page to PNG bytes. Returns list of PNG bytes per page."""
        if fitz is None:
            return []
        out: List[bytes] = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            page_count = len(doc)
            if page_count > MAX_PAGES:
                page_count = MAX_PAGES
            for i in range(page_count):
                page = doc.load_page(i)
                zoom = DEFAULT_DPI / 72.0
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                out.append(pix.tobytes(output="png"))
        finally:
            doc.close()
        return out

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "convert_pdf_to_images",
            "description": "Convert a PDF file to PNG images (one image per page). ONLY use when the user explicitly asks to convert a PDF to images (e.g. 'convert this pdf to img', 'turn this pdf into images', 'export pdf pages as images'). Do not use for viewing or reading the PDF—use other tools for that.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "Path to the PDF file in the workspace, relative to /workspace (e.g. 'docs/report.pdf', 'output.pdf')."
                    },
                    "output_dir": {
                        "type": "string",
                        "description": "Optional. Directory to save the images, relative to /workspace. If omitted, images are saved in the same directory as the PDF with prefix from the PDF filename (e.g. report.pdf -> report_page_1.png, report_page_2.png)."
                    }
                },
                "required": ["pdf_path"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="convert_pdf_to_images">
        <parameter name="pdf_path">docs/report.pdf</parameter>
        </invoke>
        </function_calls>
        <function_calls>
        <invoke name="convert_pdf_to_images">
        <parameter name="pdf_path">output.pdf</parameter>
        <parameter name="output_dir">output_images</parameter>
        </invoke>
        </function_calls>
        ''')
    async def convert_pdf_to_images(
        self,
        pdf_path: str,
        output_dir: Optional[str] = None,
    ) -> ToolResult:
        if fitz is None:
            return self.fail_response("PDF conversion is not available (PyMuPDF not installed).")
        try:
            await self._ensure_sandbox()
            cleaned = self.clean_path(pdf_path)
            if not cleaned.lower().endswith(".pdf"):
                return self.fail_response(f"File is not a PDF: '{cleaned}'.")
            full_path = f"{self.workspace_path}/{cleaned}"

            try:
                file_info = await self.sandbox.fs.get_file_info(full_path)
                if file_info.is_dir:
                    return self.fail_response(f"Path is a directory, not a file: '{cleaned}'.")
            except Exception:
                return self.fail_response(f"PDF file not found: '{cleaned}'.")

            pdf_bytes = await self.sandbox.fs.download_file(full_path)
            pages = self._pdf_to_image_bytes(pdf_bytes)
            if not pages:
                return self.fail_response(f"Could not convert PDF to images (invalid or empty PDF): '{cleaned}'.")

            base_name = os.path.splitext(os.path.basename(cleaned))[0]
            if output_dir is not None and output_dir.strip():
                out_cleaned = self.clean_path(output_dir.strip())
            else:
                out_cleaned = os.path.dirname(cleaned)
                if not out_cleaned:
                    out_cleaned = "."

            created: List[str] = []
            for i, png_bytes in enumerate(pages):
                rel_path = f"{out_cleaned}/{base_name}_page_{i + 1}.png".replace("\\", "/")
                if rel_path.startswith("/"):
                    rel_path = rel_path[1:]
                full_out = f"{self.workspace_path}/{rel_path}"
                await self.sandbox.fs.upload_file(png_bytes, full_out)
                created.append(rel_path)

            return self.success_response(
                f"Converted PDF '{cleaned}' to {len(created)} image(s): " + ", ".join(created)
            )
        except Exception as e:
            return self.fail_response(f"Failed to convert PDF to images: {str(e)}")
