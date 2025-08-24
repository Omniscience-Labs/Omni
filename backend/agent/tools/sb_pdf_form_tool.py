from typing import Optional, Dict, Any, List, Union
import json
import uuid
import os
from agentpress.tool import ToolResult, openapi_schema, xml_schema
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from utils.logger import logger

class SandboxPDFFormTool(SandboxToolsBase):
    """Tool for PDF form operations using PyPDFForm in sandbox containers."""

    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    def clean_path(self, path: str) -> str:
        """Clean and normalize a path to be relative to /workspace"""
        return super().clean_path(path)

    def _file_exists(self, path: str) -> bool:
        """Check if a file exists in the sandbox"""
        try:
            self.sandbox.fs.get_file_info(path)
            return True
        except:
            return False

    def _create_pdf_script(self, script_content: str) -> str:
        """Create a Python script that includes necessary imports and the provided content."""
        imports = """
import sys
import json
import uuid
import os
from PyPDFForm import PdfWrapper, FormWrapper

"""
        return imports + script_content

    async def _ensure_pdf_dependencies_installed(self):
        """Ensure all PDF dependencies are installed in the sandbox"""
        try:
            # Check if PyPDFForm and PyMuPDF are available
            response = await self.sandbox.process.exec("python3 -c 'import PyPDFForm, pymupdf; print(\"PDF dependencies OK\")'", timeout=10)
            if response.exit_code != 0:
                logger.info("Installing PDF dependencies in sandbox...")
                
                # Install system dependencies first
                system_deps = await self.sandbox.process.exec(
                    "apt-get update && apt-get install -y poppler-utils pandoc || echo 'System deps install failed'", 
                    timeout=180
                )
                if system_deps.exit_code != 0:
                    logger.warning(f"System dependencies installation had issues: {system_deps.result}")
                
                # Install Python packages
                install_response = await self.sandbox.process.exec(
                    "pip install --no-cache-dir PyPDFForm==1.4.36 PyMuPDF==1.24.4", 
                    timeout=180
                )
                if install_response.exit_code != 0:
                    raise Exception(f"Failed to install PDF dependencies: {install_response.result}")
                logger.info("Successfully installed PDF dependencies")
            else:
                logger.debug("PDF dependencies already available in sandbox")
                    
        except Exception as e:
            logger.warning(f"Could not verify PDF dependencies installation: {e}")
            # Continue anyway - the tool might still work with basic functionality

    async def _detect_pdf_type(self, file_path: str) -> str:
        """Detect if PDF has interactive form fields or requires coordinate-based filling"""
        try:
            script_content = f"""
import json
try:
    from PyPDFForm import PdfWrapper
    wrapper = PdfWrapper('{file_path}')
    schema = wrapper.schema
    if schema and schema.get('properties') and len(schema.get('properties', {{}})) > 0:
        print(json.dumps({{'type': 'interactive', 'field_count': len(schema.get('properties', {{}}))}}))
    else:
        print(json.dumps({{'type': 'coordinate_based', 'reason': 'no_interactive_fields'}}))
except Exception as e:
    print(json.dumps({{'type': 'coordinate_based', 'reason': f'error_detecting: {{str(e)}}'}})) 
"""
            
            script_file = f"/workspace/detect_pdf_type_{uuid.uuid4().hex[:8]}.py"
            await self.sandbox.fs.upload_file(script_content.encode(), script_file)
            
            response = await self.sandbox.process.exec(f"cd /workspace && python3 {script_file.replace('/workspace/', '')}", timeout=30)
            
            try:
                await self.sandbox.fs.delete_file(script_file)
            except:
                pass
            
            if response.exit_code == 0:
                try:
                    result = json.loads(response.result.strip().split('\n')[-1])
                    return result.get('type', 'coordinate_based')
                except:
                    pass
            
            return 'coordinate_based'  # Default fallback
            
        except Exception as e:
            logger.warning(f"Error detecting PDF type: {e}")
            return 'coordinate_based'

    def _get_default_field_positions(self) -> Dict[str, Dict[str, Any]]:
        """Get default field positions for common form layouts"""
        return {
            # Common text fields
            "name": {"x": 150, "y": 200, "fontsize": 10, "type": "text"},
            "first_name": {"x": 150, "y": 200, "fontsize": 10, "type": "text"},
            "last_name": {"x": 350, "y": 200, "fontsize": 10, "type": "text"},
            "date": {"x": 450, "y": 200, "fontsize": 10, "type": "text"},
            "today": {"x": 450, "y": 200, "fontsize": 10, "type": "text"},
            
            # Address fields
            "address": {"x": 150, "y": 250, "fontsize": 10, "type": "text"},
            "street": {"x": 150, "y": 250, "fontsize": 10, "type": "text"},
            "city": {"x": 150, "y": 300, "fontsize": 10, "type": "text"},
            "state": {"x": 350, "y": 300, "fontsize": 10, "type": "text"},
            "zip": {"x": 450, "y": 300, "fontsize": 10, "type": "text"},
            "zipcode": {"x": 450, "y": 300, "fontsize": 10, "type": "text"},
            "postal_code": {"x": 450, "y": 300, "fontsize": 10, "type": "text"},
            
            # Contact fields
            "phone": {"x": 150, "y": 350, "fontsize": 10, "type": "text"},
            "email": {"x": 150, "y": 400, "fontsize": 10, "type": "text"},
            
            # Financial fields
            "amount": {"x": 450, "y": 400, "fontsize": 10, "type": "text"},
            "total": {"x": 450, "y": 400, "fontsize": 10, "type": "text"},
            "salary": {"x": 450, "y": 400, "fontsize": 10, "type": "text"},
            
            # Signature field
            "signature": {"x": 150, "y": 500, "fontsize": 12, "type": "text"},
            "sign": {"x": 150, "y": 500, "fontsize": 12, "type": "text"},
            
            # Common checkboxes
            "agree": {"x": 100, "y": 450, "fontsize": 14, "type": "checkbox"},
            "consent": {"x": 100, "y": 450, "fontsize": 14, "type": "checkbox"},
            "checkbox": {"x": 100, "y": 450, "fontsize": 14, "type": "checkbox"},
            "check": {"x": 100, "y": 450, "fontsize": 14, "type": "checkbox"},
        }

    async def _execute_pdf_script(self, script: str, timeout: int = 60) -> ToolResult:
        """Execute a Python script in the sandbox and return the result"""
        try:
            # Save script to a temporary file in sandbox
            script_file = f"/workspace/temp_pdf_script_{hash(script) % 10000}.py"
            await self.sandbox.fs.upload_file(script.encode(), script_file)
            
            # Execute the script
            response = await self.sandbox.process.exec(f"cd /workspace && python3 {script_file.replace('/workspace/', '')}", timeout=timeout)
            
            # Clean up script file
            try:
                await self.sandbox.fs.delete_file(script_file)
            except:
                pass
            
            if response.exit_code == 0:
                try:
                    # Try to parse JSON output
                    lines = response.result.strip().split('\n')
                    for line in reversed(lines):
                        if line.strip().startswith('{'):
                            result = json.loads(line.strip())
                            return self.success_response(result)
                    # If no JSON found, return raw output
                    return self.success_response({"message": response.result.strip()})
                except:
                    return self.success_response({"message": response.result.strip()})
            else:
                return self.error_response(f"Script execution failed: {response.result}")
                
        except Exception as e:
            return self.error_response(f"Error executing PDF script: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "read_form_fields",
            "description": "Reads fillable form fields from interactive PDF forms only. Use this to discover what fields are available in PDFs with form controls. IMPORTANT: This only works with PDFs that have actual form fields - will return empty results for scanned documents or image-based PDFs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file, relative to /workspace (e.g., 'forms/application.pdf')"
                    }
                },
                "required": ["file_path"]
            }
        }
    })
    async def read_form_fields(self, file_path: str) -> ToolResult:
        """Reads the fillable form fields from a PDF file."""
        try:
            # Ensure sandbox is initialized and dependencies are available
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            # Clean and validate the file path
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Create Python script to execute in sandbox
            script_content = f"""
import json
from PyPDFForm import PdfWrapper

try:
    # Use PdfWrapper for inspection (has .schema attribute)
    wrapper = PdfWrapper('{full_path}')
    
    # Get form schema
    schema = wrapper.schema
    
    # Get field names from schema
    field_names = list(schema.get('properties', {{}}).keys()) if schema else []
    
    # Build detailed field information from schema
    field_details = {{}}
    properties = schema.get('properties', {{}}) if schema else {{}}
    for field_name in field_names:
        field_info = properties.get(field_name, {{}})
        field_type = field_info.get('type', 'string')
        field_details[field_name] = {{'type': field_type}}
    
    result = {{
        "success": True,
        "message": "Successfully read form fields from {file_path}",
        "file_path": "{file_path}",
        "field_count": len(field_names),
        "field_names": field_names,
        "field_details": field_details,
        "schema": schema
    }}
    
    print(json.dumps(result))
    
except Exception as e:
    error_result = {{
        "success": False,
        "error": f"Error reading form fields: {{str(e)}}"
    }}
    print(json.dumps(error_result))
"""
            
            script = self._create_pdf_script(script_content)
            return await self._execute_pdf_script(script)
            
        except Exception as e:
            return self.error_response(f"Error reading form fields: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "fill_form",
            "description": "Fills interactive PDF forms with fillable fields while KEEPING the form editable for manual corrections. IMPORTANT: Use this ONLY for PDFs with actual form controls. For scanned documents, image-based PDFs, or non-fillable forms, use smart_form_fill instead. The filled form remains editable - use flatten_form separately if user need a non-editable version. Give the user an option to flatten the form if they want a non-editable version.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF form file, relative to /workspace"
                    },
                    "fields": {
                        "type": "object",
                        "description": "Dictionary where keys are field names and values are field values. Text fields use strings, checkboxes use booleans (true/false), radio buttons and dropdowns use integers (0-based index)."
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path for the filled form. If not provided, will create a file with '_filled' suffix."
                    }
                },
                "required": ["file_path", "fields"]
            }
        }
    })
    async def fill_form(self, file_path: str, fields: Dict[str, Any], output_path: Optional[str] = None) -> ToolResult:
        """Fill a PDF form with the provided field values."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Determine output path
            if output_path:
                output_path = self.clean_path(output_path)
                filled_path = f"{self.workspace_path}/{output_path}"
            else:
                # Generate output path with _filled suffix
                base_name = os.path.splitext(file_path)[0]
                filled_path = f"{self.workspace_path}/{base_name}_filled_{uuid.uuid4().hex[:8]}.pdf"
                output_path = filled_path.replace(f"{self.workspace_path}/", "")
            
            # Create Python script to execute in sandbox
            script_content = f"""
