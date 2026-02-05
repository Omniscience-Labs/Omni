"""
PDF form field mapping: detect blanks (FFDNet), extract labels (Textract),
then use the agent's LLM to match labels to blanks and return a final JSON.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Union

from core.agentpress.thread_manager import ThreadManager
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.pdf_forms import detect_form_fields, extract_text_blocks
from core.sandbox.tool_base import SandboxToolsBase
from core.services.llm import make_llm_api_call, LLMError
from core.tools.pdf_utils import (
    DEFAULT_MAX_SIZE,
    DEFAULT_URL_MAX_BYTES,
    DEFAULT_URL_TIMEOUT_SEC,
    pdf_to_page_images_async,
    RasterizedPage,
    PDFRasterizationError,
)
from core.utils.logger import logger

# Default LLM for form matching (agent default fallback)
try:
    from core.ai_models.registry import FREE_MODEL_ID
    _DEFAULT_LLM_MODEL = FREE_MODEL_ID
except Exception:
    _DEFAULT_LLM_MODEL = "gpt-4o-mini"  # fallback if registry not available


def _serialize_blanks(blanks: List[Any]) -> List[Dict[str, Any]]:
    """Convert BlankField list to JSON-serializable dicts."""
    out = []
    for b in blanks:
        out.append({
            "page_index": b.page_index,
            "bbox": list(b.bbox_normalized),
            "class_id": b.class_id,
            "field_type": ["text", "checkbox", "signature"][b.class_id] if 0 <= b.class_id <= 2 else "text",
            "confidence": round(b.confidence, 4),
        })
    return out


def _serialize_labels(labels: List[Any]) -> List[Dict[str, Any]]:
    """Convert LabelBlock list to JSON-serializable dicts."""
    out = []
    for lb in labels:
        out.append({
            "page_index": lb.page_index,
            "text": lb.text,
            "bbox": list(lb.bbox_normalized),
            "block_type": lb.block_type,
        })
    return out


def _build_matching_prompt(blanks_json: str, labels_json: str) -> str:
    return f"""You are given two JSON arrays from a PDF form:

1) **blanks**: Empty form fields (text boxes, checkboxes, signature areas) with normalized bbox [left, top, width, height] (0-1) and field_type (text, checkbox, signature).
2) **labels**: Text lines from OCR with their bboxes.

Match each blank to the most likely label (the text that describes that field). Use page_index and spatial proximity (e.g. label often left of or above the blank). Output only a single JSON array, no explanation. Each item must have: "label" (string), "bbox" (array of 4 numbers: left, top, width, height), "field_type" (one of: text, checkbox, signature), "page" (integer, 0-based).

Format: [{{"label": "...", "bbox": [l, t, w, h], "field_type": "text", "page": 0}}, ...]

blanks:
{blanks_json}

labels:
{labels_json}

