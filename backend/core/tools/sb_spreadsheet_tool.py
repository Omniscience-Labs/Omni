from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from typing import List, Dict, Optional, Union, Any
import json
import os
from datetime import datetime
import re
import io
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import column_index_from_string
from openpyxl.cell.cell import Cell
from pathlib import Path


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
    Core spreadsheet tool for creating and managing Excel (.xlsx) files.
    Uses openpyxl for XLSX manipulation and saves files to sandbox filesystem.
    
    Overwrite policy: create_spreadsheet overwrites existing files by default (overwrite=True).
    Last sheet protection: delete_sheet will auto-create a default "Sheet1" if deleting the last sheet.
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
    
    def _sanitize_filename(self, name: str) -> str:
        """Convert name to safe filename"""
        safe = "".join(c for c in name if c.isalnum() or c in "-_./").strip()
        if safe.startswith('.'):
            safe = safe[1:]
        return safe if safe else "spreadsheet"
    
    def _validate_cell_reference(self, cell_ref: str) -> bool:
        """Validate A1-style cell reference"""
        pattern = r'^[A-Z]+[0-9]+$'
        return bool(re.match(pattern, cell_ref.upper()))
    
    def _validate_range(self, range_ref: str) -> bool:
        """Validate A1:B10-style range reference"""
        if ':' not in range_ref:
            return False
        parts = range_ref.split(':')
        if len(parts) != 2:
            return False
        return self._validate_cell_reference(parts[0]) and self._validate_cell_reference(parts[1])
    
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
    
    def _parse_range(self, range_ref: str) -> tuple[int, int, int, int]:
        """Parse A1:B10 range into (start_row, start_col, end_row, end_col)"""
        start_cell, end_cell = range_ref.split(':')
        start_col = column_index_from_string(re.match(r'^([A-Z]+)', start_cell.upper()).group(1))
        start_row = int(re.match(r'[A-Z]+(\d+)$', start_cell.upper()).group(1))
        end_col = column_index_from_string(re.match(r'^([A-Z]+)', end_cell.upper()).group(1))
        end_row = int(re.match(r'[A-Z]+(\d+)$', end_cell.upper()).group(1))
        return start_row, start_col, end_row, end_col
    
    async def _load_workbook_from_sandbox(self, file_path: str) -> Workbook:
        """Load workbook from sandbox filesystem"""
        try:
            file_content = await self.sandbox.fs.download_file(file_path)
            workbook = load_workbook(io.BytesIO(file_content))
            return workbook
        except Exception as e:
            raise Exception(f"Failed to load workbook from {file_path}: {str(e)}")
    
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
    
    def _get_preview_data(self, worksheet, max_rows: int = 10, max_cols: int = 10) -> Dict[str, Any]:
        """Extract preview data from worksheet for frontend display"""
        headers = []
        rows = []
        
        # Get headers from first row
        if worksheet.max_row > 0:
            for col in range(1, min(worksheet.max_column + 1, max_cols + 1)):
                cell = worksheet.cell(row=1, column=col)
                headers.append(str(cell.value) if cell.value is not None else f"Column {col}")
        
        # Get data rows (skip header)
        for row_idx in range(2, min(worksheet.max_row + 1, max_rows + 2)):
            row_data = []
            for col in range(1, min(worksheet.max_column + 1, max_cols + 1)):
                cell = worksheet.cell(row=row_idx, column=col)
                value = cell.value
                if isinstance(value, datetime):
                    value = value.strftime("%Y-%m-%d %H:%M:%S")
                row_data.append(str(value) if value is not None else "")
            if any(row_data):  # Only add non-empty rows
                rows.append(row_data)
        
        return {
            "headers": headers,
            "rows": rows
        }
    
    def _fail_with_details(self, message: str, details: Optional[Dict[str, Any]] = None) -> ToolResult:
        """Create a failed tool result with optional details"""
        if details:
            error_output = {
                "ok": False,
                "error": message,
                "details": details
            }
            return ToolResult(success=False, output=json.dumps(error_output))
        else:
            return self.fail_response(message)
    
    # ==================== FUNCTION 1: create_spreadsheet ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_spreadsheet",
            "description": "Create a new Excel spreadsheet (.xlsx) file. If file already exists and overwrite=True, it will be overwritten. Returns the file path and sheet names.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Desired output path under /workspace (e.g., '/workspace/spreadsheets/workbook.xlsx'). Defaults to '/workspace/spreadsheets/workbook.xlsx' if not provided.",
                        "default": "/workspace/spreadsheets/workbook.xlsx"
                    },
                    "sheets": {
                        "type": "array",
                        "description": "Optional list of initial sheet names. If omitted, creates default workbook with 'Sheet1'.",
                        "items": {"type": "string"}
                    },
                    "overwrite": {
                        "type": "boolean",
                        "description": "If True, overwrite existing file. If False, return error if file exists. Default: True",
                        "default": True
                    }
                },
                "required": []
            }
        }
    })
    async def create_spreadsheet(
        self,
        path: Optional[str] = None,
        sheets: Optional[List[str]] = None,
        overwrite: bool = True
    ) -> ToolResult:
        """Create a new spreadsheet with optional initial sheets"""
        try:
            await self._ensure_sandbox()
            await self._ensure_spreadsheets_dir()
            
            # Default path
            if not path:
                path = "/workspace/spreadsheets/workbook.xlsx"
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Ensure .xlsx extension
            if not full_path.endswith('.xlsx'):
                full_path += '.xlsx'
                # Re-validate after adding extension
                try:
                    cleaned_path, full_path = self._validate_and_normalize_path(full_path)
                except ValueError as e:
                    return self.fail_response(f"Invalid path after extension: {str(e)}")
            
            # Ensure parent directory exists
            await self._ensure_directory_exists(full_path)
            
            # Check if file exists
            try:
                file_info = await self.sandbox.fs.get_file_info(full_path)
                if file_info and not overwrite:
                    return self.fail_response(f"File already exists at {full_path}. Set overwrite=True to overwrite.")
            except:
                pass  # File doesn't exist, proceed
            
            # Create workbook
            workbook = Workbook()
            
            # Remove default sheet if we have custom sheets
            if sheets:
                workbook.remove(workbook.active)
                for sheet_name in sheets:
                    # Excel sheet name limit is 31 characters
                    safe_sheet_name = sheet_name[:31]
                    workbook.create_sheet(title=safe_sheet_name)
            else:
                # Use default Sheet1
                workbook.active.title = "Sheet1"
            
            # Save to sandbox
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            sheet_names = workbook.sheetnames
            
            logger.info(f"Created spreadsheet: {full_path} with sheets: {sheet_names}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "sheet_names": sheet_names
            })
            
        except Exception as e:
            logger.error(f"Error creating spreadsheet: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to create spreadsheet: {str(e)}")
    
    # ==================== FUNCTION 2: add_sheet ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_sheet",
            "description": "Add a new worksheet to an existing workbook.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the new sheet (max 31 characters)"
                    }
                },
                "required": ["path", "sheet_name"]
            }
        }
    })
    async def add_sheet(
        self,
        path: str,
        sheet_name: str
    ) -> ToolResult:
        """Add a new worksheet to workbook"""
        try:
            await self._ensure_sandbox()
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Validate sheet name length
            if len(sheet_name) > 31:
                return self.fail_response(f"Sheet name too long (max 31 characters): {sheet_name}")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Check if sheet already exists
            if sheet_name in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' already exists. Available sheets: {', '.join(workbook.sheetnames)}")
            
            # Create new sheet
            workbook.create_sheet(title=sheet_name)
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            logger.info(f"Added sheet '{sheet_name}' to {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "sheet_names": workbook.sheetnames
            })
            
        except Exception as e:
            logger.error(f"Error adding sheet: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to add sheet: {str(e)}")
    
    # ==================== FUNCTION 3: delete_sheet ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "delete_sheet",
            "description": "Delete a worksheet from a workbook. If deleting the last sheet, automatically creates a default 'Sheet1' to satisfy Excel's requirement of at least one sheet.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet to delete"
                    }
                },
                "required": ["path", "sheet_name"]
            }
        }
    })
    async def delete_sheet(
        self,
        path: str,
        sheet_name: str
    ) -> ToolResult:
        """Delete a worksheet from workbook"""
        try:
            await self._ensure_sandbox()
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Check if sheet exists
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            
            # Protect against deleting last sheet
            if len(workbook.sheetnames) == 1:
                # Auto-create default sheet before deleting
                workbook.create_sheet(title="Sheet1")
                logger.info(f"Auto-created default 'Sheet1' before deleting last sheet")
            
            # Delete sheet
            del workbook[sheet_name]
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            logger.info(f"Deleted sheet '{sheet_name}' from {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "sheet_names": workbook.sheetnames
            })
            
        except Exception as e:
            logger.error(f"Error deleting sheet: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to delete sheet: {str(e)}")
    
    # ==================== FUNCTION 4: update_cell ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "update_cell",
            "description": "Update a single cell in a spreadsheet with a value. Supports string, number, bool, null, and ISO date strings.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "cell": {
                        "type": "string",
                        "description": "Cell reference in A1 format (e.g., 'A1', 'B5')"
                    },
                    "value": {
                        "type": ["string", "number", "boolean", "null"],
                        "description": "Value to set. Can be string, number, bool, null, or ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
                    }
                },
                "required": ["path", "sheet_name", "cell", "value"]
            }
        }
    })
    async def update_cell(
        self,
        path: str,
        sheet_name: str,
        cell: str,
        value: Union[str, int, float, bool, None]
    ) -> ToolResult:
        """Update a single cell"""
        try:
            await self._ensure_sandbox()
            
            # Validate cell reference
            if not self._validate_cell_reference(cell):
                return self.fail_response(f"Invalid cell reference: {cell}. Expected format: A1")
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Update cell
            cell_obj = worksheet[cell.upper()]
            cell_obj.value = self._parse_cell_value(value)
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            logger.info(f"Updated cell {cell} in {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "updated_cell": cell.upper(),
                "value": str(value) if value is not None else None
            })
            
        except Exception as e:
            logger.error(f"Error updating cell: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to update cell: {str(e)}")
    
    # ==================== FUNCTION 5: update_range ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "update_range",
            "description": "Update a range of cells with values from a 2D array. Use 'range' parameter (A1:C3 format) to specify the target range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "range": {
                        "type": "string",
                        "description": "Cell range in A1:C3 format where data will be written"
                    },
                    "values": {
                        "type": "array",
                        "description": "2D array of values (rows x cols) to write. Number of rows/columns should match the range.",
                        "items": {
                            "type": "array",
                            "items": {
                                "type": ["string", "number", "boolean", "null"]
                            }
                        }
                    }
                },
                "required": ["path", "sheet_name", "range", "values"]
            }
        }
    })
    async def update_range(
        self,
        path: str,
        sheet_name: str,
        range: str,
        values: List[List[Any]]
    ) -> ToolResult:
        """Update a range of cells"""
        try:
            await self._ensure_sandbox()
            
            # Validate range
            if not self._validate_range(range):
                return self.fail_response(f"Invalid range format: {range}. Expected format: A1:C3")
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Parse range
            start_row, start_col, end_row, end_col = self._parse_range(range)
            
            # Validate dimensions
            expected_rows = end_row - start_row + 1
            expected_cols = end_col - start_col + 1
            actual_rows = len(values)
            actual_cols = len(values[0]) if values else 0
            
            if actual_rows != expected_rows or actual_cols != expected_cols:
                return self.fail_response(
                    f"Data dimensions ({actual_rows}x{actual_cols}) don't match range dimensions ({expected_rows}x{expected_cols})"
                )
            
            # Write data
            for row_idx, row_data in enumerate(values):
                for col_idx, value in enumerate(row_data):
                    cell = worksheet.cell(row=start_row + row_idx, column=start_col + col_idx)
                    cell.value = self._parse_cell_value(value)
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            logger.info(f"Updated range {range} in {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "range_written": range,
                "rows": len(values),
                "cols": len(values[0]) if values else 0
            })
            
        except Exception as e:
            logger.error(f"Error updating range: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to update range: {str(e)}")
    
    # ==================== FUNCTION 6: read_cell ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "read_cell",
            "description": "Read a single cell value from a spreadsheet. Returns the value and formula if present.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "cell": {
                        "type": "string",
                        "description": "Cell reference in A1 format (e.g., 'A1', 'B5')"
                    }
                },
                "required": ["path", "sheet_name", "cell"]
            }
        }
    })
    async def read_cell(
        self,
        path: str,
        sheet_name: str,
        cell: str
    ) -> ToolResult:
        """Read a single cell value"""
        try:
            await self._ensure_sandbox()
            
            # Validate cell reference
            if not self._validate_cell_reference(cell):
                return self.fail_response(f"Invalid cell reference: {cell}. Expected format: A1")
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Read cell
            cell_obj = worksheet[cell.upper()]
            
            # Get formula if present (openpyxl stores formulas separately)
            formula = None
            value = cell_obj.value
            
            # Check if cell contains a formula
            if hasattr(cell_obj, 'data_type') and cell_obj.data_type == 'f':
                # Cell contains a formula - value is the formula string
                formula = str(cell_obj.value) if cell_obj.value else None
                # For formulas, we return the formula string as the value
                # (openpyxl doesn't compute formula results without Excel engine)
                value = formula
            else:
                # Regular cell value - format for output
                if isinstance(value, datetime):
                    value = value.isoformat()
                elif value is None:
                    value = None
                else:
                    value = str(value)
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "value": value,
                "formula": formula
            })
            
        except Exception as e:
            logger.error(f"Error reading cell: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to read cell: {str(e)}")
    
    # ==================== FUNCTION 7: read_range ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "read_range",
            "description": "Read a range of cells from a spreadsheet. Returns a 2D array of values.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "range": {
                        "type": "string",
                        "description": "Cell range in A1:C10 format"
                    }
                },
                "required": ["path", "sheet_name", "range"]
            }
        }
    })
    async def read_range(
        self,
        path: str,
        sheet_name: str,
        range: str
    ) -> ToolResult:
        """Read a range of cells"""
        try:
            await self._ensure_sandbox()
            
            # Validate range
            if not self._validate_range(range):
                return self.fail_response(f"Invalid range format: {range}. Expected format: A1:C10")
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Parse range
            start_row, start_col, end_row, end_col = self._parse_range(range)
            
            # Read data
            values = []
            for row in worksheet.iter_rows(min_row=start_row, max_row=end_row, min_col=start_col, max_col=end_col, values_only=True):
                row_values = []
                for cell_value in row:
                    if isinstance(cell_value, datetime):
                        row_values.append(cell_value.isoformat())
                    elif cell_value is None:
                        row_values.append(None)
                    else:
                        row_values.append(str(cell_value))
                values.append(row_values)
            
            rows = len(values)
            cols = len(values[0]) if values else 0
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "values": values,
                "rows": rows,
                "cols": cols
            })
            
        except Exception as e:
            logger.error(f"Error reading range: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to read range: {str(e)}")
    
    # ==================== FUNCTION 8: read_spreadsheet ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "read_spreadsheet",
            "description": "Read and summarize a spreadsheet workbook. Returns metadata and optionally preview data for specified sheets.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "include_sheets": {
                        "type": "array",
                        "description": "Optional list of sheet names to include. If omitted and include_all=False, includes all sheets.",
                        "items": {"type": "string"}
                    },
                    "include_all": {
                        "type": "boolean",
                        "description": "If True, include all sheets. Default: True",
                        "default": True
                    },
                    "max_rows": {
                        "type": "integer",
                        "description": "Maximum number of rows to read per sheet for preview. Default: 10",
                        "default": 10
                    },
                    "max_cols": {
                        "type": "integer",
                        "description": "Maximum number of columns to read per sheet for preview. Default: 10",
                        "default": 10
                    }
                },
                "required": ["path"]
            }
        }
    })
    async def read_spreadsheet(
        self,
        path: str,
        include_sheets: Optional[List[str]] = None,
        include_all: bool = True,
        max_rows: int = 10,
        max_cols: int = 10
    ) -> ToolResult:
        """Read and summarize spreadsheet"""
        try:
            await self._ensure_sandbox()
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Determine which sheets to include
            if include_sheets:
                sheets_to_read = [s for s in include_sheets if s in workbook.sheetnames]
                if len(sheets_to_read) != len(include_sheets):
                    missing = [s for s in include_sheets if s not in workbook.sheetnames]
                    return self.fail_response(f"Sheet(s) not found: {', '.join(missing)}. Available: {', '.join(workbook.sheetnames)}")
            elif include_all:
                sheets_to_read = workbook.sheetnames
            else:
                sheets_to_read = workbook.sheetnames
            
            # Build metadata and preview
            metadata = {
                "file_path": full_path,
                "sheet_names": workbook.sheetnames,
                "total_sheets": len(workbook.sheetnames)
            }
            
            preview_data = {}
            for sheet_name in sheets_to_read:
                worksheet = workbook[sheet_name]
                preview = self._get_preview_data(worksheet, max_rows=max_rows, max_cols=max_cols)
                preview_data[sheet_name] = {
                    "max_row": worksheet.max_row,
                    "max_column": worksheet.max_column,
                    "preview": preview
                }
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "metadata": metadata,
                "preview_data": preview_data
            })
            
        except Exception as e:
            logger.error(f"Error reading spreadsheet: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to read spreadsheet: {str(e)}")
    
    # ==================== FUNCTION 9: set_formula ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "set_formula",
            "description": "Set a formula in a cell. The formula string must start with '='. Note: openpyxl stores the formula but does not compute results - Excel will compute when opened.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "cell": {
                        "type": "string",
                        "description": "Cell reference in A1 format (e.g., 'A1', 'B5')"
                    },
                    "formula": {
                        "type": "string",
                        "description": "Formula string starting with '=' (e.g., '=SUM(A1:A10)', '=B2*2')"
                    }
                },
                "required": ["path", "sheet_name", "cell", "formula"]
            }
        }
    })
    async def set_formula(
        self,
        path: str,
        sheet_name: str,
        cell: str,
        formula: str
    ) -> ToolResult:
        """Set a formula in a cell"""
        try:
            await self._ensure_sandbox()
            
            # Validate cell reference
            if not self._validate_cell_reference(cell):
                return self.fail_response(f"Invalid cell reference: {cell}. Expected format: A1")
            
            # Validate formula
            if not formula.startswith('='):
                return self.fail_response(f"Formula must start with '='. Got: {formula}")
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Set formula
            cell_obj = worksheet[cell.upper()]
            cell_obj.value = formula
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            logger.info(f"Set formula in cell {cell} in {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "cell": cell.upper(),
                "formula": formula
            })
            
        except Exception as e:
            logger.error(f"Error setting formula: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to set formula: {str(e)}")
    
    # ==================== FUNCTION 10: format_cells ====================
    @openapi_schema({
        "type": "function",
        "function": {
            "name": "format_cells",
            "description": "Apply formatting to cells. Target can be a single cell (A1) or range (A1:C3). Supports number_format, bold, italic, font_size, font_color, fill_color, alignment, wrap_text, and border.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to existing workbook file"
                    },
                    "sheet_name": {
                        "type": "string",
                        "description": "Name of the sheet"
                    },
                    "target": {
                        "type": "string",
                        "description": "Single cell (A1) or range (A1:C3) to format"
                    },
                    "format": {
                        "type": "object",
                        "description": "Formatting options object",
                        "properties": {
                            "number_format": {"type": "string", "description": "Number format code (e.g., '0.00', 'mm/dd/yyyy', '$#,##0')"},
                            "bold": {"type": "boolean", "description": "Make text bold"},
                            "italic": {"type": "boolean", "description": "Make text italic"},
                            "font_size": {"type": "integer", "description": "Font size"},
                            "font_color": {"type": "string", "description": "Font color in hex format without # (e.g., 'FF0000' for red)"},
                            "fill_color": {"type": "string", "description": "Background color in hex format without # (e.g., 'FFFF00' for yellow)"},
                            "alignment": {"type": "string", "enum": ["left", "center", "right", "top", "bottom", "middle"], "description": "Text alignment"},
                            "wrap_text": {"type": "boolean", "description": "Wrap text in cells"},
                            "border": {"type": "boolean", "description": "Add border around cells"}
                        }
                    }
                },
                "required": ["path", "sheet_name", "target", "format"]
            }
        }
    })
    async def format_cells(
        self,
        path: str,
        sheet_name: str,
        target: str,
        format: Dict[str, Any]
    ) -> ToolResult:
        """Apply formatting to cells"""
        try:
            await self._ensure_sandbox()
            
            # Determine if target is cell or range
            is_range = ':' in target
            if is_range:
                if not self._validate_range(target):
                    return self.fail_response(f"Invalid range format: {target}. Expected format: A1:C3")
                start_row, start_col, end_row, end_col = self._parse_range(target)
            else:
                if not self._validate_cell_reference(target):
                    return self.fail_response(f"Invalid cell reference: {target}. Expected format: A1")
                # Convert single cell to range
                cell_col = column_index_from_string(re.match(r'^([A-Z]+)', target.upper()).group(1))
                cell_row = int(re.match(r'[A-Z]+(\d+)$', target.upper()).group(1))
                start_row, start_col, end_row, end_col = cell_row, cell_col, cell_row, cell_col
            
            # Validate and normalize path (prevents path traversal)
            try:
                cleaned_path, full_path = self._validate_and_normalize_path(path, must_exist=True)
            except ValueError as e:
                return self.fail_response(f"Invalid path: {str(e)}. Paths must be relative to /workspace.")
            
            # Load workbook
            workbook = await self._load_workbook_from_sandbox(full_path)
            
            # Get worksheet
            if sheet_name not in workbook.sheetnames:
                return self.fail_response(f"Sheet '{sheet_name}' not found. Available sheets: {', '.join(workbook.sheetnames)}")
            worksheet = workbook[sheet_name]
            
            # Apply formatting
            applied_keys = []
            for row in worksheet.iter_rows(min_row=start_row, max_row=end_row, min_col=start_col, max_col=end_col):
                for cell in row:
                    # Number format
                    if "number_format" in format:
                        cell.number_format = format["number_format"]
                        applied_keys.append("number_format")
                    
                    # Font formatting
                    font_updates = {}
                    if "bold" in format:
                        font_updates["bold"] = format["bold"]
                        applied_keys.append("bold")
                    if "italic" in format:
                        font_updates["italic"] = format["italic"]
                        applied_keys.append("italic")
                    if "font_size" in format:
                        font_updates["size"] = format["font_size"]
                        applied_keys.append("font_size")
                    if "font_color" in format:
                        from openpyxl.styles.colors import Color
                        font_updates["color"] = Color(rgb=format["font_color"])
                        applied_keys.append("font_color")
                    
                    if font_updates:
                        current_font = cell.font if cell.font else Font()
                        font = Font(
                            bold=font_updates.get("bold", current_font.bold),
                            italic=font_updates.get("italic", current_font.italic),
                            size=font_updates.get("size", current_font.size),
                            color=font_updates.get("color", current_font.color)
                        )
                        cell.font = font
                    
                    # Fill color
                    if "fill_color" in format:
                        fill = PatternFill(start_color=format["fill_color"], end_color=format["fill_color"], fill_type="solid")
                        cell.fill = fill
                        applied_keys.append("fill_color")
                    
                    # Alignment
                    if "alignment" in format:
                        align_map = {
                            "left": Alignment(horizontal="left"),
                            "center": Alignment(horizontal="center"),
                            "right": Alignment(horizontal="right"),
                            "top": Alignment(vertical="top"),
                            "bottom": Alignment(vertical="bottom"),
                            "middle": Alignment(vertical="center")
                        }
                        cell.alignment = align_map.get(format["alignment"], Alignment(horizontal="left"))
                        applied_keys.append("alignment")
                    
                    # Wrap text
                    if "wrap_text" in format:
                        if cell.alignment:
                            cell.alignment.wrap_text = format["wrap_text"]
                        else:
                            cell.alignment = Alignment(wrap_text=format["wrap_text"])
                        applied_keys.append("wrap_text")
                    
                    # Border
                    if "border" in format and format["border"]:
                        thin_border = Border(
                            left=Side(style='thin'),
                            right=Side(style='thin'),
                            top=Side(style='thin'),
                            bottom=Side(style='thin')
                        )
                        cell.border = thin_border
                        applied_keys.append("border")
            
            # Save back
            await self._save_workbook_to_sandbox(workbook, full_path)
            
            # Remove duplicates from applied_keys
            applied_keys = list(set(applied_keys))
            
            logger.info(f"Formatted {target} in {full_path}")
            
            return self.success_response({
                "ok": True,
                "file_path": full_path,
                "formatted_target": target,
                "applied_keys": applied_keys
            })
            
        except Exception as e:
            logger.error(f"Error formatting cells: {str(e)}", exc_info=True)
            return self.fail_response(f"Failed to format cells: {str(e)}")
