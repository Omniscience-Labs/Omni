"""DOCX tool: JSON document model → .docx (in-memory only). Full regen per call; only .docx is written."""

from __future__ import annotations

import io
from typing import Any, Dict, List, Optional, Tuple

import jsonschema
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from core.agentpress.thread_manager import ThreadManager
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger

TWIPS_PER_POINT = 20
_PAGE_SIZES = {"LETTER": (8.5, 11.0), "A4": (8.27, 11.69)}

DOCX_DOCUMENT_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://example.com/schemas/min-ai-docx.schema.json",
    "title": "Minimal AI DOCX Document Schema (Foundational v1)",
    "description": "Spacing and margins in twips (1 pt = 20 twips). Font sizes in points.",
    "type": "object",
    "required": ["doc"],
    "additionalProperties": True,
    "properties": {
        "version": {"type": "string", "default": "1.0"},
        "doc": {
            "type": "object",
            "required": ["page"],
            "additionalProperties": True,
            "properties": {
                "page": {
                    "type": "object",
                    "additionalProperties": True,
                    "properties": {
                        "size": {"type": "string", "enum": ["LETTER", "A4"], "default": "LETTER"},
                        "orientation": {"type": "string", "enum": ["portrait", "landscape"], "default": "portrait"},
                        "margins": {"$ref": "#/$defs/Margins"},
                    },
                }
            },
        },
        "styles": {
            "type": "object",
            "additionalProperties": {"$ref": "#/$defs/Style"},
            "default": {},
        },
        "content": {
            "type": "array",
            "minItems": 0,
            "default": [],
            "items": {"$ref": "#/$defs/Block"},
        },
    },
    "$defs": {
        "Margins": {
            "type": "object",
            "additionalProperties": True,
            "properties": {
                "top": {"type": "number", "minimum": 0},
                "left": {"type": "number", "minimum": 0},
                "right": {"type": "number", "minimum": 0},
                "bottom": {"type": "number", "minimum": 0},
            },
        },
        "Spacing": {
            "type": "object",
            "additionalProperties": True,
            "properties": {
                "after": {"type": "number", "minimum": 0},
                "before": {"type": "number", "minimum": 0},
            },
        },
        "Style": {
            "type": "object",
            "additionalProperties": True,
            "properties": {
                "font": {"type": "string"},
                "fontFamily": {"type": "string"},
                "size_pt": {"type": "number", "minimum": 1},
                "fontSize": {"type": "number", "minimum": 1},
                "bold": {"type": "boolean"},
                "italic": {"type": "boolean"},
                "underline": {"type": "boolean"},
            },
        },
        "Inline": {
            "type": "object",
            "required": ["text"],
            "additionalProperties": True,
            "properties": {
                "text": {"type": "string"},
                "bold": {"type": "boolean"},
                "italic": {"type": "boolean"},
                "underline": {"type": "boolean"},
            },
        },
        "Inlines": {
            "type": "array",
            "items": {"$ref": "#/$defs/Inline"},
            "minItems": 1,
        },
        "BaseBlock": {
            "type": "object",
            "required": ["type"],
            "additionalProperties": True,
            "properties": {
                "id": {"type": "string"},
                "type": {"type": "string", "enum": ["heading", "paragraph", "list", "table", "page_break"]},
                "style": {"oneOf": [{"type": "string"}, {"type": "object", "additionalProperties": True}]},
            },
        },
        "HeadingBlock": {
            "allOf": [
                {"$ref": "#/$defs/BaseBlock"},
                {
                    "type": "object",
                    "required": ["level", "text"],
                    "properties": {
                        "type": {"const": "heading"},
                        "level": {"type": "integer", "minimum": 1, "maximum": 3},
                        "text": {"type": "string"},
                    },
                },
            ],
        },
        "ParagraphBlock": {
            "allOf": [
                {"$ref": "#/$defs/BaseBlock"},
                {
                    "type": "object",
                    "properties": {
                        "type": {"const": "paragraph"},
                        "text": {"type": "string"},
                        "inlines": {"$ref": "#/$defs/Inlines"},
                        "bold": {"type": "boolean"},
                        "italic": {"type": "boolean"},
                        "underline": {"type": "boolean"},
                        "alignment": {"type": "string", "enum": ["left", "center", "right", "justify"]},
                        "spacing": {"$ref": "#/$defs/Spacing"},
                    },
                },
            ],
        },
        "ListBlock": {
            "allOf": [
                {"$ref": "#/$defs/BaseBlock"},
                {
                    "type": "object",
                    "required": ["list_type", "items"],
                    "properties": {
                        "type": {"const": "list"},
                        "list_type": {"type": "string", "enum": ["bullet", "number"]},
                        "items": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/Inlines"}},
                    },
                },
            ],
        },
        "TableBlock": {
            "allOf": [
                {"$ref": "#/$defs/BaseBlock"},
                {
                    "type": "object",
                    "required": ["rows"],
                    "properties": {
                        "type": {"const": "table"},
                        "rows": {
                            "type": "array",
                            "minItems": 1,
                            "items": {
                                "type": "array",
                                "minItems": 1,
                                "items": {"$ref": "#/$defs/Inlines"},
                            },
                        },
                    },
                },
            ],
        },
        "PageBreakBlock": {
            "allOf": [
                {"$ref": "#/$defs/BaseBlock"},
                {"type": "object", "properties": {"type": {"const": "page_break"}}},
            ],
        },
        "Block": {
            "oneOf": [
                {"$ref": "#/$defs/HeadingBlock"},
                {"$ref": "#/$defs/ParagraphBlock"},
                {"$ref": "#/$defs/ListBlock"},
                {"$ref": "#/$defs/TableBlock"},
                {"$ref": "#/$defs/PageBreakBlock"},
            ],
        },
    },
}


