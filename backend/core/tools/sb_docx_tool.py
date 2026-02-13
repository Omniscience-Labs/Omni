"""DOCX tool: content + settings → .docx. Backend assembles standardized JSON; LLM provides content + overrides only."""

from __future__ import annotations

import io
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt, RGBColor

from core.agentpress.thread_manager import ThreadManager
from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger

# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------

_PAGE_SIZES = {"LETTER": (8.5, 11.0), "A4": (8.27, 11.69)}
_HEADING_SIZES = {1: 16, 2: 14, 3: 12}

# Default values for block fields.  Backend fills these for any missing field.
_BLOCK_DEFAULTS: Dict[str, Any] = {
    "alignment": "left",
    "bold": False,
    "italic": False,
    "underline": False,
    "color": "#000000",
    "spacing": {"before": 0, "after": 0},
}


# ---------------------------------------------------------------------------
# Path / filename helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Margin helper
# ---------------------------------------------------------------------------

def _inches_value(value: Any, *, max_reasonable_inches: float = 5.0) -> Optional[float]:
    """Parse a margin value as inches with sanity bound."""
    if value is None:
        return None
    try:
        inches = float(value)
    except (TypeError, ValueError):
        return None
    if inches < 0 or inches > max_reasonable_inches:
        return None
    return inches


# ---------------------------------------------------------------------------
# Document assembly — backend builds the full standardized JSON
# ---------------------------------------------------------------------------

def _build_item(item: Any, default_font: str, default_size: float, default_color: str) -> Dict[str, Any]:
    """Normalize a list item or table cell (string or partial dict) into a full object with all fields."""
    if isinstance(item, str):
        obj: Dict[str, Any] = {"text": item}
    elif isinstance(item, dict):
        obj = dict(item)
    else:
        obj = {"text": str(item) if item is not None else ""}

    obj.setdefault("text", "")
    obj.setdefault("font", default_font)
    obj.setdefault("size", default_size)
    obj.setdefault("color", default_color)
    obj.setdefault("bold", False)
    obj.setdefault("italic", False)
    obj.setdefault("underline", False)
    obj.setdefault("alignment", "left")
    return obj


def _build_block(block: Dict[str, Any], default_font: str, default_size: float, default_color: str) -> Dict[str, Any]:
    """Fill every missing field with defaults.  Returns a complete, standardized block."""
    b: Dict[str, Any] = dict(block)
    block_type = b.get("type", "paragraph")
    b["type"] = block_type

    # Page breaks need no formatting fields.
    if block_type == "page_break":
        return b

    # ---- Common defaults for all non-break blocks ----
    b.setdefault("font", default_font)
    b.setdefault("color", default_color)
    b.setdefault("alignment", _BLOCK_DEFAULTS["alignment"])
    b.setdefault("italic", _BLOCK_DEFAULTS["italic"])
    b.setdefault("underline", _BLOCK_DEFAULTS["underline"])

    # Spacing — always a dict with both keys present
    if "spacing" not in b or not isinstance(b.get("spacing"), dict):
        b["spacing"] = dict(_BLOCK_DEFAULTS["spacing"])
    else:
        b["spacing"] = dict(b["spacing"])
        b["spacing"].setdefault("before", 0)
        b["spacing"].setdefault("after", 0)

    # ---- Type-specific defaults ----
    if block_type == "heading":
        level = b.get("level", 1)
        try:
            level = min(3, max(1, int(level)))
        except (TypeError, ValueError):
            level = 1
        b["level"] = level
        b.setdefault("text", "")
        b.setdefault("size", _HEADING_SIZES.get(level, 16))
        b.setdefault("bold", True)  # headings bold by default

    elif block_type == "paragraph":
        b.setdefault("text", "")
        b.setdefault("size", default_size)
        b.setdefault("bold", _BLOCK_DEFAULTS["bold"])

    elif block_type == "list":
        b.setdefault("list_type", "bullet")
        b.setdefault("size", default_size)
        b.setdefault("bold", _BLOCK_DEFAULTS["bold"])
        # Normalize each item (string → full object)
        raw_items = b.get("items") or []
        b["items"] = [_build_item(it, default_font, default_size, default_color) for it in raw_items]

    elif block_type == "table":
        b.setdefault("size", default_size)
        b.setdefault("bold", _BLOCK_DEFAULTS["bold"])
        # Normalize each cell (string → full object) and pad to uniform column count
        raw_rows = b.get("rows") or []
        built_rows = [
            [_build_item(cell, default_font, default_size, default_color) for cell in (row if isinstance(row, list) else [])]
            for row in raw_rows
        ]
        if built_rows:
            max_cols = max((len(r) for r in built_rows), default=0)
            for row in built_rows:
                while len(row) < max_cols:
                    row.append(_build_item("", default_font, default_size, default_color))
        b["rows"] = built_rows

    else:
        # Unknown block type — fill common text defaults so rendering won't crash
        b.setdefault("text", "")
        b.setdefault("size", default_size)
        b.setdefault("bold", _BLOCK_DEFAULTS["bold"])

    return b