try:
    # Import both wrappers - PdfWrapper for inspection, FormWrapper for editable filling
    from PyPDFForm import PdfWrapper, FormWrapper
    
    # Use PdfWrapper for inspection (has .schema attribute)
    inspector = PdfWrapper('{full_path}')
    
    # Get original schema to check available fields
    original_schema = inspector.schema
    available_fields = set(original_schema.get('properties', {{}}).keys()) if original_schema else set()
    
    # Pre-process fields to handle different field types
    processed_fields = {{}}
    for field_name, value in {repr(fields)}.items():
        field_name_lower = field_name.lower()
        
        # Skip signature and image fields if they contain text (not file paths)
        if ('signature' in field_name_lower or 'image' in field_name_lower) and isinstance(value, str):
            # Check if it's a file path (contains extension) or just text
            if not ('.' in value and any(ext in value.lower() for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp'])):
                # Skip text values for signature/image fields
                print(f"Skipping signature/image field '{{field_name}}' with text value: {{value}}")
                continue
        
        # Handle boolean values for checkboxes
        if isinstance(value, bool):
            processed_fields[field_name] = value  # Keep as boolean per PyPDFForm docs
        elif isinstance(value, str) and value.lower() in ['true', 'false']:
            processed_fields[field_name] = value.lower() == 'true'
        else:
            processed_fields[field_name] = value
    
    # Use FormWrapper for filling to keep form editable
    filler = FormWrapper('{full_path}')
    filled_pdf_stream = filler.fill(processed_fields, flatten=False)
    
    # Ensure parent directory exists
    os.makedirs(os.path.dirname('{filled_path}'), exist_ok=True)
    
    # Save the filled form
    with open('{filled_path}', 'wb') as output_file:
        output_file.write(filled_pdf_stream.read())
    
    # Get diagnostic information by checking which fields actually exist and were processed
    try:
        requested_fields = set(processed_fields.keys())
        available_requested_fields = requested_fields.intersection(available_fields)
        unavailable_fields = requested_fields - available_fields
        
        # For interactive forms, assume all available fields were filled successfully
        # since PyPDFForm doesn't provide detailed success/failure info
        filled_count = len(available_requested_fields)
        failed_count = len(unavailable_fields)
        
        diagnostics = {{
            "requested_count": len(requested_fields),
            "filled_count": filled_count,
            "failed_count": failed_count,
            "failed_fields": list(unavailable_fields)[:10],  # First 10 failed fields
            "available_fields_in_pdf": len(available_fields),
            "method": "interactive_form_fill_editable",
            "form_remains_editable": True
        }}
    except Exception as diag_error:
        diagnostics = {{
            "note": f"Could not generate diagnostics: {{str(diag_error)}}",
            "method": "interactive_form_fill_editable",
            "form_remains_editable": True
        }}
    
    print(json.dumps({{
        "success": True,
        "message": "Successfully filled PDF form and saved to '{output_path}' (form remains editable)",
        "input_file": "{file_path}",
        "output_file": "{output_path}",
        "fields_filled": len(processed_fields),
        "form_remains_editable": True,
        "diagnostics": diagnostics
    }}))
    
except Exception as e:
    print(json.dumps({{
        "success": False,
        "error": f"Error filling form: {{str(e)}}"
    }}))
"""
            
            script = self._create_pdf_script(script_content)
            return await self._execute_pdf_script(script)
            
        except Exception as e:
            return self.error_response(f"Error filling form: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "flatten_form",
            "description": "Flatten a filled PDF form to make it non-editable (converts form fields to static content).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file to flatten, relative to /workspace"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path for the flattened PDF. If not provided, will create a file with '_flattened' suffix."
                    }
                },
                "required": ["file_path"]
            }
        }
    })
    async def flatten_form(self, file_path: str, output_path: Optional[str] = None) -> ToolResult:
        """Flatten a PDF form to make it non-editable."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Determine output path
            if output_path:
                output_path = self.clean_path(output_path)
                flattened_path = f"{self.workspace_path}/{output_path}"
            else:
                # Generate output path with _flattened suffix
                base_name = os.path.splitext(file_path)[0]
                flattened_path = f"{self.workspace_path}/{base_name}_flattened_{uuid.uuid4().hex[:8]}.pdf"
                output_path = flattened_path.replace(f"{self.workspace_path}/", "")
            
            # Create Python script to execute in sandbox
            script_content = f"""
try:
    # Use PdfWrapper for inspection and flattening
    wrapper = PdfWrapper('{full_path}')
    
    # Flatten the form
    # First check if the PDF has any fillable fields
    schema = wrapper.schema
    
    if not schema or not schema.get('properties'):
        print(json.dumps({{
            "success": False,
            "error": "No form fields found to flatten. This appears to be a non-form PDF."
        }}))
    else:
        # Create a flattened version by filling with current values and setting flatten=True
        current_values = wrapper.sample_data
        
        # Fill the form with current values and flatten it (PdfWrapper flattens by default)
        flattened_stream = wrapper.fill(current_values)
        
        # Ensure parent directory exists
        os.makedirs(os.path.dirname('{flattened_path}'), exist_ok=True)
        
        # Save the flattened form
        with open('{flattened_path}', 'wb') as output_file:
            output_file.write(flattened_stream.read())
        
        print(json.dumps({{
            "success": True,
            "message": "Successfully flattened PDF form and saved to '{output_path}' (form is now non-editable)",
            "input_file": "{file_path}",
            "output_file": "{output_path}",
            "form_flattened": True
        }}))
    
except Exception as e:
    print(json.dumps({{
        "success": False,
        "error": f"Error flattening form: {{str(e)}}"
    }}))
"""
            
            script = self._create_pdf_script(script_content)
            return await self._execute_pdf_script(script)
            
        except Exception as e:
            return self.error_response(f"Error flattening form: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "fill_form_coordinates",
            "description": "Fill scanned PDFs or non-fillable documents using coordinate-based text overlay. Use this for: scanned documents, image-based PDFs, or any PDF without interactive form fields. Places text at specific X,Y positions on all pages. IMPORTANT: For interactive PDFs with form fields, use fill_form instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file, relative to /workspace"
                    },
                    "form_data": {
                        "type": "object",
                        "description": "Data to fill in the form. Field names should match coordinate template keys."
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path for the filled form. If not provided, will create a file with '_filled' suffix."
                    },
                    "custom_coordinates": {
                        "type": "object",
                        "description": "Optional custom field coordinates {field_name: {x: int, y: int, fontsize: int, type: 'text'|'checkbox'}}. Overrides template."
                    },
                    "disable_overlap_detection": {
                        "type": "boolean",
                        "description": "Disable overlap detection to allow placement over existing text. Default: false",
                        "default": False
                    }
                },
                "required": ["file_path", "form_data"]
            }
        }
    })
    @xml_schema(
        tag_name="fill-form-coordinates",
        mappings=[
            {"param_name": "file_path", "node_type": "attribute", "path": "."},
            {"param_name": "form_data", "node_type": "element", "path": "form_data"},
            {"param_name": "output_path", "node_type": "attribute", "path": "output_path", "required": False},
            {"param_name": "custom_coordinates", "node_type": "element", "path": "custom_coordinates", "required": False},
            {"param_name": "disable_overlap_detection", "node_type": "attribute", "path": "disable_overlap_detection", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="fill_form_coordinates">
        <parameter name="file_path">forms/scanned_form.pdf</parameter>
        <parameter name="form_data">{
            "name": "John Doe",
            "date": "01/15/2024",
            "email": "john@example.com"
        }</parameter>
        <parameter name="custom_coordinates">{
            "name": {"x": 150, "y": 200, "fontsize": 12, "type": "text"},
            "date": {"x": 400, "y": 200, "fontsize": 10, "type": "text"}
        }</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def fill_form_coordinates(self, file_path: str, form_data: Dict[str, Any], output_path: Optional[str] = None, custom_coordinates: Optional[Dict[str, Dict[str, Any]]] = None, disable_overlap_detection: bool = False) -> ToolResult:
        """Fill a PDF using coordinate-based text overlay (for scanned/non-fillable PDFs)."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Determine output path
            if output_path:
                output_path = self.clean_path(output_path)
                filled_path = f"{self.workspace_path}/{output_path}"
            else:
                base_name = os.path.splitext(file_path)[0]
                filled_path = f"{self.workspace_path}/{base_name}_coordinate_filled_{uuid.uuid4().hex[:8]}.pdf"
                output_path = filled_path.replace(f"{self.workspace_path}/", "")
            
            # Get field positions (default + custom)
            field_positions = self._get_default_field_positions()
            if custom_coordinates:
                field_positions.update(custom_coordinates)
            
            # Create coordinate filling script
            script_content = f"""
import pymupdf
import json
import os

def detect_text_overlap(page, x, y, text_value, fontsize, disable_detection=False):
    '''Detect if placing text at position would overlap with existing text'''
    try:
        # If overlap detection is disabled, always return no overlap
        if disable_detection:
            return False, None
        # Get existing text blocks on the page
        text_blocks = page.get_text("dict")["blocks"]
        
        # Calculate bounding box for our new text (more lenient sizing)
        # Rough estimation: character width ≈ fontsize * 0.5, height ≈ fontsize * 0.8
        text_width = len(text_value) * fontsize * 0.5
        text_height = fontsize * 0.8
        new_bbox = (x, y - text_height, x + text_width, y)
        
        # Check for overlap with existing text
        for block in text_blocks:
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        existing_bbox = span["bbox"]
                        existing_text = span["text"].strip()
                        
                        # Skip empty text
                        if not existing_text:
                            continue
                            
                        # Check if bounding boxes overlap with small margin for tolerance
                        margin = 2  # 2 point margin for overlap tolerance
                        if not (new_bbox[2] < existing_bbox[0] - margin or  # new is left of existing
                                new_bbox[0] > existing_bbox[2] + margin or  # new is right of existing
                                new_bbox[3] < existing_bbox[1] - margin or  # new is above existing
                                new_bbox[1] > existing_bbox[3] + margin):   # new is below existing
                            return True, existing_text
        
        return False, None
    except Exception:
        return False, None

def fill_pdf_coordinates(pdf_path, form_data, field_positions, output_path, disable_overlap_detection=False):
    '''Fill PDF using coordinate-based text overlay with collision detection'''
    try:
        doc = pymupdf.open(pdf_path)
        filled_count = 0
        skipped_fields = []
        placed_positions = []
        overlap_detected = []
        
        if len(doc) == 0:
            raise Exception("PDF has no pages")
        
        # Process all pages in the document
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_width = page.rect.width
            page_height = page.rect.height
            
            for field_name, value in form_data.items():
                if value is None or value == "":
                    continue
                    
                # Find position for this field
                position = None
                field_key = field_name.lower()
                
                # Try exact match first
                if field_key in field_positions:
                    position = field_positions[field_key]
                else:
                    # Try normalized field name (remove _2, _3, etc.)
                    base_field_key = field_key.rstrip('_0123456789')
                    if base_field_key in field_positions:
                        position = field_positions[base_field_key]
                    else:
                        # Fuzzy match - check if any position key is contained in field name or vice versa
                        for pos_key, pos_data in field_positions.items():
                            # Enhanced matching: handle City -> City_2, City_3
                            if (pos_key in field_key or field_key in pos_key or 
                                pos_key.rstrip('_0123456789') == base_field_key):
                                position = pos_data
                                break
                
                if position:
                    field_type = position.get('type', 'text')
                    x = position.get('x', 100)
                    y = position.get('y', 100)
                    fontsize = position.get('fontsize', 10)
                    
                    # Validate and adjust coordinates
                    if x < 0:
                        x = 10
                    elif x > page_width - 50:
                        x = page_width - 50
                        
                    if y < 0:
                        y = 20
                    elif y > page_height - 20:
                        y = page_height - 20
                    
                    # Validate font size
                    if fontsize < 6:
                        fontsize = 6
                    elif fontsize > 24:
                        fontsize = 24
                    
                    try:
                        if field_type == 'checkbox':
                            # Handle various checkbox value formats
                            is_checked = False
                            if isinstance(value, bool):
                                is_checked = value
                            elif isinstance(value, (int, float)):
                                is_checked = bool(value)
                            elif isinstance(value, str):
                                is_checked = value.lower() in ['true', '1', 'yes', 'checked', 'x']
                            
                            if is_checked:
                                # Check for overlap before placing checkbox
                                has_overlap, existing_text = detect_text_overlap(page, x, y, "✓", fontsize, disable_overlap_detection)
                                if has_overlap:
                                    overlap_detected.append({{
                                        "field": field_name,
                                        "page": page_num,
                                        "x": x,
                                        "y": y,
                                        "overlapping_text": existing_text,
                                        "reason": "checkbox_overlap"
                                    }})
                                    skipped_fields.append(field_name)
                                    continue
                                
                                # Insert checkbox mark
                                page.insert_text((x, y), "✓", fontsize=fontsize, color=(0, 0, 0))
                                filled_count += 1
                                placed_positions.append({{
                                    "field": field_name,
                                    "x": x,
                                    "y": y,
                                    "page": page_num,
                                    "type": "checkbox",
                                    "value": "✓"
                                }})
                        else:
                            # Handle text fields
                            text_value = str(value)
                            
                            # Check for overlap before placing text
                            has_overlap, existing_text = detect_text_overlap(page, x, y, text_value, fontsize, disable_overlap_detection)
                            if has_overlap:
                                overlap_detected.append({{
                                    "field": field_name,
                                    "page": page_num,
                                    "x": x,
                                    "y": y,
                                    "overlapping_text": existing_text,
                                    "reason": "text_overlap"
                                }})
                                skipped_fields.append(field_name)
                                continue
                            
                            # Insert text
                            page.insert_text((x, y), text_value, fontsize=fontsize, color=(0, 0, 0))
                            filled_count += 1
                            placed_positions.append({{
                                "field": field_name,
                                "x": x,
                                "y": y,
                                "page": page_num,
                                "type": "text",
                                "value": text_value
                            }})
                    except Exception as field_error:
                        skipped_fields.append(field_name)
                        print(f"Error placing field {{field_name}}: {{str(field_error)}}")
                else:
                    # No position found for field
                    skipped_fields.append(field_name)
        
        # Save the filled PDF
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.save(output_path)
        doc.close()
        
        return {{
            "success": True,
            "filled_count": filled_count,
            "skipped_count": len(skipped_fields),
            "total_fields": len(form_data),
            "skipped_fields": skipped_fields[:10],  # First 10 skipped fields
            "placed_positions": placed_positions,
            "overlap_detected": overlap_detected,
            "output_file": output_path
        }}
        
    except Exception as e:
        return {{
            "success": False,
            "error": str(e)
        }}

# Execute the filling
result = fill_pdf_coordinates(
    "{full_path}",
    {json.dumps(form_data)},
    {json.dumps(field_positions)},
    "{filled_path}",
    {disable_overlap_detection}
)

print(json.dumps(result))
"""
            
            # Execute script
            script_file = f"/workspace/coord_fill_{uuid.uuid4().hex[:8]}.py"
            await self.sandbox.fs.upload_file(script_content.encode(), script_file)
            
            response = await self.sandbox.process.exec(f"cd /workspace && python3 {script_file.replace('/workspace/', '')}", timeout=120)
            
            try:
                await self.sandbox.fs.delete_file(script_file)
            except:
                pass
            
            if response.exit_code == 0:
                try:
                    result = json.loads(response.result.strip().split('\n')[-1])
                    if result.get("success"):
                        return self.success_response({
                            "message": f"Successfully filled PDF using coordinates and saved to '{output_path}'",
                            "output_file": output_path,
                            "filled_count": result.get("filled_count", 0),
                            "skipped_count": result.get("skipped_count", 0),
                            "total_fields": result.get("total_fields", 0),
                            "method": "coordinate_based_filling",
                            "diagnostics": {
                                "placed_positions": result.get("placed_positions", []),
                                "overlap_detected": result.get("overlap_detected", []),
                                "skipped_fields": result.get("skipped_fields", [])
                            }
                        })
                    else:
                        return self.error_response(f"Coordinate filling failed: {result.get('error')}")
                except json.JSONDecodeError:
                    return self.error_response(f"Failed to parse script output: {response.result}")
            else:
                return self.error_response(f"Script execution failed: {response.result}")
                
        except Exception as e:
            return self.error_response(f"Error in coordinate filling: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "analyze_form_layout",
            "description": "Analyze scanned PDFs or non-fillable documents to find field positions for coordinate-based filling. Use this FIRST when working with scanned documents to identify where form fields should be placed. Returns suggested X,Y coordinates for text placement. Essential for fill_form_coordinates workflow.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file to analyze"
                    },
                    "page_number": {
                        "type": "integer",
                        "description": "Specific page number to analyze (0-based). If not provided, analyzes all pages.",
                        "default": None
                    }
                },
                "required": ["file_path"]
            }
        }
    })
    @xml_schema(
        tag_name="analyze-form-layout",
        mappings=[
            {"param_name": "file_path", "node_type": "attribute", "path": "."},
            {"param_name": "page_number", "node_type": "attribute", "path": "page_number", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="analyze_form_layout">
        <parameter name="file_path">forms/application.pdf</parameter>
        <parameter name="page_number">0</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def analyze_form_layout(self, file_path: str, page_number: Optional[int] = None) -> ToolResult:
        """Analyze PDF layout to identify potential form field positions."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Create layout analysis script
            script_content = f"""
import pymupdf
import json
import re

def analyze_pdf_layout(pdf_path, target_page=None):
    '''Analyze PDF layout and suggest field positions'''
    try:
        doc = pymupdf.open(pdf_path)
        analysis_results = {{}}
        
        # Determine which pages to analyze
        if target_page is not None:
            pages_to_analyze = [target_page] if target_page < len(doc) else []
        else:
            pages_to_analyze = list(range(len(doc)))
        
        if not pages_to_analyze:
            return {{"success": False, "error": f"Invalid page number or empty document"}}
        
        for page_num in pages_to_analyze:
            page = doc[page_num]
            page_width = page.rect.width
            page_height = page.rect.height
            
            # Get text blocks with positions
            text_blocks = page.get_text("dict")["blocks"]
            
            # Find potential field labels and empty areas
            potential_fields = []
            text_elements = []
            
            for block in text_blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            text = span["text"].strip()
                            bbox = span["bbox"]
                            
                            if text:
                                text_elements.append({{
                                    "text": text,
                                    "bbox": bbox,
                                    "x": bbox[0],
                                    "y": bbox[1],
                                    "width": bbox[2] - bbox[0],
                                    "height": bbox[3] - bbox[1]
                                }})
                                
                                # Look for field-like labels
                                field_patterns = [
                                    r'name\\b',
                                    r'first\\s+name\\b',
                                    r'last\\s+name\\b',
                                    r'address\\b',
                                    r'city\\b',
                                    r'state\\b',
                                    r'zip\\b',
                                    r'phone\\b',
                                    r'email\\b',
                                    r'date\\b',
                                    r'signature\\b',
                                    r'amount\\b',
                                    r'total\\b'
                                ]
                                
                                for pattern in field_patterns:
                                    if re.search(pattern, text.lower()):
                                        # Suggest position to the right of the label
                                        suggested_x = bbox[2] + 10  # 10 points to the right
                                        suggested_y = bbox[1] + (bbox[3] - bbox[1]) / 2  # Middle of text height
                                        
                                        potential_fields.append({{
                                            "label": text,
                                            "suggested_field_name": re.sub(r'[^a-z0-9_]', '', text.lower().replace(' ', '_')),
                                            "suggested_coordinates": {{
                                                "x": int(suggested_x),
                                                "y": int(suggested_y),
                                                "fontsize": 10,
                                                "type": "text"
                                            }},
                                            "label_position": {{
                                                "x": bbox[0],
                                                "y": bbox[1],
                                                "width": bbox[2] - bbox[0],
                                                "height": bbox[3] - bbox[1]
                                            }}
                                        }})
                                        break
            
            # Look for checkbox-like patterns (square boxes, circles, etc.)
            checkboxes = []
            # This is a simplified approach - in practice, you'd use more sophisticated shape detection
            for element in text_elements:
                text = element["text"]
                if text in ["☐", "□", "○", "◯", "_", "___"] or (len(text) == 1 and ord(text) > 9000):
                    checkboxes.append({{
                        "suggested_field_name": f"checkbox_{{len(checkboxes) + 1}}",
                        "suggested_coordinates": {{
                            "x": int(element["x"]),
                            "y": int(element["y"]),
                            "fontsize": 12,
                            "type": "checkbox"
                        }},
                        "detected_symbol": text
                    }})
            
            analysis_results[f"page_{{page_num}}"] = {{
                "page_dimensions": {{
                    "width": page_width,
                    "height": page_height
                }},
                "text_elements_count": len(text_elements),
                "potential_text_fields": potential_fields,
                "potential_checkboxes": checkboxes,
                "all_text_elements": text_elements[:20]  # First 20 for reference
            }}
        
        doc.close()
        
        # Generate coordinate template
        coordinate_template = {{}}
        for page_key, page_data in analysis_results.items():
            for field in page_data.get("potential_text_fields", []):
                field_name = field["suggested_field_name"]
                coordinate_template[field_name] = field["suggested_coordinates"]
            
            for checkbox in page_data.get("potential_checkboxes", []):
                field_name = checkbox["suggested_field_name"]
                coordinate_template[field_name] = checkbox["suggested_coordinates"]
        
        return {{
            "success": True,
            "analysis": analysis_results,
            "suggested_coordinates": coordinate_template,
            "total_pages": len(doc) if 'doc' in locals() else 0,
            "analyzed_pages": len(pages_to_analyze)
        }}
        
    except Exception as e:
        return {{
            "success": False,
            "error": str(e)
        }}

# Execute the analysis
result = analyze_pdf_layout("{full_path}", {page_number})
print(json.dumps(result))
"""
            
            # Execute script
            script_file = f"/workspace/analyze_layout_{uuid.uuid4().hex[:8]}.py"
            await self.sandbox.fs.upload_file(script_content.encode(), script_file)
            
            response = await self.sandbox.process.exec(f"cd /workspace && python3 {script_file.replace('/workspace/', '')}", timeout=60)
            
            try:
                await self.sandbox.fs.delete_file(script_file)
            except:
                pass
            
            if response.exit_code == 0:
                try:
                    result = json.loads(response.result.strip().split('\n')[-1])
                    if result.get("success"):
                        return self.success_response({
                            "message": f"Successfully analyzed PDF layout for '{file_path}'",
                            "file_path": file_path,
                            "total_pages": result.get("total_pages", 0),
                            "analyzed_pages": result.get("analyzed_pages", 0),
                            "analysis": result.get("analysis", {}),
                            "suggested_coordinates": result.get("suggested_coordinates", {}),
                            "usage_instructions": "Use the 'suggested_coordinates' in fill_form_coordinates as 'custom_coordinates' parameter"
                        })
                    else:
                        return self.error_response(f"Layout analysis failed: {result.get('error')}")
                except json.JSONDecodeError:
                    return self.error_response(f"Failed to parse analysis output: {response.result}")
            else:
                return self.error_response(f"Analysis script execution failed: {response.result}")
                
        except Exception as e:
            return self.error_response(f"Error in layout analysis: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "generate_coordinate_grid",
            "description": "Generate visual coordinate grid overlay on all pages of PDFs to help identify exact X,Y positions for field placement. Use this as a visual aid when working with scanned documents to determine precise coordinates for fill_form_coordinates. Helpful for creating custom coordinates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file"
                    },
                    "grid_spacing": {
                        "type": "integer",
                        "description": "Spacing between grid lines in points (default: 50)",
                        "default": 50
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path for the grid PDF. If not provided, will create with '_grid' suffix."
                    }
                },
                "required": ["file_path"]
            }
        }
    })
    @xml_schema(
        tag_name="generate-coordinate-grid",
        mappings=[
            {"param_name": "file_path", "node_type": "attribute", "path": "."},
            {"param_name": "grid_spacing", "node_type": "attribute", "path": "grid_spacing", "required": False},
            {"param_name": "output_path", "node_type": "attribute", "path": "output_path", "required": False}
        ],
        example='''
        <function_calls>
        <invoke name="generate_coordinate_grid">
        <parameter name="file_path">forms/blank_form.pdf</parameter>
        <parameter name="grid_spacing">25</parameter>
        </invoke>
        </function_calls>
        '''
    )
    async def generate_coordinate_grid(self, file_path: str, grid_spacing: int = 50, output_path: Optional[str] = None) -> ToolResult:
        """Generate visual coordinate grid overlay on PDF for positioning guidance."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Determine output path
            if output_path:
                output_path = self.clean_path(output_path)
                grid_path = f"{self.workspace_path}/{output_path}"
            else:
                base_name = os.path.splitext(file_path)[0]
                grid_path = f"{self.workspace_path}/{base_name}_grid_{uuid.uuid4().hex[:8]}.pdf"
                output_path = grid_path.replace(f"{self.workspace_path}/", "")
            
            # Create grid generation script
            script_content = f"""
