"""Spreadsheet tool: content + settings → .xlsx. Backend assembles standardized JSON; LLM provides content + overrides only."""

from __future__ import annotations

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.utils.logger import logger
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
import re
import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.styles.colors import Color
from openpyxl.utils import column_index_from_string


# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------

_VALID_ALIGNMENTS = {"left", "center", "right", "top", "bottom", "middle"}


# ---------------------------------------------------------------------------
# Color helper
# ---------------------------------------------------------------------------

def _normalize_color(color: Any) -> Optional[str]:
    """Normalize color to RRGGBB (strip '#' prefix if present)."""
    if color is None:
        return None
    s = str(color).strip().lstrip("#")
    if len(s) == 6 and all(c in "0123456789abcdefABCDEF" for c in s):
        return s.upper()
    return None


# ---------------------------------------------------------------------------
# Cell reference helpers (module-level, used by assembly functions)
# ---------------------------------------------------------------------------

def _validate_cell_ref(cell_ref: str) -> bool:
    """Validate A1-style cell reference."""
    return bool(re.match(r'^[A-Z]+[0-9]+$', str(cell_ref).upper()))


def _validate_range_ref(range_ref: str) -> bool:
    """Validate A1:B10-style range reference."""
    if ':' not in str(range_ref):
        return False
    parts = str(range_ref).split(':')
    if len(parts) != 2:
        return False
    return _validate_cell_ref(parts[0]) and _validate_cell_ref(parts[1])


def _parse_cell_ref(cell_ref: str) -> Tuple[int, int]:
    """Parse A1 into (row, col) as 1-based integers."""
    upper = str(cell_ref).upper()
    col_str = re.match(r'^([A-Z]+)', upper).group(1)
    row_str = re.match(r'[A-Z]+(\d+)$', upper).group(1)
    return int(row_str), column_index_from_string(col_str)


def _parse_range_ref(range_ref: str) -> Tuple[int, int, int, int]:
    """Parse A1:B10 range into (start_row, start_col, end_row, end_col)."""
    start_cell, end_cell = str(range_ref).split(':')
    sr, sc = _parse_cell_ref(start_cell)
    er, ec = _parse_cell_ref(end_cell)
    return sr, sc, er, ec


# ---------------------------------------------------------------------------
# Filename helper
# ---------------------------------------------------------------------------

def _sanitize_xlsx_filename(name: str) -> str:
    """Sanitize a filename for .xlsx output."""
    base = "workbook"
    if name:
        safe = "".join(c for c in name if c.isalnum() or c in "-_.").strip()
        if safe and not safe.startswith("."):
            base = safe
    if not base.lower().endswith(".xlsx"):
        base = base.rstrip(".") + ".xlsx"
    return base


# ---------------------------------------------------------------------------
# Workbook assembly — backend builds the full standardized JSON
# ---------------------------------------------------------------------------

def _build_format(fmt: Any, defaults: Dict[str, Any], fill_missing: bool = True) -> Dict[str, Any]:
    """Normalize a format object. When fill_missing=True, fill all keys with defaults
    (for table/cell format). When fill_missing=False, only normalize keys that are
    present (for standalone format entries) so applying one key does not overwrite others."""
    if not isinstance(fmt, dict):
        fmt = {}
    else:
        fmt = dict(fmt)

    if fill_missing:
        fmt.setdefault("number_format", defaults.get("number_format", "General"))
        fmt.setdefault("bold", False)
        fmt.setdefault("italic", False)
        fmt.setdefault("font_size", defaults.get("font_size", 11))
        fmt.setdefault("font_name", defaults.get("font_name", "Calibri"))
        raw_font_color = fmt.get("font_color", defaults.get("font_color", "000000"))
        fmt["font_color"] = _normalize_color(raw_font_color) or "000000"
        raw_fill = fmt.get("fill_color", defaults.get("fill_color"))
        fmt["fill_color"] = _normalize_color(raw_fill)
        align = fmt.get("alignment", defaults.get("alignment", "left"))
        if align not in _VALID_ALIGNMENTS:
            align = "left"
        fmt["alignment"] = align
        fmt.setdefault("wrap_text", defaults.get("wrap_text", False))
        fmt.setdefault("border", defaults.get("border", False))
    else:
        # Only normalize keys that are present so we don't overwrite e.g. number_format with "General"
        if "font_color" in fmt:
            fmt["font_color"] = _normalize_color(fmt["font_color"]) or "000000"
        if "fill_color" in fmt:
            fmt["fill_color"] = _normalize_color(fmt["fill_color"])
        if "alignment" in fmt:
            if fmt["alignment"] not in _VALID_ALIGNMENTS:
                fmt["alignment"] = "left"

    return fmt