def _assemble_document(
    content: List[Dict[str, Any]],
    page_size: str,
    orientation: str,
    margin_top: float,
    margin_bottom: float,
    margin_left: float,
    margin_right: float,
    default_font: str,
    default_size: float,
    default_color: str,
) -> Dict[str, Any]:
    """Build the full standardized document JSON from flat parameters."""
    return {
        "doc": {
            "page": {
                "size": (page_size or "LETTER").upper(),
                "orientation": (orientation or "portrait").lower(),
                "margins": {
                    "top": margin_top,
                    "left": margin_left,
                    "right": margin_right,
                    "bottom": margin_bottom,
                },
            },
        },
        "content": [
            _build_block(b, default_font, default_size, default_color)
            for b in (content or [])
            if isinstance(b, dict)
        ],
    }


# ---------------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------------

def _apply_page_setup(doc: Document, page_config: Dict[str, Any]) -> None:
    section = doc.sections[0]
    size = page_config.get("size", "LETTER")
    orientation = page_config.get("orientation", "portrait")
    w, h = _PAGE_SIZES.get(str(size).upper(), _PAGE_SIZES["LETTER"])

    if str(orientation).lower() == "landscape":
        section.page_width = Inches(h)
        section.page_height = Inches(w)
        section.orientation = WD_ORIENT.LANDSCAPE
    else:
        section.page_width = Inches(w)
        section.page_height = Inches(h)
        section.orientation = WD_ORIENT.PORTRAIT

    margins = page_config.get("margins") or {}
    if isinstance(margins, dict):
        for key, attr in (("top", "top_margin"), ("left", "left_margin"), ("right", "right_margin"), ("bottom", "bottom_margin")):
            inch = _inches_value(margins.get(key))
            if inch is not None:
                setattr(section, attr, Inches(inch))


def _set_default_paragraph_spacing(doc: Document) -> None:
    try:
        normal = doc.styles["Normal"]
        normal.paragraph_format.space_before = Pt(0)
        normal.paragraph_format.space_after = Pt(0)
    except (KeyError, AttributeError):
        pass


# ---------------------------------------------------------------------------
# Alignment helper
# ---------------------------------------------------------------------------

_ALIGNMENT_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def _alignment_enum(alignment: str) -> Optional[WD_ALIGN_PARAGRAPH]:
    if not alignment:
        return None
    return _ALIGNMENT_MAP.get(str(alignment).strip().lower())


# ---------------------------------------------------------------------------
# Run formatting — all fields guaranteed present by _build_block / _build_item
# ---------------------------------------------------------------------------