import pymupdf
import json
import os

def generate_grid(pdf_path, output_path, grid_spacing=50):
    '''Generate coordinate grid overlay on PDF'''
    try:
        doc = pymupdf.open(pdf_path)
        grid_info = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_width = page.rect.width
            page_height = page.rect.height
            
            # Grid color (light gray)
            grid_color = (0.7, 0.7, 0.7)
            text_color = (0.5, 0.5, 0.5)
            
            # Draw vertical lines
            x = 0
            while x <= page_width:
                if x > 0:  # Don't draw line at x=0
                    start_point = (x, 0)
                    end_point = (x, page_height)
                    page.draw_line(start_point, end_point, color=grid_color, width=0.5)
                x += grid_spacing
            
            # Draw horizontal lines
            y = 0
            while y <= page_height:
                if y > 0:  # Don't draw line at y=0
                    start_point = (0, y)
                    end_point = (page_width, y)
                    page.draw_line(start_point, end_point, color=grid_color, width=0.5)
                y += grid_spacing
            
            # Add coordinate labels at intersections
            label_spacing = grid_spacing * 2  # Label every 2nd grid line to avoid clutter
            
            y = label_spacing
            while y <= page_height:
                x = label_spacing
                while x <= page_width:
                    if x < page_width - 30 and y > 15:  # Make sure labels fit
                        label_text = f"{{int(x)}},{{int(y)}}"
                        page.insert_text((x + 2, y - 2), label_text, fontsize=6, color=text_color)
                    x += label_spacing
                y += label_spacing
            
            # Add grid info for this page
            grid_info.append({{
                "page": page_num,
                "dimensions": {{"width": page_width, "height": page_height}},
                "grid_spacing": grid_spacing,
                "total_vertical_lines": int(page_width / grid_spacing) + 1,
                "total_horizontal_lines": int(page_height / grid_spacing) + 1
            }})
        
        # Save the grid PDF
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.save(output_path)
        doc.close()
        
        return {{
            "success": True,
            "output_file": output_path,
            "grid_spacing": grid_spacing,
            "pages_processed": len(grid_info),
            "grid_info": grid_info,
            "instructions": "Open the generated PDF to see coordinate grid. Use the X,Y coordinates shown on the grid for fill_form_coordinates custom_coordinates parameter."
        }}
        
    except Exception as e:
        return {{
            "success": False,
            "error": str(e)
        }}

