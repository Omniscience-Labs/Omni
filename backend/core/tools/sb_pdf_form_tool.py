"""
PDF Form Tool for analyzing and processing PDF forms in the sandbox.

Provides document inspection and classification capabilities.
"""

import os
import json
import tempfile
from typing import Optional, Dict, Any
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from core.utils.config import config
from core.tools.pdf_inspection import inspect_pdf
from core.tools.pdf_extraction import (
    extract_acroform_fields,
    extract_textract_candidates,
    assign_labels_to_acroform_fields,
    build_field_candidates
)


@tool_metadata(
    display_name="PDF Form Analyzer",
    description="Analyze and inspect PDF forms to understand their structure and classification",
    icon="FileText",
    color="bg-indigo-100 dark:bg-indigo-800/50",
    weight=60,
    visible=True
)
class SandboxPdfFormTool(SandboxToolsBase):
    """Tool for analyzing PDF forms in a Daytona sandbox."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    async def _download_pdf_to_temp(self, pdf_path: str) -> str:
        """
        Download PDF from sandbox to a temporary file.
        
        Args:
            pdf_path: Path to PDF in sandbox (relative to /workspace)
            
        Returns:
            Path to temporary file
            
        Raises:
            Exception: If file cannot be downloaded
        """
        await self._ensure_sandbox()
        
        cleaned_path = self.clean_path(pdf_path)
        full_path = f"{self.workspace_path}/{cleaned_path}"
        
        # Check if file exists
        try:
            file_info = await self.sandbox.fs.get_file_info(full_path)
            if file_info.is_dir:
                raise ValueError(f"Path '{cleaned_path}' is a directory, not a PDF file")
        except Exception as e:
            raise ValueError(f"PDF file not found at path: '{cleaned_path}' - {str(e)}")
        
        # Download file content
        pdf_bytes = await self.sandbox.fs.download_file(full_path)
        
        # Write to temporary file
        temp_fd, temp_path = tempfile.mkstemp(suffix='.pdf')
        try:
            with os.fdopen(temp_fd, 'wb') as f:
                f.write(pdf_bytes)
            return temp_path
        except Exception:
            os.close(temp_fd)
            raise

    async def _save_inspection_json(self, pdf_path: str, inspection_result: dict) -> Optional[str]:
        """
        Optionally save inspection result as a sidecar JSON file.
        
        Args:
            pdf_path: Original PDF path in sandbox
            inspection_result: Inspection result dictionary
            
        Returns:
            Path to saved JSON file in sandbox, or None if save failed
        """
        try:
            await self._ensure_sandbox()
            
            # Create /workspace/pdfs directory if it doesn't exist
            pdfs_dir = f"{self.workspace_path}/pdfs"
            try:
                await self.sandbox.fs.create_folder(pdfs_dir, "755")
            except Exception:
                # Directory might already exist, that's fine
                pass
            
            # Generate JSON filename from PDF basename
            pdf_basename = os.path.basename(pdf_path)
            json_basename = os.path.splitext(pdf_basename)[0] + ".inspection.json"
            json_path = f"{pdfs_dir}/{json_basename}"
            
            # Upload JSON content
            json_content = json.dumps(inspection_result, indent=2)
            await self.sandbox.fs.upload_file(json_content.encode('utf-8'), json_path)
            
            logger.debug(f"Saved inspection JSON to {json_path}")
            return json_path
            
        except Exception as e:
            logger.warning(f"Failed to save inspection JSON: {e}")
            return None

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "analyze_pdf",
            "description": "Analyze a PDF file to inspect its structure, detect form fields, and classify the document type. Returns detailed metadata about pages, AcroForm fields, widgets, text content, and images. Can also extract field candidates with labels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "Path to the PDF file relative to /workspace (e.g., 'documents/form.pdf' or 'pdfs/application.pdf')"
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["inspect", "candidates", "both"],
                        "description": "Analysis mode: 'inspect' for structure inspection only, 'candidates' for field extraction with labels, 'both' for complete analysis",
                        "default": "inspect"
                    },
                    "use_textract": {
                        "type": "boolean",
                        "description": "Whether to use AWS Textract for visual form understanding and label assignment. Required for 'candidates' mode on non-AcroForm PDFs.",
                        "default": False
                    },
                    "save_inspection_json": {
                        "type": "boolean",
                        "description": "Whether to save the inspection result as a JSON file in /workspace/pdfs/",
                        "default": False
                    },
                    "s3_bucket": {
                        "type": "string",
                        "description": "S3 bucket name for Textract processing (optional, defaults to AWS_TEXTRACT_S3_BUCKET from environment)"
                    },
                    "s3_prefix": {
                        "type": "string",
                        "description": "S3 prefix for temporary files (optional, defaults to AWS_TEXTRACT_S3_PREFIX from environment)"
                    },
                    "aws_region": {
                        "type": "string",
                        "description": "AWS region for Textract (optional, defaults to AWS_TEXTRACT_REGION from environment)"
                    }
                },
                "required": ["pdf_path"]
            }
        }
    })
    async def analyze_pdf(
        self,
        pdf_path: str,
        mode: str = "inspect",
        use_textract: bool = False,
        save_inspection_json: bool = False,
        s3_bucket: Optional[str] = None,
        s3_prefix: Optional[str] = None,
        aws_region: Optional[str] = None
    ) -> ToolResult:
        """
        Analyze a PDF file to inspect its structure and extract field candidates.
        
        This performs a deterministic inspection using PyMuPDF and pypdf to:
        - Count pages and measure dimensions
        - Detect AcroForm fields
        - Identify widget annotations per page
        - Extract text content per page
        - Analyze image content per page
        - Classify document type (acroform/overlay/hybrid/scanned)
        
        In 'candidates' or 'both' mode, also:
        - Extracts AcroForm fields with stable names
        - Uses Textract for visual form understanding (if enabled)
        - Assigns human-readable labels to fields
        - Builds canonical field candidate JSON
        
        Args:
            pdf_path: Path to PDF file in sandbox (relative to /workspace)
            mode: Analysis mode ("inspect", "candidates", or "both")
            use_textract: Whether to use AWS Textract for visual understanding
            save_inspection_json: If True, saves inspection result to /workspace/pdfs/
            s3_bucket: S3 bucket for Textract processing (optional, defaults to AWS_TEXTRACT_S3_BUCKET from .env)
            s3_prefix: S3 prefix for temporary files (optional, defaults to AWS_TEXTRACT_S3_PREFIX from .env)
            aws_region: AWS region for Textract (optional, defaults to AWS_TEXTRACT_REGION from .env)
            
        Returns:
            ToolResult with inspection and/or candidate data
        """
        temp_pdf_path = None
        try:
            # Download PDF to temporary file
            temp_pdf_path = await self._download_pdf_to_temp(pdf_path)
            
            # Always perform inspection first
            inspection_result = inspect_pdf(temp_pdf_path)
            
            # Optionally save inspection JSON
            if save_inspection_json:
                saved_path = await self._save_inspection_json(pdf_path, inspection_result)
                if saved_path:
                    inspection_result["inspection_json_path"] = saved_path
            
            response_data = {
                "message": "",
                "inspection": inspection_result
            }
            
            candidates_result = None
            
            # Extract candidates if requested
            if mode in ["candidates", "both"]:
                # Use config defaults if not provided
                s3_bucket_param = s3_bucket or config.AWS_TEXTRACT_S3_BUCKET
                s3_prefix_param = s3_prefix or config.AWS_TEXTRACT_S3_PREFIX
                aws_region_param = aws_region or config.AWS_TEXTRACT_REGION
                
                candidates_result = await self._extract_candidates(
                    temp_pdf_path,
                    inspection_result,
                    use_textract,
                    s3_bucket_param,
                    s3_prefix_param,
                    aws_region_param
                )
                response_data["candidates"] = candidates_result
                
                if mode == "both":
                    # Build canonical output
                    canonical = build_field_candidates(
                        inspection_result,
                        candidates_result.get("acro_fields", []),
                        candidates_result.get("textract_data", {})
                    )
                    response_data["canonical"] = canonical
            
            # Format response message
            doc_type = inspection_result.get("doc_type", "unknown")
            page_count = inspection_result.get("page_count", 0)
            has_acroform = inspection_result.get("has_acroform", False)
            reason = inspection_result.get("reason", "")
            
            message = f"PDF analysis complete:\n"
            message += f"- Document type: {doc_type}\n"
            message += f"- Pages: {page_count}\n"
            message += f"- Has AcroForm: {has_acroform}\n"
            if has_acroform:
                field_count = inspection_result.get("acroform_field_count", 0)
                message += f"- AcroForm fields: {field_count}\n"
            message += f"- Classification reason: {reason}\n"
            
            if mode in ["candidates", "both"] and candidates_result:
                acro_fields = candidates_result.get("acro_fields", [])
                message += f"- Extracted {len(acro_fields)} AcroForm fields\n"
                if use_textract:
                    textract_data = candidates_result.get("textract_data", {})
                    kv_count = len(textract_data.get("key_values", []))
                    if kv_count > 0:
                        message += f"- Found {kv_count} Textract key-value pairs\n"
            
            if save_inspection_json and inspection_result.get("inspection_json_path"):
                message += f"\nInspection JSON saved to: {inspection_result['inspection_json_path']}"
            
            response_data["message"] = message
            
            return self.success_response(response_data)
            
        except FileNotFoundError as e:
            return self.fail_response(f"PDF file not found: {str(e)}")
        except ValueError as e:
            return self.fail_response(f"Invalid PDF or path: {str(e)}")
        except Exception as e:
            logger.error(f"Error analyzing PDF {pdf_path}: {e}", exc_info=True)
            return self.fail_response(f"Error analyzing PDF: {str(e)}")
        finally:
            # Clean up temporary file
            if temp_pdf_path and os.path.exists(temp_pdf_path):
                try:
                    os.unlink(temp_pdf_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp PDF file {temp_pdf_path}: {e}")
    
    async def _extract_candidates(
        self,
        pdf_path: str,
        inspection: Dict[str, Any],
        use_textract: bool,
        s3_bucket: Optional[str],
        s3_prefix: Optional[str],
        aws_region: Optional[str]
    ) -> Dict[str, Any]:
        """
        Extract field candidates from PDF.
        
        Args:
            pdf_path: Local path to PDF file
            inspection: Inspection result
            use_textract: Whether to use Textract
            s3_bucket: S3 bucket for Textract (optional, uses config if None)
            s3_prefix: S3 prefix (optional, uses config if None)
            aws_region: AWS region (optional, uses config if None)
            
        Returns:
            Dictionary with acro_fields and textract_data
        """
        result = {
            "acro_fields": [],
            "textract_data": {}
        }
        
        # Extract AcroForm fields
        has_acroform = inspection.get("has_acroform", False)
        if has_acroform:
            try:
                acro_fields = extract_acroform_fields(pdf_path)
                result["acro_fields"] = acro_fields
            except Exception as e:
                logger.warning(f"Error extracting AcroForm fields: {e}")
        
        # Extract Textract data if enabled
        textract_data = {}
        if use_textract:
            if not s3_bucket:
                logger.warning("Textract enabled but s3_bucket not provided and AWS_TEXTRACT_S3_BUCKET not set in environment, skipping Textract extraction")
            else:
                try:
                    textract_data = extract_textract_candidates(
                        pdf_path,
                        s3_bucket,
                        s3_prefix,
                        aws_region
                    )
                    result["textract_data"] = textract_data
                    
                    # Assign labels to AcroForm fields if we have Textract data
                    if has_acroform and acro_fields:
                        page_dims = [
                            {
                                "width": page.get("width", 0.0),
                                "height": page.get("height", 0.0)
                            }
                            for page in inspection.get("pages", [])
                        ]
                        
                        labeled_fields = assign_labels_to_acroform_fields(
                            acro_fields,
                            textract_data.get("key_values", []),
                            textract_data.get("lines", []),
                            page_dims
                        )
                        result["acro_fields"] = labeled_fields
                        
                except Exception as e:
                    logger.error(f"Error extracting Textract candidates: {e}", exc_info=True)
                    result["textract_data"] = {}
        
        return result