def _apply_run_formatting(run: Any, fmt: Dict[str, Any]) -> None:
    """Apply all formatting fields to a single run."""
    run.font.name = fmt["font"]
    run.font.size = Pt(fmt["size"])
    run.font.bold = fmt["bold"]
    run.font.italic = fmt["italic"]
    run.font.underline = fmt["underline"]
    color_hex = str(fmt["color"]).lstrip("#")
    if len(color_hex) == 6:
        run.font.color.rgb = RGBColor.from_string(color_hex)


# ---------------------------------------------------------------------------
# Block rendering — simplified, every block has all fields guaranteed
# ---------------------------------------------------------------------------

def _render_blocks(doc: Document, content: List[Dict[str, Any]]) -> int:
    """Render all blocks into the Document."""
    block_count = 0

    for block in content:
        block_type = block["type"]

        if block_type == "heading":
            heading_para = doc.add_heading("", level=block["level"])
            # Clear the default run (which inherits Word's blue heading style)
            # and replace with our explicitly formatted run.
            heading_para.clear()
            run = heading_para.add_run(block["text"])
            _apply_run_formatting(run, block)
            alignment = _alignment_enum(block["alignment"])
            if alignment is not None:
                heading_para.paragraph_format.alignment = alignment
            heading_para.paragraph_format.space_before = Pt(block["spacing"]["before"])
            heading_para.paragraph_format.space_after = Pt(block["spacing"]["after"])
            block_count += 1

        elif block_type == "paragraph":
            p = doc.add_paragraph()
            run = p.add_run(block["text"])
            _apply_run_formatting(run, block)
            alignment = _alignment_enum(block["alignment"])
            if alignment is not None:
                p.paragraph_format.alignment = alignment
            p.paragraph_format.space_before = Pt(block["spacing"]["before"])
            p.paragraph_format.space_after = Pt(block["spacing"]["after"])
            block_count += 1

        elif block_type == "list":
            style_name = "List Bullet" if block["list_type"] == "bullet" else "List Number"
            for item in block["items"]:
                p = doc.add_paragraph(style=style_name)
                run = p.add_run(item["text"])
                _apply_run_formatting(run, item)
            block_count += 1

        elif block_type == "table":
            rows = block["rows"]
            if not rows:
                continue
            col_count = len(rows[0])  # guaranteed uniform by _build_block
            table = doc.add_table(rows=len(rows), cols=col_count)
            for ri, row in enumerate(rows):
                for ci, cell in enumerate(row):
                    cell_para = table.rows[ri].cells[ci].paragraphs[0]
                    cell_para.clear()
                    run = cell_para.add_run(cell["text"])
                    _apply_run_formatting(run, cell)
                    cell_alignment = _alignment_enum(cell.get("alignment", "left"))
                    if cell_alignment is not None:
                        cell_para.paragraph_format.alignment = cell_alignment
            block_count += 1

        elif block_type == "page_break":
            doc.add_page_break()
            block_count += 1

        else:
            logger.debug("sb_docx_tool: skipping unknown block type=%s", str(block_type)[:32])

    return block_count


# ---------------------------------------------------------------------------
# Tool class
# ---------------------------------------------------------------------------

