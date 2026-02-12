"""
AI Word document tool: create and modify DOCX files with unique section IDs.

DocumentManager: createDocument, addParagraph, addHeading, addTable,
saveDocument, getDocumentStructure, deleteSection, addHyperlink.

ContentModifier: modifyText, modifyFontSize, modifyFontStyle, modifyAlignment.

Unique ID plan: global nextId; each add* returns id and stores in element_map
{id: {type, element, content, metadata}}. getDocumentStructure returns IDs with types and preview.
"""

from core.agentpress.tool import ToolResult, openapi_schema, tool_metadata
from core.sandbox.tool_base import SandboxToolsBase
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger
from typing import List, Dict, Optional, Any
import json
import io
import re
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.text.paragraph import Paragraph
from docx.table import Table


def _validate_and_normalize_path(workspace_path: str, path: str) -> tuple:
    """Validate and normalize path under /workspace. Returns (cleaned_relative_path, full_path)."""
    if not path or not isinstance(path, str):
        raise ValueError("Path must be a non-empty string")
    path = path.replace("\\", "/").strip()
    if path.startswith("/workspace/"):
        path = path[len("/workspace/"):].lstrip("/")
    parts = path.split("/")
    normalized = []
    for part in parts:
        if part == "..":
            if normalized:
                normalized.pop()
        elif part and part != ".":
            normalized.append(part)
    cleaned = "/".join(normalized)
    if ".." in cleaned or "\\" in cleaned:
        raise ValueError("Path cannot contain '..' or backslashes")
    full = f"{workspace_path}/{cleaned}"
    return cleaned, full


def _preview_text(text: str, max_len: int = 60) -> str:
    """Short preview for structure listing."""
    if not text:
        return "(empty)"
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] + "..." if len(text) > max_len else text


def _parse_alignment(alignment: str):
    """Map string to WD_ALIGN_PARAGRAPH. Supports: left, center, right, justify."""
    if not alignment:
        return WD_ALIGN_PARAGRAPH.LEFT
    a = alignment.strip().lower()
    return {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }.get(a, WD_ALIGN_PARAGRAPH.LEFT)