def _build_table(table: Any, defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a table spec. Validates anchor, ensures rectangular values."""
    if not isinstance(table, dict):
        raise ValueError("Table entry must be a dict.")
    t = dict(table)

    # Anchor
    anchor = t.get("anchor", "A1")
    if not _validate_cell_ref(str(anchor)):
        raise ValueError(f"Invalid table anchor: {anchor}. Expected A1 format.")
    t["anchor"] = str(anchor).upper()

    # Values — must be non-empty 2D array
    values = t.get("values")
    if not values or not isinstance(values, list):
        raise ValueError("Table must have a non-empty 'values' 2D array.")
    max_cols = 0
    for row in values:
        if isinstance(row, list):
            max_cols = max(max_cols, len(row))
    if max_cols == 0:
        raise ValueError("Table 'values' must contain at least one column.")
    # Pad short rows to make rectangular
    normalized_values: List[List[Any]] = []
    for row in values:
        if not isinstance(row, list):
            row = [row]
        while len(row) < max_cols:
            row.append(None)
        normalized_values.append(row)
    t["values"] = normalized_values

    t.setdefault("header", False)

    # Format (optional — applied to entire table range)
    if "format" in t and t["format"] is not None:
        t["format"] = _build_format(t["format"], defaults)
    else:
        t["format"] = None

    return t


def _build_cell(cell_spec: Any, defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a cell spec (value or formula)."""
    if not isinstance(cell_spec, dict):
        raise ValueError("Cell entry must be a dict.")
    c = dict(cell_spec)

    cell_ref = c.get("cell")
    if not cell_ref or not _validate_cell_ref(str(cell_ref)):
        raise ValueError(f"Invalid cell reference: {cell_ref}. Expected A1 format.")
    c["cell"] = str(cell_ref).upper()

    formula = c.get("formula")
    if formula is not None:
        formula = str(formula)
        if not formula.startswith("="):
            raise ValueError(f"Formula must start with '='. Got: {formula}")
        c["formula"] = formula
        c["value"] = None
    else:
        c["formula"] = None
        c.setdefault("value", None)

    if "format" in c and c["format"] is not None:
        c["format"] = _build_format(c["format"], defaults)
    else:
        c["format"] = None

    return c


def _build_format_entry(fmt_entry: Any, defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a standalone format entry (target + format)."""
    if not isinstance(fmt_entry, dict):
        raise ValueError("Format entry must be a dict.")
    f = dict(fmt_entry)

    target = f.get("target")
    if not target:
        raise ValueError("Format entry must have a 'target' (cell or range).")
    target = str(target).upper()
    if ':' in target:
        if not _validate_range_ref(target):
            raise ValueError(f"Invalid format target range: {target}. Expected A1:C3 format.")
    else:
        if not _validate_cell_ref(target):
            raise ValueError(f"Invalid format target cell: {target}. Expected A1 format.")
    f["target"] = target

    # Use fill_missing=False so only explicitly provided keys are applied (e.g. fill_color
    # alone does not overwrite number_format with "General")
    f["format"] = _build_format(f.get("format", {}), defaults, fill_missing=False)
    return f


def _build_sheet(sheet: Any, defaults: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a sheet spec.  Ensures name, tables, cells, formats are valid."""
    if not isinstance(sheet, dict):
        raise ValueError("Sheet entry must be a dict with at least a 'name' key.")
    s = dict(sheet)

    name = s.get("name")
    if not name or not isinstance(name, str):
        raise ValueError("Sheet must have a non-empty 'name' string.")
    if len(name) > 31:
        raise ValueError(f"Sheet name too long (max 31 characters): {name}")
    s["name"] = name

    raw_tables = s.get("tables") or []
    s["tables"] = [_build_table(t, defaults) for t in raw_tables if isinstance(t, dict)]

    raw_cells = s.get("cells") or []
    s["cells"] = [_build_cell(c, defaults) for c in raw_cells if isinstance(c, dict)]

    raw_formats = s.get("formats") or []
    s["formats"] = [_build_format_entry(f, defaults) for f in raw_formats if isinstance(f, dict)]

    return s


def _assemble_workbook(
    sheets: List[Dict[str, Any]],
    default_font_name: str = "Calibri",
    default_font_size: float = 11,
    default_font_color: str = "000000",
    default_number_format: str = "General",
    default_alignment: str = "left",
    default_wrap_text: bool = False,
    default_border: bool = False,
) -> Dict[str, Any]:
    """Build the full standardized workbook JSON from partial parameters.
    Backend owns the full structure; LLM supplies only content/overrides.
    Standardized output shape:
      { "schema_version": 1,
        "workbook": { "defaults": { font_name, font_size, font_color, number_format, alignment, wrap_text, border } },
        "sheets": [ { "name", "tables": [ { "anchor", "values", "header", "format" } ], "cells": [ ... ], "formats": [ ... ] } ]
      }
    Each format object (standardized by backend): number_format, bold, italic, font_size, font_name, font_color, fill_color,
    alignment, wrap_text, border. Colors: hex RRGGBB or #RRGGBB; backend normalizes to RRGGBB. Missing keys filled from defaults.
    """
    defaults = {
        "font_name": default_font_name,
        "font_size": default_font_size,
        "font_color": _normalize_color(default_font_color) or "000000",
        "number_format": default_number_format,
        "alignment": default_alignment if default_alignment in _VALID_ALIGNMENTS else "left",
        "wrap_text": default_wrap_text,
        "border": default_border,
    }
    return {
        "schema_version": 1,
        "workbook": {"defaults": defaults},
        "sheets": [
            _build_sheet(s, defaults)
            for s in (sheets or [])
            if isinstance(s, dict)
        ],
    }


# ---------------------------------------------------------------------------
# Format application — shared by format_cells and render_spreadsheet
# ---------------------------------------------------------------------------

def _apply_format(
    worksheet, start_row: int, start_col: int, end_row: int, end_col: int,
    fmt: Dict[str, Any],
) -> List[str]:
    """Apply formatting to a rectangular cell range.
    Returns de-duplicated list of applied format keys."""
    applied_keys: List[str] = []
    for row in worksheet.iter_rows(min_row=start_row, max_row=end_row,
                                   min_col=start_col, max_col=end_col):
        for cell in row:
            # Number format
            if "number_format" in fmt:
                cell.number_format = fmt["number_format"]
                applied_keys.append("number_format")

            # Font formatting
            font_updates: Dict[str, Any] = {}
            if "bold" in fmt:
                font_updates["bold"] = fmt["bold"]
                applied_keys.append("bold")
            if "italic" in fmt:
                font_updates["italic"] = fmt["italic"]
                applied_keys.append("italic")
            if "font_size" in fmt:
                font_updates["size"] = fmt["font_size"]
                applied_keys.append("font_size")
            if "font_color" in fmt:
                font_updates["color"] = Color(rgb=fmt["font_color"])
                applied_keys.append("font_color")
            if "font_name" in fmt:
                font_updates["name"] = fmt["font_name"]
                applied_keys.append("font_name")

            if font_updates:
                current_font = cell.font if cell.font else Font()
                cell.font = Font(
                    name=font_updates.get("name", current_font.name),
                    bold=font_updates.get("bold", current_font.bold),
                    italic=font_updates.get("italic", current_font.italic),
                    size=font_updates.get("size", current_font.size),
                    color=font_updates.get("color", current_font.color),
                )

            # Fill color
            if "fill_color" in fmt and fmt["fill_color"]:
                cell.fill = PatternFill(
                    start_color=fmt["fill_color"],
                    end_color=fmt["fill_color"],
                    fill_type="solid",
                )
                applied_keys.append("fill_color")

            # Alignment
            if "alignment" in fmt:
                align_map = {
                    "left": Alignment(horizontal="left"),
                    "center": Alignment(horizontal="center"),
                    "right": Alignment(horizontal="right"),
                    "top": Alignment(vertical="top"),
                    "bottom": Alignment(vertical="bottom"),
                    "middle": Alignment(vertical="center"),
                }
                cell.alignment = align_map.get(
                    fmt["alignment"], Alignment(horizontal="left")
                )
                applied_keys.append("alignment")

            # Wrap text (Alignment is immutable: always assign a new instance)
            if "wrap_text" in fmt:
                cur = cell.alignment
                cell.alignment = Alignment(
                    horizontal=cur.horizontal if cur else None,
                    vertical=cur.vertical if cur else None,
                    wrap_text=fmt["wrap_text"],
                    text_rotation=cur.text_rotation if cur else 0,
                    shrink_to_fit=cur.shrink_to_fit if cur else False,
                    indent=cur.indent if cur else 0,
                )
                applied_keys.append("wrap_text")

            # Border
            if "border" in fmt and fmt["border"]:
                cell.border = Border(
                    left=Side(style='thin'),
                    right=Side(style='thin'),
                    top=Side(style='thin'),
                    bottom=Side(style='thin'),
                )
                applied_keys.append("border")

    return list(set(applied_keys))


@tool_metadata(
    display_name="Spreadsheets",
    description="Create, edit, and manage Excel spreadsheets with formulas, formatting, and data analysis",
    icon="FileSpreadsheet",
    color="bg-green-100 dark:bg-green-800/50",
    weight=80,
    visible=True
)
class SandboxSpreadsheetTool(SandboxToolsBase):
    """
    Spreadsheet tool for rendering Excel (.xlsx) files from a standardized JSON spec.
    Backend assembles the full standardized JSON (defaults + normalization), then renders.
    """
    
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.spreadsheets_dir = "spreadsheets"
    
    async def _ensure_spreadsheets_dir(self):
        """Ensure the spreadsheets directory exists"""
        full_path = f"{self.workspace_path}/{self.spreadsheets_dir}"
        try:
            await self.sandbox.fs.create_folder(full_path, "755")
        except:
            pass
    
    def _validate_and_normalize_path(self, path: str, must_exist: bool = False) -> tuple[str, str]:
        """
        Validate and normalize a file path to ensure it's under /workspace.
        Prevents path traversal attacks and ensures paths never escape /workspace.
        
        Args:
            path: Input path (can be absolute or relative)
            must_exist: If True, validate that the file exists (not implemented here, check separately)
            
        Returns:
            Tuple of (cleaned_relative_path, full_path)
            
        Raises:
            ValueError: If path is invalid or escapes /workspace
        """
        if not path or not isinstance(path, str):
            raise ValueError("Path must be a non-empty string")
        
        # Clean path using base class method (removes /workspace prefix if present)
        cleaned_path = self.clean_path(path)
        
        # Security: Prevent path traversal attacks and normalize
        # Remove any Windows-style backslashes
        cleaned_path = cleaned_path.replace('\\', '/')
        
        # Split into parts and normalize
        parts = cleaned_path.split('/')
        normalized_parts = []
        
        for part in parts:
            if part == '..':
                # Path traversal attempt - remove previous part if exists, but never go above workspace
                if normalized_parts:
                    normalized_parts.pop()
                # If already at root, ignore the ..
            elif part == '.':
                # Current directory reference - ignore
                continue
            elif part and part != '':
                # Valid path component
                normalized_parts.append(part)
        
        # Reconstruct cleaned path
        cleaned_path = '/'.join(normalized_parts)
        
        # Final security checks
        if cleaned_path.startswith('/'):
            raise ValueError("Path must be relative to /workspace, not absolute")
        
        if '..' in cleaned_path or '\\' in cleaned_path:
            raise ValueError("Path cannot contain '..' or backslashes (path traversal not allowed)")
        
        # Construct full path
        full_path = f"{self.workspace_path}/{cleaned_path}"
        
        # Ensure it's still under workspace (final security check using realpath logic)
        # Normalize the full path to detect any remaining traversal
        normalized_full = '/'.join([self.workspace_path] + normalized_parts)
        if not normalized_full.startswith(self.workspace_path + '/') and normalized_full != self.workspace_path:
            raise ValueError(f"Invalid path: path must be under {self.workspace_path}")
        
        return cleaned_path, full_path
    
    async def _ensure_directory_exists(self, file_path: str):
        """Ensure the parent directory of a file path exists.
        
        Args:
            file_path: Full path (must already be validated and under /workspace)
        """
        try:
            # Extract directory path
            parent_dir = '/'.join(file_path.split('/')[:-1])
            if parent_dir and parent_dir != self.workspace_path:
                # Security: Ensure parent_dir is still under workspace
                if not parent_dir.startswith(self.workspace_path + '/') and parent_dir != self.workspace_path:
                    logger.warning(f"Attempted to create directory outside workspace: {parent_dir}")
                    return
                # Only create if it's a subdirectory
                await self.sandbox.fs.create_folder(parent_dir, "755")
        except Exception as e:
            # Directory might already exist, which is fine
            logger.debug(f"Directory creation note (may already exist): {str(e)}")
    
    def _parse_cell_value(self, value: Any) -> Any:
        """Parse and convert cell value to appropriate type"""
        if isinstance(value, (int, float, bool)):
            return value
        if isinstance(value, str):
            # Handle ISO date strings
            if re.match(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?', value):
                try:
                    if 'T' in value:
                        return datetime.fromisoformat(value.replace('Z', '+00:00'))
                    else:
                        return datetime.strptime(value, '%Y-%m-%d')
                except:
                    pass
            # Try to convert to number if it looks like one
            try:
                if '.' in value:
                    return float(value)
                return int(value)
            except ValueError:
                return value
        if value is None:
            return None
        return str(value)
    
    async def _save_workbook_to_sandbox(self, workbook: Workbook, file_path: str) -> bytes:
        """Save workbook to sandbox filesystem and return bytes"""
        try:
            buffer = io.BytesIO()
            workbook.save(buffer)
            buffer.seek(0)
            file_bytes = buffer.getvalue()
            await self.sandbox.fs.upload_file(file_bytes, file_path)
            return file_bytes
        except Exception as e:
            raise Exception(f"Failed to save workbook to {file_path}: {str(e)}")
    
    # (All other spreadsheet operations are intentionally removed.
    # This tool now operates strictly via standardized JSON assembly + render_spreadsheet.)

    # ==================== FUNCTION 11: render_spreadsheet ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "render_spreadsheet",
            "description": "Create a complete spreadsheet from a standardized spec. The full standardized JSON is built by the backend only; the LLM must not build structure—it supplies only content and optional overrides (e.g. sheet name, table values, format keys). Backend fills all missing format keys from workbook defaults (except in formats[] where only provided keys are applied). Supports tables (2D values at anchor), cells (value or formula), and format entries. Colors: font_color and fill_color, hex RRGGBB or #RRGGBB. Operations per sheet: tables → cells → formats.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sheets": {
                        "type": "array",
                        "description": "Array of sheet specifications. Each sheet has a name and optional tables, cells, and formats.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Sheet name (max 31 characters)."},
                                "tables": {
                                    "type": "array",
                                    "description": "Tables to write. Each table has an anchor cell and 2D values array.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "anchor": {"type": "string", "description": "Top-left cell for the table (e.g. 'A1').", "default": "A1"},
                                            "values": {
                                                "type": "array",
                                                "description": "2D array of values (rows x cols).",
                                                "items": {"type": "array", "items": {"type": ["string", "number", "boolean", "null"]}}
                                            },
                                            "header": {"type": "boolean", "description": "If true, first row is treated as header (auto bold + border).", "default": False},
                                            "format": {
                                                "type": "object",
                                                "description": "Optional format applied to entire table range. Backend fills missing keys from workbook defaults.",
                                                "properties": {
                                                    "number_format": {"type": "string", "description": "Number format code (e.g. 'General', '0.00', '$#,##0.00')."},
                                                    "bold": {"type": "boolean", "description": "Bold text."},
                                                    "italic": {"type": "boolean", "description": "Italic text."},
                                                    "font_size": {"type": "number", "description": "Font size in points."},
                                                    "font_color": {"type": "string", "description": "Text color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "fill_color": {"type": "string", "description": "Cell background color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "alignment": {"type": "string", "enum": ["left", "center", "right", "top", "bottom", "middle"], "description": "Text alignment."},
                                                    "wrap_text": {"type": "boolean", "description": "Wrap text in cells."},
                                                    "border": {"type": "boolean", "description": "Draw border around cells."}
                                                }
                                            }
                                        },
                                        "required": ["values"]
                                    }
                                },
                                "cells": {
                                    "type": "array",
                                    "description": "Individual cell values or formulas.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "cell": {"type": "string", "description": "Cell reference in A1 format."},
                                            "value": {"type": ["string", "number", "boolean", "null"], "description": "Cell value."},
                                            "formula": {"type": "string", "description": "Formula starting with '=' (e.g. '=SUM(A1:A10)')."},
                                            "format": {
                                                "type": "object",
                                                "description": "Optional format for this cell. Backend fills missing keys from workbook defaults.",
                                                "properties": {
                                                    "number_format": {"type": "string", "description": "Number format code (e.g. 'General', '0.00', '$#,##0.00')."},
                                                    "bold": {"type": "boolean", "description": "Bold text."},
                                                    "italic": {"type": "boolean", "description": "Italic text."},
                                                    "font_size": {"type": "number", "description": "Font size in points."},
                                                    "font_color": {"type": "string", "description": "Text color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "fill_color": {"type": "string", "description": "Cell background color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "alignment": {"type": "string", "enum": ["left", "center", "right", "top", "bottom", "middle"], "description": "Text alignment."},
                                                    "wrap_text": {"type": "boolean", "description": "Wrap text in cells."},
                                                    "border": {"type": "boolean", "description": "Draw border around cells."}
                                                }
                                            }
                                        },
                                        "required": ["cell"]
                                    }
                                },
                                "formats": {
                                    "type": "array",
                                    "description": "Formatting-only entries (no value changes).",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "target": {"type": "string", "description": "Cell (A1) or range (A1:C3) to format."},
                                            "format": {
                                                "type": "object",
                                                "description": "Only the keys you set are applied; others are left unchanged. Backend does not fill defaults for formats[] entries.",
                                                "properties": {
                                                    "number_format": {"type": "string", "description": "Number format code (e.g. 'General', '0.00', '$#,##0.00')."},
                                                    "bold": {"type": "boolean", "description": "Bold text."},
                                                    "italic": {"type": "boolean", "description": "Italic text."},
                                                    "font_size": {"type": "number", "description": "Font size in points."},
                                                    "font_color": {"type": "string", "description": "Text color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "fill_color": {"type": "string", "description": "Cell background color: hex RRGGBB or #RRGGBB. Backend normalizes to RRGGBB."},
                                                    "alignment": {"type": "string", "enum": ["left", "center", "right", "top", "bottom", "middle"], "description": "Text alignment."},
                                                    "wrap_text": {"type": "boolean", "description": "Wrap text in cells."},
                                                    "border": {"type": "boolean", "description": "Draw border around cells."}
                                                }
                                            }
                                        },
                                        "required": ["target", "format"]
                                    }
                                }
                            },
                            "required": ["name"]
                        }
                    },
                    "output_filename": {"type": "string", "description": "Output filename (e.g. 'report.xlsx').", "default": "workbook.xlsx"},
                    "default_font_name": {"type": "string", "description": "Default font name for the workbook.", "default": "Calibri"},
                    "default_font_size": {"type": "number", "description": "Default font size in points.", "default": 11},
                    "default_font_color": {"type": "string", "description": "Default font color in standardized JSON: hex RRGGBB or #RRGGBB (e.g. '000000'). Backend normalizes to RRGGBB.", "default": "000000"},
                    "default_number_format": {"type": "string", "description": "Default number format code for cells (e.g. 'General', '0.00').", "default": "General"},
                    "default_alignment": {"type": "string", "enum": ["left", "center", "right", "top", "bottom", "middle"], "description": "Default alignment.", "default": "left"},
                    "default_wrap_text": {"type": "boolean", "description": "Default wrap_text for formatted cells.", "default": False},
                    "default_border": {"type": "boolean", "description": "Default border for formatted cells.", "default": False},
                },
                "required": ["sheets"],
            },
        },
    })
    async def render_spreadsheet(
        self,
        sheets: List[Dict[str, Any]],
        output_filename: str = "workbook.xlsx",
        default_font_name: str = "Calibri",
        default_font_size: float = 11,
        default_font_color: str = "000000",
        default_number_format: str = "General",
        default_alignment: str = "left",
        default_wrap_text: bool = False,
        default_border: bool = False,
    ) -> ToolResult:
        """Create a complete spreadsheet from a standardized spec.
        Backend assembles full standardized JSON with defaults; LLM provides
        content and overrides only."""
        try:
            await self._ensure_sandbox()
            await self._ensure_spreadsheets_dir()

            if not sheets or not isinstance(sheets, list):
                return self.fail_response("'sheets' must be a non-empty array of sheet objects.")

            # --- Backend assembles the full standardized workbook JSON ---
            assembled = _assemble_workbook(
                sheets=sheets,
                default_font_name=default_font_name,
                default_font_size=default_font_size,
                default_font_color=default_font_color,
                default_number_format=default_number_format,
                default_alignment=default_alignment,
                default_wrap_text=default_wrap_text,
                default_border=default_border,
            )

            assembled_sheets = assembled["sheets"]
            workbook_defaults = assembled["workbook"]["defaults"]

            if not assembled_sheets:
                return self.fail_response("No valid sheets found in the spec.")

            # --- Build the .xlsx ---
            workbook = Workbook()
            # Remove the default sheet created by openpyxl
            workbook.remove(workbook.active)

            ops_summary = {"tables": 0, "cells": 0, "formats": 0}

            for sheet_spec in assembled_sheets:
                ws = workbook.create_sheet(title=sheet_spec["name"])

                # 1. Write tables
                for table in sheet_spec["tables"]:
                    anchor_row, anchor_col = _parse_cell_ref(table["anchor"])
                    values = table["values"]

                    for row_idx, row_data in enumerate(values):
                        for col_idx, val in enumerate(row_data):
                            cell = ws.cell(
                                row=anchor_row + row_idx,
                                column=anchor_col + col_idx,
                            )
                            cell.value = self._parse_cell_value(val)

                    num_rows = len(values)
                    num_cols = len(values[0]) if values else 0
                    end_row = anchor_row + num_rows - 1
                    end_col = anchor_col + num_cols - 1

                    # Apply table-wide format if provided
                    if table["format"]:
                        table_fmt = dict(table["format"])
                        table_fmt["font_name"] = workbook_defaults["font_name"]
                        _apply_format(ws, anchor_row, anchor_col, end_row, end_col, table_fmt)

                    # Auto-format header row if header=True
                    if table["header"] and values:
                        header_fmt: Dict[str, Any] = {
                            "bold": True,
                            "border": True,
                            "font_name": workbook_defaults["font_name"],
                        }
                        _apply_format(ws, anchor_row, anchor_col, anchor_row, end_col, header_fmt)

                    ops_summary["tables"] += 1

                # 2. Write individual cells (values / formulas)
                for cell_spec in sheet_spec["cells"]:
                    cell_ref = cell_spec["cell"]
                    cell_obj = ws[cell_ref]

                    if cell_spec["formula"]:
                        cell_obj.value = cell_spec["formula"]
                    else:
                        cell_obj.value = self._parse_cell_value(cell_spec["value"])

                    # Apply per-cell format if provided
                    if cell_spec["format"]:
                        row, col = _parse_cell_ref(cell_ref)
                        cell_fmt = dict(cell_spec["format"])
                        cell_fmt["font_name"] = workbook_defaults["font_name"]
                        _apply_format(ws, row, col, row, col, cell_fmt)

                    ops_summary["cells"] += 1

                # 3. Apply standalone formats
                for fmt_entry in sheet_spec["formats"]:
                    target = fmt_entry["target"]
                    fmt = dict(fmt_entry["format"])
                    fmt["font_name"] = workbook_defaults["font_name"]

                    if ':' in target:
                        sr, sc, er, ec = _parse_range_ref(target)
                    else:
                        r, c = _parse_cell_ref(target)
                        sr, sc, er, ec = r, c, r, c

                    _apply_format(ws, sr, sc, er, ec, fmt)
                    ops_summary["formats"] += 1

            # --- Save to sandbox ---
            safe_name = _sanitize_xlsx_filename(output_filename)
            relative_path = f"{self.spreadsheets_dir}/{safe_name}"
            cleaned, full_path = self._validate_and_normalize_path(f"/workspace/{relative_path}")

            # Delete existing file defensively (matches docx behaviour)
            try:
                await self.sandbox.fs.delete_file(full_path)
            except Exception:
                pass

            await self._ensure_directory_exists(full_path)
            await self._save_workbook_to_sandbox(workbook, full_path)

            logger.info(
                "sb_spreadsheet_tool render_spreadsheet: sheets=%s path=%s",
                len(assembled_sheets), full_path,
            )
            return self.success_response({
                "saved_path": full_path,
                "relative_path": f"/workspace/{cleaned}",
                "sheet_names": workbook.sheetnames,
                "total_sheets": len(workbook.sheetnames),
                "ops_applied": ops_summary,
            })

        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            logger.exception("sb_spreadsheet_tool render_spreadsheet failed")
            return self.fail_response(f"Failed to render spreadsheet: {str(e)}")