def _validate_content_semantics(content: List[Dict[str, Any]]) -> Optional[str]:
    for i, block in enumerate(content):
        if block.get("type") == "paragraph":
            if not ("text" in block or block.get("inlines")):
                return f"Paragraph block at index {i} must have 'text' or 'inlines'."
    return None


def _validate_and_normalize_path(workspace_path: str, path: str) -> Tuple[str, str]:
    if not path or not isinstance(path, str):
        raise ValueError("Path must be a non-empty string")
    path = path.replace("\\", "/").strip()
    if path.startswith("/workspace/"):
        path = path[len("/workspace/"):].lstrip("/")
    parts = path.split("/")
    normalized: List[str] = []
    for part in parts:
        if part == "..":
            if normalized:
                normalized.pop()
        elif part and part != ".":
            normalized.append(part)
    cleaned = "/".join(normalized)
    if ".." in cleaned or "\\" in cleaned:
        raise ValueError("Path cannot contain '..' or backslashes")
    return cleaned, f"{workspace_path}/{cleaned}"


def _sanitize_filename(name: str) -> str:
    base = "document"
    if name:
        safe = "".join(c for c in name if c.isalnum() or c in "-_.").strip()
        if safe and not safe.startswith("."):
            base = safe
    if not base.lower().endswith(".docx"):
        base = base.rstrip(".") + ".docx"
    return base


def _twips_to_pt(twips: Any) -> Optional[float]:
    if twips is None:
        return None
    try:
        return float(twips) / TWIPS_PER_POINT
    except (TypeError, ValueError):
        return None


def _twips_to_inches(twips: Any) -> Optional[float]:
    pt = _twips_to_pt(twips)
    return (pt / 72.0) if pt is not None else None


def _apply_page_setup(doc: Document, size: str, orientation: str, margins: Optional[Dict[str, Any]] = None) -> None:
    section = doc.sections[0]
    w, h = _PAGE_SIZES.get(size.upper(), _PAGE_SIZES["LETTER"])
    if orientation and str(orientation).lower() == "landscape":
        section.page_width = Inches(h)
        section.page_height = Inches(w)
        section.orientation = WD_ORIENT.LANDSCAPE
    else:
        section.page_width = Inches(w)
        section.page_height = Inches(h)
        section.orientation = WD_ORIENT.PORTRAIT
    if margins and isinstance(margins, dict):
        for key, attr in (("top", "top_margin"), ("left", "left_margin"), ("right", "right_margin"), ("bottom", "bottom_margin")):
            inch = _twips_to_inches(margins.get(key))
            if inch is not None:
                setattr(section, attr, Inches(inch))


def _set_default_paragraph_spacing(doc: Document) -> None:
    try:
        normal = doc.styles["Normal"]
        normal.paragraph_format.space_before = Pt(0)
        normal.paragraph_format.space_after = Pt(0)
    except (KeyError, AttributeError):
        pass


