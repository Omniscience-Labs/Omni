"""
PDF Form Processing Tool

Provides tools for analyzing and processing PDF forms, including Phase A
page routing for determining optimal processing strategy per page.
"""

from typing import Optional
from pathlib import Path
import os

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.tools.pdf_form.phase_a_page_router import PhaseAPageRouter


@tool_metadata(
    display_name="PDF Form Processor",
    description="Analyze and process PDF forms with intelligent page routing",
    icon="FileText",
    color="bg-purple-100 dark:bg-purple-800/50",
    weight=210,
    visible=True
)
class SandboxPdfFormTool(SandboxToolsBase):
    """Tool for PDF form analysis and processing in a Daytona sandbox."""
    
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.router = PhaseAPageRouter()
    
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "phase_a_route_pdf",
            "description": "Phase A: Analyze PDF pages and determine routing strategy (TEXT_VECTOR vs OCR) for each page. Returns per-page metadata including text stats, drawing stats, image stats, and routing decisions. Saves routing JSON to /workspace/pdfs/phase_a_routing/",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "Path to PDF file relative to /workspace (e.g., 'pdfs/document.pdf')"
                    }
                },
                "required": ["pdf_path"]
            }
        }
    })
    async def phase_a_route_pdf(self, pdf_path: str) -> ToolResult:
        """
        Phase A: Analyze PDF and route pages to TEXT_VECTOR or OCR processing.
        
        For each page, computes:
        - Text statistics (blocks, spans, chars, words, coverage)
        - Drawing statistics (drawings, rects, lines)
        - Image statistics (count, raster area ratio)
        - Route decision (TEXT_VECTOR or OCR) with confidence and reasons
        
        Args:
            pdf_path: Path to PDF file relative to /workspace
            
        Returns:
            ToolResult with routing metadata JSON
        """
        try:
            await self._ensure_sandbox()
            
            # Clean and resolve path
            pdf_path = self.clean_path(pdf_path)
            full_path = f"{self.workspace_path}/{pdf_path}"
            
            # Check if file exists
            try:
                await self.sandbox.fs.get_file_info(full_path)
            except Exception:
                return self.fail_response(f"PDF file not found: {pdf_path}")
            
            # Download PDF bytes for analysis
            pdf_bytes = await self.sandbox.fs.download_file(full_path)
            
            # Analyze PDF using bytes stream
            logger.info(f"Analyzing PDF for routing: {pdf_path}")
            routing_data = self.router.analyze_pdf(pdf_path=pdf_path, pdf_bytes=pdf_bytes)
            
            # Update pdf_path in routing data to use workspace-relative path
            routing_data["pdf_path"] = pdf_path
            
            # Save routing JSON to workspace
            output_dir = f"{self.workspace_path}/pdfs/phase_a_routing"
            saved_path = self.router.save_routing_json(routing_data, output_dir)
            
            # Get relative path for response
            relative_saved_path = saved_path.replace(self.workspace_path + "/", "")
            
            return self.success_response({
                "message": f"Successfully analyzed PDF: {pdf_path}",
                "routing_data": routing_data,
                "routing_json_path": relative_saved_path
            })
                    
        except Exception as e:
            logger.error(f"Error in phase_a_route_pdf: {e}", exc_info=True)
            return self.fail_response(f"Error analyzing PDF: {str(e)}")