Output only the JSON array:"""


def _parse_llm_json(content: str) -> List[Dict[str, Any]]:
    """Extract JSON array from LLM response (strip markdown code blocks if present)."""
    text = (content or "").strip()
    # Remove optional markdown code block
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("LLM output is not a JSON array")
    return data


@tool_metadata(
    display_name="Map PDF Form Fields",
    description="Extract form fields from a PDF: detect blanks (FFDNet), labels (Textract), then use the LLM to match labels to blanks. Returns a final JSON of matched fields.",
    icon="FileSearch",
    color="bg-amber-100 dark:bg-amber-800/50",
    weight=46,
    visible=True,
)
class SandboxPdfFormTool(SandboxToolsBase):
    """Tool to map PDF form fields: rasterize → detect → OCR → LLM matching → final JSON."""

    def __init__(self, project_id: str, thread_manager: Optional[ThreadManager] = None):
        super().__init__(project_id, thread_manager)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "map_pdf_form_fields",
            "description": "Extract form fields from a non-interactive PDF: detect empty blanks (text fields, checkboxes, signatures), extract text labels (OCR), then use the LLM to match each blank to its label. Returns a final JSON list: [{ 'label': '...', 'bbox': [l,t,w,h], 'field_type': 'text'|'checkbox'|'signature', 'page': 0 }, ...].",
            "parameters": {
                "type": "object",
                "properties": {
                    "pdf_path": {
                        "type": "string",
                        "description": "Path to the PDF in the sandbox (e.g. 'documents/form.pdf') or a URL (http/https).",
                    },
                    "confidence_threshold": {
                        "type": "number",
                        "description": "Minimum confidence for blank detection (default 0.35).",
                    },
                },
                "required": ["pdf_path"],
            },
        },
    })
    async def map_pdf_form_fields(
        self,
        pdf_path: str,
        confidence_threshold: float = 0.35,
    ) -> ToolResult:
        try:
            if not (pdf_path and pdf_path.strip()):
                return self.fail_response("pdf_path is required and cannot be empty")

            is_url = pdf_path.strip().lower().startswith(("http://", "https://"))
            need_sandbox = not is_url
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

            pages: List[RasterizedPage] = await pdf_to_page_images_async(
                pdf_source,
                max_size=DEFAULT_MAX_SIZE,
                dpi=None,
                url_max_bytes=DEFAULT_URL_MAX_BYTES,
                url_timeout_sec=DEFAULT_URL_TIMEOUT_SEC,
            )
            if not pages:
                return self.fail_response("PDF has no pages or rasterization failed")

            blanks = detect_form_fields(pages, confidence_threshold=confidence_threshold)
            if not blanks:
                logger.info("No form blanks detected; returning empty fields list")

            if not os.environ.get("AWS_ACCESS_KEY_ID") or not os.environ.get("AWS_SECRET_ACCESS_KEY"):
                return self.fail_response(
                    "AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are required for Textract. "
                    "Configure them to extract labels from the PDF."
                )
            try:
                labels = extract_text_blocks(pages)
            except RuntimeError as e:
                return self.fail_response(f"Textract failed: {e}")

            blanks_data = _serialize_blanks(blanks)
            labels_data = _serialize_labels(labels)
            prompt = _build_matching_prompt(
                json.dumps(blanks_data, indent=2),
                json.dumps(labels_data, indent=2),
            )

            from core.utils.config import config
            model_name = getattr(config, "PDF_FORMS_LLM_MODEL", None) or _DEFAULT_LLM_MODEL

            try:
                response = await make_llm_api_call(
                    messages=[{"role": "user", "content": prompt}],
                    model_name=model_name,
                    temperature=0,
                    max_tokens=4096,
                    stream=False,
                )
            except LLMError as e:
                return self.fail_response(f"LLM matching failed: {e}")

            content = ""
            if hasattr(response, "choices") and response.choices:
                msg = response.choices[0].message
                if hasattr(msg, "content"):
                    content = msg.content or ""
            if not content:
                return self.fail_response("LLM returned no content for form field matching")

            try:
                fields = _parse_llm_json(content)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"LLM output was not valid JSON: {e}")
                return self.fail_response(
                    f"LLM output could not be parsed as JSON. Raw content (first 500 chars): {content[:500]}"
                )

            for i, f in enumerate(fields):
                if not isinstance(f, dict):
                    fields[i] = {"label": "", "bbox": [0, 0, 0, 0], "field_type": "text", "page": 0}
                    continue
                if "label" not in f:
                    f["label"] = ""
                if "bbox" not in f or not isinstance(f["bbox"], (list, tuple)) or len(f["bbox"]) != 4:
                    f["bbox"] = [0.0, 0.0, 0.0, 0.0]
                if "field_type" not in f or f["field_type"] not in ("text", "checkbox", "signature"):
                    f["field_type"] = "text"
                if "page" not in f:
                    f["page"] = 0

            return self.success_response({
                "fields": fields,
                "total_pages": len(pages),
                "blanks_count": len(blanks),
                "labels_count": len(labels),
            })

        except ValueError as e:
            return self.fail_response(str(e))
        except PDFRasterizationError as e:
            return self.fail_response(f"Rasterization failed: {e}")
        except ImportError as e:
            msg = str(e).strip()
            if "ultralytics" in msg.lower():
                return self.fail_response(
                    "Form field detection requires ultralytics. Rebuild the backend Docker image so "
                    "dependencies (ultralytics, torch) are installed, or install them in the runtime environment."
                )
            return self.fail_response(f"Missing dependency: {msg}")
        except Exception as e:
            logger.error("Failed to map PDF form fields", exc_info=True)
            return self.fail_response(f"Failed to map PDF form fields: {e!s}")