# Execute grid generation
result = generate_grid("{full_path}", "{grid_path}", {grid_spacing})
print(json.dumps(result))
"""
            
            # Execute script
            script_file = f"/workspace/grid_gen_{uuid.uuid4().hex[:8]}.py"
            await self.sandbox.fs.upload_file(script_content.encode(), script_file)
            
            response = await self.sandbox.process.exec(f"cd /workspace && python3 {script_file.replace('/workspace/', '')}", timeout=60)
            
            try:
                await self.sandbox.fs.delete_file(script_file)
            except:
                pass
            
            if response.exit_code == 0:
                try:
                    result = json.loads(response.result.strip().split('\n')[-1])
                    if result.get("success"):
                        return self.success_response({
                            "message": f"Successfully generated coordinate grid and saved to '{output_path}'",
                            "output_file": output_path,
                            "grid_spacing": result.get("grid_spacing", grid_spacing),
                            "pages_processed": result.get("pages_processed", 0),
                            "grid_info": result.get("grid_info", []),
                            "instructions": result.get("instructions", "")
                        })
                    else:
                        return self.error_response(f"Grid generation failed: {result.get('error')}")
                except json.JSONDecodeError:
                    return self.error_response(f"Failed to parse grid output: {response.result}")
            else:
                return self.error_response(f"Grid script execution failed: {response.result}")
                
        except Exception as e:
            return self.error_response(f"Error in grid generation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "smart_form_fill",
            "description": "Intelligent PDF form filling that automatically detects PDF type and uses the best method. First attempts interactive form filling, then falls back to coordinate-based filling with automatic field detection. This is the recommended method when you're unsure about the PDF type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the PDF file to fill"
                    },
                    "form_data": {
                        "type": "object",
                        "description": "Data to fill in the form using intelligent field matching"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path for the filled form"
                    },
                    "force_method": {
                        "type": "string",
                        "description": "Force specific method: 'interactive', 'coordinate', or 'auto' (default)",
                        "enum": ["interactive", "coordinate", "auto"],
                        "default": "auto"
                    }
                },
                "required": ["file_path", "form_data"]
            }
        }
    })
    async def smart_form_fill(self, file_path: str, form_data: Dict[str, Any], output_path: Optional[str] = None, force_method: str = "auto") -> ToolResult:
        """Intelligent PDF form filling with automatic method selection."""
        try:
            await self._ensure_sandbox()
            await self._ensure_pdf_dependencies_installed()
            
            file_path = self.clean_path(file_path)
            full_path = f"{self.workspace_path}/{file_path}"
            
            if not self._file_exists(full_path):
                return self.error_response(f"PDF file '{file_path}' does not exist")
            
            # Determine output path
            if output_path:
                output_path = self.clean_path(output_path)
                if not os.path.basename(output_path).startswith("Smart_filled_"):
                    path_parts = output_path.split('/')
                    filename = path_parts[-1]
                    filename = f"Smart_filled_{filename}"
                    path_parts[-1] = filename
                    output_path = '/'.join(path_parts)
                filled_path = f"{self.workspace_path}/{output_path}"
            else:
                base_name = os.path.splitext(file_path)[0]
                filename = os.path.basename(base_name)
                filled_path = f"{self.workspace_path}/Smart_filled_{filename}_{uuid.uuid4().hex[:8]}.pdf"
                output_path = filled_path.replace(f"{self.workspace_path}/", "")
            
            # Step 1: Detect PDF type (unless forced)
            method_to_use = force_method
            if force_method == "auto":
                detected_type = await self._detect_pdf_type(full_path)
                method_to_use = "interactive" if detected_type == "interactive" else "coordinate"
                logger.info(f"Auto-detected PDF type: {detected_type}, using method: {method_to_use}")
            
            # Step 2: Try the primary method
            try:
                if method_to_use == "interactive":
                    # Try interactive form filling first
                    result = await self.fill_form(file_path, form_data, output_path)
                    if result.success:
                        return self.success_response({
                            "message": f"✅ Successfully filled interactive PDF form using built-in form fields",
                            "output_file": output_path,
                            "method_used": "interactive_form_fill",
                            "filled_fields": list(form_data.keys()),
                            "pdf_type": "interactive",
                            "form_remains_editable": True
                        })
                    else:
                        # Interactive failed, fall back to coordinate method
                        logger.warning(f"Interactive filling failed: {result.message}")
                        method_to_use = "coordinate"
                
                # Use coordinate-based filling (either forced or as fallback)
                if method_to_use == "coordinate":
                    # First analyze the layout to get better coordinates
                    layout_result = await self.analyze_form_layout(file_path)
                    custom_coordinates = {}
                    if layout_result.success:
                        custom_coordinates = layout_result.data.get("suggested_coordinates", {})
                        logger.info(f"Found {len(custom_coordinates)} suggested field positions")
                    
                    # Try coordinate filling
                    result = await self.fill_form_coordinates(
                        file_path, 
                        form_data, 
                        output_path, 
                        custom_coordinates=custom_coordinates,
                        disable_overlap_detection=False
                    )
                    
                    if result.success:
                        diagnostics = result.data.get("diagnostics", {})
                        return self.success_response({
                            "message": f"✅ Successfully filled PDF using coordinate-based placement",
                            "output_file": output_path,
                            "method_used": "coordinate_based_fill",
                            "filled_count": result.data.get("filled_count", 0),
                            "skipped_count": result.data.get("skipped_count", 0),
                            "total_fields": result.data.get("total_fields", 0),
                            "pdf_type": "scanned_or_non_fillable",
                            "diagnostics": diagnostics,
                            "suggested_improvements": [
                                "If fields are in wrong positions, use analyze_form_layout to get better coordinates",
                                "Use generate_coordinate_grid to visualize exact positions",
                                "Provide custom_coordinates for precise field placement"
                            ]
                        })
                    else:
                        return self.error_response(f"Both interactive and coordinate filling failed. Last error: {result.message}")
                        
            except Exception as method_error:
                return self.error_response(f"Error during {method_to_use} filling: {str(method_error)}")
            
            # This should not be reached, but just in case
            return self.error_response("Smart form fill completed but no valid result was generated")
            
        except Exception as e:
            return self.error_response(f"Error in smart form fill: {str(e)}")