@tool_metadata(
    display_name="Word Documents",
    description="Create and edit Word (.docx) documents with paragraphs, headings, tables, and hyperlinks",
    icon="FileText",
    color="bg-indigo-100 dark:bg-indigo-800/50",
    weight=75,
    visible=True,
)
class SandboxDocxTool(SandboxToolsBase):
    """
    Word document tool: build a DOCX in memory with section IDs, then save to the sandbox.
    DocumentManager APIs add content and return section IDs; ContentModifier APIs change existing sections.
    """

    # File in sandbox storing path to the "current" document (so we can reload it in new requests)
    CURRENT_DOCX_PATH_FILE = "documents/.current_docx_path"

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.documents_dir = "documents"
        self._doc: Optional[Document] = None
        self._element_map: Dict[int, Dict[str, Any]] = {}
        self._order: List[int] = []
        self._next_id: int = 1

    async def _ensure_documents_dir(self) -> None:
        full_path = f"{self.workspace_path}/{self.documents_dir}"
        try:
            await self.sandbox.fs.create_folder(full_path, "755")
        except Exception:
            pass

    def _iter_block_items(self, parent: Document) -> Any:
        """Iterate block-level items (paragraphs, tables) in document order."""
        body = parent.element.body
        for child in body.iterchildren():
            if isinstance(child, CT_P):
                yield Paragraph(child, parent)
            elif isinstance(child, CT_Tbl):
                yield Table(child, parent)

    async def _load_document_from_sandbox(self) -> bool:
        """Load the current document from sandbox using stored path. Rebuilds _element_map and _order. Returns True if loaded."""
        try:
            path_file = f"{self.workspace_path}/{self.CURRENT_DOCX_PATH_FILE}"
            path_content = await self.sandbox.fs.download_file(path_file)
            rel_path = path_content.decode().strip()
            if not rel_path:
                return False
            full_path = f"{self.workspace_path}/{rel_path}"
            doc_bytes = await self.sandbox.fs.download_file(full_path)
            self._doc = Document(io.BytesIO(doc_bytes))
            self._element_map = {}
            self._order = []
            self._next_id = 1
            for block in self._iter_block_items(self._doc):
                content = block.text if hasattr(block, "text") else ""
                if hasattr(block, "style") and block.style and "Heading" in str(block.style.name):
                    section_type = "heading"
                    level = 1
                    if hasattr(block.style, "builtin") and "Heading" in str(block.style.name):
                        try:
                            level = int("".join(c for c in str(block.style.name) if c.isdigit()) or "1")
                        except Exception:
                            level = 1
                    metadata = {"level": level}
                elif isinstance(block, Table):
                    section_type = "table"
                    rows, cols = len(block.rows), len(block.columns)
                    metadata = {"rows": rows, "columns": cols}
                else:
                    section_type = "paragraph"
                    metadata = {}
                self._register(section_type, block, content, metadata)
            return True
        except Exception as e:
            logger.debug(f"Could not load current docx from sandbox: {e}")
            return False

    async def _ensure_document(self) -> Document:
        """Return the active document, loading from sandbox if we have a saved current path and no in-memory doc."""
        if self._doc is not None:
            return self._doc
        loaded = await self._load_document_from_sandbox()
        if loaded and self._doc is not None:
            return self._doc
        raise ValueError("No active document. Call create_document first, then add content and save_document. If you already saved a document, modify tools will load it automatically.")

    def _require_document(self) -> Document:
        """Sync version for use when sandbox/document is already ensured (e.g. after _ensure_document)."""
        if self._doc is None:
            raise ValueError("No active document. Call create_document first.")
        return self._doc

    def _register(self, section_type: str, element: Any, content: str = "", metadata: Optional[Dict] = None) -> int:
        sid = self._next_id
        self._next_id += 1
        self._element_map[sid] = {
            "type": section_type,
            "element": element,
            "content": content,
            "metadata": metadata or {},
        }
        self._order.append(sid)
        return sid

    def _remove_from_document(self, element: Any) -> None:
        parent = element._element.getparent()
        if parent is not None:
            parent.remove(element._element)
        element._element = None
        if hasattr(element, "_p"):
            element._p = None

    # ---------- DocumentManager ----------

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_document",
            "description": "Create a new Word document in memory. Call this first; then use add_paragraph, add_heading, add_table, add_hyperlink to build content. Use save_document to write to a file path.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    })
    async def create_document(self) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_documents_dir()
            self._doc = Document()
            self._element_map = {}
            self._order = []
            self._next_id = 1
            return self.success_response({
                "message": "New document created. Use add_paragraph, add_heading, add_table, add_hyperlink to add content, then save_document.",
                "next_id": 1,
            })
        except Exception as e:
            return self.fail_response(f"Failed to create document: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_paragraph",
            "description": "Add a paragraph to the document. Returns section id for later modify or delete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Paragraph text"},
                    "font_size": {"type": "integer", "description": "Font size in points", "default": 11},
                    "bold": {"type": "boolean", "description": "Bold", "default": False},
                    "italic": {"type": "boolean", "description": "Italic", "default": False},
                    "alignment": {"type": "string", "description": "Text alignment: left, center, right, or justify", "default": "left", "enum": ["left", "center", "right", "justify"]},
                },
                "required": ["text"],
            },
        },
    })
    async def add_paragraph(
        self,
        text: str,
        font_size: int = 11,
        bold: bool = False,
        italic: bool = False,
        alignment: str = "left",
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            doc = await self._ensure_document()
            p = doc.add_paragraph()
            run = p.add_run(text or "")
            run.font.size = Pt(font_size)
            run.font.bold = bold
            run.font.italic = italic
            p.paragraph_format.alignment = _parse_alignment(alignment)
            sid = self._register("paragraph", p, text, {"font_size": font_size, "bold": bold, "italic": italic, "alignment": alignment})
            return self.success_response({"section_id": sid, "type": "paragraph", "preview": _preview_text(text)})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to add paragraph: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_heading",
            "description": "Add a heading to the document. Returns section id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Heading text"},
                    "level": {"type": "integer", "description": "Heading level 1-9 (1 = title)", "default": 1},
                    "alignment": {"type": "string", "description": "Text alignment: left, center, right, or justify", "default": "left", "enum": ["left", "center", "right", "justify"]},
                },
                "required": ["text"],
            },
        },
    })
    async def add_heading(self, text: str, level: int = 1, alignment: str = "left") -> ToolResult:
        try:
            await self._ensure_sandbox()
            doc = await self._ensure_document()
            level = max(1, min(9, level))
            p = doc.add_heading(text or "", level=level)
            p.paragraph_format.alignment = _parse_alignment(alignment)
            sid = self._register("heading", p, text, {"level": level, "alignment": alignment})
            return self.success_response({"section_id": sid, "type": "heading", "level": level, "preview": _preview_text(text)})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to add heading: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_table",
            "description": "Add a table. data is a 2D list (rows of cells). Dimensions must match rows and columns.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rows": {"type": "integer", "description": "Number of rows"},
                    "columns": {"type": "integer", "description": "Number of columns"},
                    "data": {
                        "type": "array",
                        "description": "2D array of cell text; length must equal rows, each row length must equal columns",
                        "items": {"type": "array", "items": {"type": "string"}},
                    },
                },
                "required": ["rows", "columns", "data"],
            },
        },
    })
    async def add_table(self, rows: int, columns: int, data: List[List[str]]) -> ToolResult:
        try:
            await self._ensure_sandbox()
            doc = await self._ensure_document()
            if rows < 1 or columns < 1:
                return self.fail_response("rows and columns must be at least 1")
            if len(data) != rows:
                return self.fail_response(f"data must have {rows} rows, got {len(data)}")
            for i, row in enumerate(data):
                if len(row) != columns:
                    return self.fail_response(f"Row {i + 1} must have {columns} cells, got {len(row)}")
            table = doc.add_table(rows=rows, cols=columns)
            table.style = "Table Grid"
            for r, row_data in enumerate(data):
                for c, cell_text in enumerate(row_data):
                    table.rows[r].cells[c].text = str(cell_text) if cell_text is not None else ""
            preview = _preview_text(str(data[0]) if data else "") if data else "(empty table)"
            sid = self._register("table", table, json.dumps(data), {"rows": rows, "columns": columns})
            return self.success_response({"section_id": sid, "type": "table", "rows": rows, "columns": columns, "preview": preview})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to add table: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "add_hyperlink",
            "description": "Add a hyperlink (clickable text linking to a URL).",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Display text for the link"},
                    "url": {"type": "string", "description": "URL to open when clicked"},
                },
                "required": ["text", "url"],
            },
        },
    })
    async def add_hyperlink(self, text: str, url: str) -> ToolResult:
        try:
            await self._ensure_sandbox()
            doc = await self._ensure_document()
            p = doc.add_paragraph()
            part = doc.part
            rId = part.relate_to(
                url,
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                is_external=True,
            )
            hyperlink = OxmlElement("w:hyperlink")
            hyperlink.set(qn("r:id"), rId)
            run = OxmlElement("w:r")
            rPr = OxmlElement("w:rPr")
            u = OxmlElement("w:u")
            u.set(qn("w:val"), "single")
            color = OxmlElement("w:color")
            color.set(qn("w:val"), "0000FF")
            rPr.append(u)
            rPr.append(color)
            run.append(rPr)
            t = OxmlElement("w:t")
            t.text = text or url
            run.append(t)
            hyperlink.append(run)
            p._element.append(hyperlink)
            sid = self._register("hyperlink", p, text, {"url": url})
            return self.success_response({"section_id": sid, "type": "hyperlink", "preview": _preview_text(text)})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to add hyperlink: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "save_document",
            "description": "Save the current document to a file path under /workspace (e.g. /workspace/documents/report.docx).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path under /workspace (e.g. documents/report.docx)",
                        "default": "documents/document.docx",
                    },
                },
                "required": [],
            },
        },
    })
    async def save_document(self, file_path: Optional[str] = None) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_documents_dir()
            doc = await self._ensure_document()
            if not file_path:
                file_path = f"{self.documents_dir}/document.docx"
            cleaned, full_path = _validate_and_normalize_path(self.workspace_path, file_path)
            if not full_path.lower().endswith(".docx"):
                full_path = full_path.rstrip("/") + ".docx"
                cleaned = (cleaned.rstrip("/") + ".docx") if cleaned else "document.docx"
            parent = "/".join(full_path.split("/")[:-1])
            if parent and parent != self.workspace_path:
                try:
                    await self.sandbox.fs.create_folder(parent, "755")
                except Exception:
                    pass
            buffer = io.BytesIO()
            doc.save(buffer)
            buffer.seek(0)
            await self.sandbox.fs.upload_file(buffer.getvalue(), full_path)
            # Persist current document path so modify/add/delete can load it in a new request
            path_file = f"{self.workspace_path}/{self.CURRENT_DOCX_PATH_FILE}"
            await self.sandbox.fs.upload_file(cleaned.encode(), path_file)
            logger.info(f"Saved document to {full_path}")
            return self.success_response({
                "message": "Document saved successfully",
                "file_path": full_path,
                "relative_path": f"/workspace/{cleaned}",
            })
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to save document: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "get_document_structure",
            "description": "Return the structure of the current document: all section IDs with type and preview.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    })
    async def get_document_structure(self) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            structure = []
            for sid in self._order:
                if sid not in self._element_map:
                    continue
                rec = self._element_map[sid]
                structure.append({
                    "id": sid,
                    "type": rec["type"],
                    "preview": _preview_text(rec.get("content") or rec.get("metadata", {}).get("url", "")),
                    "metadata": rec.get("metadata", {}),
                })
            return self.success_response({
                "message": f"Document has {len(structure)} sections",
                "structure": structure,
            })
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to get structure: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "delete_section",
            "description": "Remove a section from the document by its section id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "integer", "description": "Section id returned by add_paragraph, add_heading, add_table, or add_hyperlink"},
                },
                "required": ["section_id"],
            },
        },
    })
    async def delete_section(self, section_id: int) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            if section_id not in self._element_map:
                return self.fail_response(f"Section id {section_id} not found. Use get_document_structure to list ids.")
            rec = self._element_map[section_id]
            el = rec["element"]
            self._remove_from_document(el)
            del self._element_map[section_id]
            self._order = [i for i in self._order if i != section_id]
            return self.success_response({"message": f"Section {section_id} deleted", "section_id": section_id})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to delete section: {str(e)}")

    # ---------- ContentModifier ----------

    def _get_text_element(self, section_id: int):
        """Return paragraph/heading element for modifier ops. Raises if not found or not text type."""
        if section_id not in self._element_map:
            raise ValueError(f"Section id {section_id} not found")
        rec = self._element_map[section_id]
        if rec["type"] not in ("paragraph", "heading"):
            raise ValueError(f"Section {section_id} is type '{rec['type']}'; modify_text/modify_font_* apply only to paragraph or heading")
        return rec["element"]

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "modify_text",
            "description": "Change the text of a paragraph or heading section.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "integer", "description": "Section id (paragraph or heading)"},
                    "new_text": {"type": "string", "description": "New text content"},
                },
                "required": ["section_id", "new_text"],
            },
        },
    })
    async def modify_text(self, section_id: int, new_text: str) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            p = self._get_text_element(section_id)
            p.clear()
            p.add_run(new_text or "")
            self._element_map[section_id]["content"] = new_text or ""
            return self.success_response({"message": f"Section {section_id} text updated", "section_id": section_id})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to modify text: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "modify_font_size",
            "description": "Set font size for a paragraph or heading section (in points).",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "integer", "description": "Section id (paragraph or heading)"},
                    "font_size": {"type": "integer", "description": "Font size in points"},
                },
                "required": ["section_id", "font_size"],
            },
        },
    })
    async def modify_font_size(self, section_id: int, font_size: int) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            p = self._get_text_element(section_id)
            for run in p.runs:
                run.font.size = Pt(font_size)
            self._element_map[section_id].setdefault("metadata", {})["font_size"] = font_size
            return self.success_response({"message": f"Section {section_id} font size set to {font_size}", "section_id": section_id})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to modify font size: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "modify_font_style",
            "description": "Set bold and/or italic for a paragraph or heading section.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "integer", "description": "Section id (paragraph or heading)"},
                    "bold": {"type": "boolean", "description": "Bold"},
                    "italic": {"type": "boolean", "description": "Italic"},
                },
                "required": ["section_id"],
            },
        },
    })
    async def modify_font_style(
        self,
        section_id: int,
        bold: Optional[bool] = None,
        italic: Optional[bool] = None,
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            p = self._get_text_element(section_id)
            for run in p.runs:
                if bold is not None:
                    run.font.bold = bold
                if italic is not None:
                    run.font.italic = italic
            meta = self._element_map[section_id].setdefault("metadata", {})
            if bold is not None:
                meta["bold"] = bold
            if italic is not None:
                meta["italic"] = italic
            return self.success_response({"message": f"Section {section_id} font style updated", "section_id": section_id})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to modify font style: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "modify_alignment",
            "description": "Set paragraph alignment for a paragraph or heading section. Use left, center, right, or justify.",
            "parameters": {
                "type": "object",
                "properties": {
                    "section_id": {"type": "integer", "description": "Section id (paragraph or heading)"},
                    "alignment": {"type": "string", "description": "Alignment: left, center, right, or justify", "enum": ["left", "center", "right", "justify"]},
                },
                "required": ["section_id", "alignment"],
            },
        },
    })
    async def modify_alignment(self, section_id: int, alignment: str) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_document()
            p = self._get_text_element(section_id)
            p.paragraph_format.alignment = _parse_alignment(alignment)
            self._element_map[section_id].setdefault("metadata", {})["alignment"] = alignment.strip().lower()
            return self.success_response({"message": f"Section {section_id} alignment set to {alignment}", "section_id": section_id})
        except ValueError as e:
            return self.fail_response(str(e))
        except Exception as e:
            return self.fail_response(f"Failed to modify alignment: {str(e)}")