def _apply_style_to_run(run: Any, style_def: Optional[Dict[str, Any]]) -> None:
    if not style_def or not isinstance(style_def, dict):
        return
    font = style_def.get("font") or style_def.get("fontFamily")
    if font:
        run.font.name = str(font)
    size = style_def.get("size_pt") if style_def.get("size_pt") is not None else style_def.get("fontSize")
    if size is not None:
        run.font.size = Pt(float(size))
    if style_def.get("bold") is not None:
        run.font.bold = bool(style_def["bold"])
    if style_def.get("italic") is not None:
        run.font.italic = bool(style_def["italic"])
    if style_def.get("underline") is not None:
        run.font.underline = bool(style_def["underline"])


def _alignment_enum(alignment: Optional[str]) -> Optional[WD_ALIGN_PARAGRAPH]:
    if not alignment:
        return None
    return {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }.get(str(alignment).strip().lower())


def _apply_paragraph_spacing(paragraph: Any, style_obj: Optional[Dict[str, Any]]) -> None:
    if not style_obj or not isinstance(style_obj, dict):
        return
    spacing = style_obj.get("spacing")
    if not isinstance(spacing, dict):
        return
    after_pt = _twips_to_pt(spacing.get("after"))
    if after_pt is not None:
        paragraph.paragraph_format.space_after = Pt(after_pt)
    before_pt = _twips_to_pt(spacing.get("before"))
    if before_pt is not None:
        paragraph.paragraph_format.space_before = Pt(before_pt)


def _add_inlines_to_paragraph(
    doc: Document,
    paragraph: Any,
    inlines: List[Dict[str, Any]],
    styles: Dict[str, Dict[str, Any]],
    block_style: Any,
) -> None:
    style_def = block_style if isinstance(block_style, dict) else (styles.get(block_style) if isinstance(block_style, str) else None)
    for inline in inlines:
        run = paragraph.add_run(inline.get("text") or "")
        _apply_style_to_run(run, style_def)
        if inline.get("bold"):
            run.font.bold = True
        if inline.get("italic"):
            run.font.italic = True
        if inline.get("underline"):
            run.font.underline = True


def _render_blocks(doc: Document, content: List[Dict[str, Any]], styles: Dict[str, Dict[str, Any]]) -> int:
    block_count = 0
    for block in content:
        block_type = block.get("type")
        block_style = block.get("style")

        if block_type == "heading":
            level = min(3, max(1, int(block.get("level", 1))))
            doc.add_heading(block.get("text") or "", level=level)
            block_count += 1

        elif block_type == "paragraph":
            inlines = block.get("inlines")
            if not inlines and "text" in block:
                run_opts: Dict[str, Any] = {"text": block.get("text") or ""}
                if block.get("bold") is not None:
                    run_opts["bold"] = block["bold"]
                if block.get("italic") is not None:
                    run_opts["italic"] = block["italic"]
                if block.get("underline") is not None:
                    run_opts["underline"] = block["underline"]
                inlines = [run_opts]
            if not inlines:
                inlines = [{"text": ""}]
            p = doc.add_paragraph()
            _add_inlines_to_paragraph(doc, p, inlines, styles, block_style)
            block_spacing = block.get("spacing")
            if isinstance(block_spacing, dict):
                _apply_paragraph_spacing(p, {"spacing": block_spacing})
            elif isinstance(block_style, dict):
                _apply_paragraph_spacing(p, block_style)
            alignment = _alignment_enum(block.get("alignment") or (block_style.get("alignment") if isinstance(block_style, dict) else None))
            if alignment is not None:
                p.paragraph_format.alignment = alignment
            block_count += 1

        elif block_type == "list":
            style_name = "List Bullet" if (block.get("list_type") or "bullet") == "bullet" else "List Number"
            for item_inlines in block.get("items") or []:
                p = doc.add_paragraph(style=style_name)
                _add_inlines_to_paragraph(doc, p, item_inlines or [{"text": ""}], styles, block_style)
            block_count += 1

        elif block_type == "table":
            rows = block.get("rows") or []
            if not rows:
                raise ValueError("Table block must have at least one row")
            col_count = len(rows[0])
            for r in rows:
                if len(r) != col_count:
                    raise ValueError(f"Table rows must have uniform column count; expected {col_count}, got {len(r)}")
            table = doc.add_table(rows=len(rows), cols=col_count)
            for ri, row_inlines_list in enumerate(rows):
                for ci, cell_inlines in enumerate(row_inlines_list):
                    cell_para = table.rows[ri].cells[ci].paragraphs[0] if table.rows[ri].cells[ci].paragraphs else table.rows[ri].cells[ci].add_paragraph()
                    cell_para.clear()
                    _add_inlines_to_paragraph(doc, cell_para, cell_inlines or [{"text": ""}], styles, block_style)
            block_count += 1

        elif block_type == "page_break":
            doc.add_page_break()
            block_count += 1

        else:
            logger.debug("sb_docx_tool: unknown block type id=%s", (block.get("id") or "")[:32])
    return block_count