@tool_metadata(
    display_name="Word Documents",
    description="Generate Word (.docx) documents from content blocks and formatting settings",
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
            "description": (
                "Render a Word document from content blocks and save as .docx. "
                "Provide content as an array of blocks (heading, paragraph, list, table, page_break). "
                "The backend fills ALL missing formatting fields with defaults — only specify overrides "
                "for what the user explicitly requested. List items and table cells can be plain strings."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "array",
                        "description": (
                            "Array of content blocks. Each block must have 'type' and type-specific fields. "
                            "Types: heading (level 1-3, text), paragraph (text), list (list_type, items), "
                            "table (rows), page_break. Optional per-block overrides: font, size (pt), "
                            "color (hex e.g. '#FF0000'), bold, italic, underline, "
                            "alignment (left|center|right|justify), spacing ({before, after} in pt). "
                            "List items and table cells can be plain strings or {text, ...overrides}."
                        ),
                        "items": {
                            "type": "object",
                            "required": ["type"],
                            "properties": {
                                "type": {"type": "string", "enum": ["heading", "paragraph", "list", "table", "page_break"]},
                                "text": {"type": "string"},
                                "level": {"type": "integer", "minimum": 1, "maximum": 3},
                                "alignment": {"type": "string", "enum": ["left", "center", "right", "justify"]},
                                "font": {"type": "string"},
                                "size": {"type": "number"},
                                "color": {"type": "string"},
                                "bold": {"type": "boolean"},
                                "italic": {"type": "boolean"},
                                "underline": {"type": "boolean"},
                                "spacing": {
                                    "type": "object",
                                    "properties": {
                                        "before": {"type": "number"},
                                        "after": {"type": "number"},
                                    },
                                },
                                "list_type": {"type": "string", "enum": ["bullet", "number"]},
                                "items": {"type": "array", "description": "List items: strings or {text, font?, size?, bold?, italic?, underline?, color?}"},
                                "rows": {"type": "array", "description": "Table rows: array of arrays. Each cell: string or {text, font?, size?, bold?, italic?, underline?, color?, alignment?}"},
                            },
                        },
                    },
                    "output_filename": {"type": "string", "description": "Output filename (e.g. 'report.docx').", "default": "document.docx"},
                    "page_size": {"type": "string", "enum": ["LETTER", "A4"], "description": "Page size.", "default": "LETTER"},
                    "orientation": {"type": "string", "enum": ["portrait", "landscape"], "description": "Page orientation.", "default": "portrait"},
                    "margin_top": {"type": "number", "description": "Top margin in inches.", "default": 1.0},
                    "margin_bottom": {"type": "number", "description": "Bottom margin in inches.", "default": 1.0},
                    "margin_left": {"type": "number", "description": "Left margin in inches.", "default": 1.0},
                    "margin_right": {"type": "number", "description": "Right margin in inches.", "default": 1.0},
                    "default_font": {"type": "string", "description": "Default font for all blocks.", "default": "Calibri"},
                    "default_font_size": {"type": "number", "description": "Default font size in points for paragraphs and lists.", "default": 11},
                    "default_font_color": {"type": "string", "description": "Default font color as hex (e.g. '#000000').", "default": "#000000"},
                },
                "required": ["content"],
            },
        },
    })
    async def render_docx(
        self,
        content: List[Dict[str, Any]],
        output_filename: str = "document.docx",
        page_size: str = "LETTER",
        orientation: str = "portrait",
        margin_top: float = 1.0,
        margin_bottom: float = 1.0,
        margin_left: float = 1.0,
        margin_right: float = 1.0,
        default_font: str = "Calibri",
        default_font_size: float = 11.0,
        default_font_color: str = "#000000",
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_documents_dir()

            if not content or not isinstance(content, list):
                return self.fail_response("'content' must be a non-empty array of block objects.")

            # --- Backend assembles the full standardized document JSON ---
            assembled = _assemble_document(
                content=content,
                page_size=page_size,
                orientation=orientation,
                margin_top=margin_top,
                margin_bottom=margin_bottom,
                margin_left=margin_left,
                margin_right=margin_right,
                default_font=default_font,
                default_size=default_font_size,
                default_color=default_font_color,
            )

            doc_page = assembled["doc"]["page"]
            assembled_content = assembled["content"]

            # Validate tables have rows
            for block in assembled_content:
                if block["type"] == "table":
                    rows = block.get("rows") or []
                    if not rows:
                        return self.fail_response("Table block must have at least one row.")

            # --- Build the .docx ---
            doc = Document()
            _apply_page_setup(doc, doc_page)
            _set_default_paragraph_spacing(doc)
            block_count = _render_blocks(doc, assembled_content)

            # --- Save to sandbox ---
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