def _ensure_doc_styles(doc: Document, styles: Dict[str, Dict[str, Any]]) -> None:
    for name, style_def in styles.items():
        if not name or not isinstance(style_def, dict):
            continue
        try:
            style = doc.styles.add_style(name, 1)
        except ValueError:
            style = doc.styles[name]
        if style_def.get("font"):
            style.font.name = style_def["font"]
        if style_def.get("size_pt") is not None:
            style.font.size = Pt(float(style_def["size_pt"]))
        if style_def.get("bold") is not None:
            style.font.bold = bool(style_def["bold"])


@tool_metadata(
    display_name="Word Documents",
    description="Generate Word (.docx) documents from a JSON document model (single render per request)",
    icon="FileText",
    color="bg-indigo-100 dark:bg-indigo-800/50",
    weight=75,
    visible=True,
)
class SandboxDocxTool(SandboxToolsBase):
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.documents_dir = "documents"

    async def _ensure_documents_dir(self) -> None:
        try:
            await self.sandbox.fs.create_folder(f"{self.workspace_path}/{self.documents_dir}", "755")
        except Exception:
            pass

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "render_docx",
            "description": "Render a document from a JSON document model and save as .docx in the workspace. The JSON is not stored; only the generated .docx file is written.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_json": {"type": "object", "description": "The document model (doc.page, optional content, optional styles)."},
                    "output_filename": {"type": "string", "description": "Output filename.", "default": "document.docx"},
                },
                "required": ["document_json"],
            },
        },
    })
    async def render_docx(
        self,
        document_json: Dict[str, Any],
        output_filename: str = "document.docx",
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_documents_dir()

            try:
                jsonschema.validate(instance=document_json, schema=DOCX_DOCUMENT_SCHEMA)
            except jsonschema.ValidationError as e:
                return self.fail_response(f"Document model validation failed: {e.message or str(e)}")

            content = document_json.get("content") or []
            semantic_err = _validate_content_semantics(content)
            if semantic_err:
                return self.fail_response(f"Document model invalid: {semantic_err}")

            doc_config = document_json.get("doc") or {}
            page_config = doc_config.get("page") or {}
            size = page_config.get("size", "LETTER")
            orientation = page_config.get("orientation", "portrait")
            styles = document_json.get("styles") or {}

            for block in content:
                if block.get("type") == "table":
                    rows = block.get("rows") or []
                    if not rows:
                        return self.fail_response("Table block must have at least one row")
                    col_count = len(rows[0])
                    for r in rows:
                        if len(r) != col_count:
                            return self.fail_response(f"Table rows must have uniform column count; expected {col_count}, got {len(r)}")

            doc = Document()
            _apply_page_setup(doc, size, orientation, page_config.get("margins"))
            _set_default_paragraph_spacing(doc)
            _ensure_doc_styles(doc, styles)
            block_count = _render_blocks(doc, content, styles)

            safe_name = _sanitize_filename(output_filename)
            relative_path = f"{self.documents_dir}/{safe_name}"
            cleaned, full_path = _validate_and_normalize_path(self.workspace_path, relative_path)
            try:
                await self.sandbox.fs.delete_file(full_path)
            except Exception:
                pass
            buf = io.BytesIO()
            doc.save(buf)
            buf.seek(0)
            await self.sandbox.fs.upload_file(buf.getvalue(), full_path)

            logger.info("sb_docx_tool render_docx: block_count=%s path=%s", block_count, full_path)
            return self.success_response({
                "saved_path": full_path,
                "relative_path": f"/workspace/{cleaned}",
                "block_count": block_count,
            })
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            logger.exception("sb_docx_tool render_docx failed")
            return self.fail_response(f"Failed to render document: {str(e)}")
