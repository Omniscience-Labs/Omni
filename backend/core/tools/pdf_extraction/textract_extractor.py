"""
AWS Textract extraction for visual form understanding.

Uploads PDF to S3, runs AnalyzeDocument, and extracts key-value pairs,
lines, selection elements, and tables.
"""

import boto3
import time
import uuid
from typing import Dict, Any, List, Optional
from botocore.exceptions import ClientError, BotoCoreError
from core.utils.logger import logger
from core.utils.config import config


def extract_textract_candidates(
    pdf_path: str,
    s3_bucket: Optional[str] = None,
    s3_prefix: Optional[str] = None,
    region: Optional[str] = None,
    poll_seconds: Optional[int] = None,
    max_wait_seconds: Optional[int] = None
) -> Dict[str, Any]:
    """
    Extract form candidates using AWS Textract AnalyzeDocument.
    
    Args:
        pdf_path: Local path to PDF file
        s3_bucket: S3 bucket name for temporary storage (defaults to AWS_TEXTRACT_S3_BUCKET from config)
        s3_prefix: S3 prefix for uploaded files (defaults to AWS_TEXTRACT_S3_PREFIX from config)
        region: AWS region for Textract service (defaults to AWS_TEXTRACT_REGION from config)
        poll_seconds: Seconds between polling attempts (defaults to AWS_TEXTRACT_POLL_SECONDS from config)
        max_wait_seconds: Maximum time to wait for completion (defaults to AWS_TEXTRACT_MAX_WAIT_SECONDS from config)
        
    Returns:
        Dictionary with key_values, lines, selection_elements, and tables
    """
    result = {
        "key_values": [],
        "lines": [],
        "selection_elements": [],
        "tables": []
    }
    
    # Get configuration from environment/config with fallback to parameters
    s3_bucket = s3_bucket or config.AWS_TEXTRACT_S3_BUCKET
    s3_prefix = s3_prefix or config.AWS_TEXTRACT_S3_PREFIX or "textract-inputs/"
    region = region or config.AWS_TEXTRACT_REGION or "us-east-1"
    poll_seconds = poll_seconds or config.AWS_TEXTRACT_POLL_SECONDS or 2
    max_wait_seconds = max_wait_seconds or config.AWS_TEXTRACT_MAX_WAIT_SECONDS or 300
    
    # Check if S3 bucket is configured
    if not s3_bucket:
        logger.warning("S3 bucket not configured (set AWS_TEXTRACT_S3_BUCKET or provide s3_bucket parameter), skipping Textract extraction")
        return result
    
    # Check if AWS credentials are available
    if not _check_aws_config():
        logger.warning("AWS credentials not configured, skipping Textract extraction")
        return result
    
    s3_key = None
    job_id = None
    
    try:
        # Initialize clients
        s3_client = boto3.client('s3', region_name=region)
        textract_client = boto3.client('textract', region_name=region)
        
        # Upload PDF to S3
        s3_key = f"{s3_prefix}{uuid.uuid4().hex}.pdf"
        logger.debug(f"Uploading PDF to s3://{s3_bucket}/{s3_key}")
        
        with open(pdf_path, 'rb') as pdf_file:
            s3_client.upload_fileobj(pdf_file, s3_bucket, s3_key)
        
        # Start Textract analysis
        logger.debug("Starting Textract AnalyzeDocument job")
        response = textract_client.start_document_analysis(
            DocumentLocation={
                'S3Object': {
                    'Bucket': s3_bucket,
                    'Name': s3_key
                }
            },
            FeatureTypes=['FORMS', 'TABLES']
        )
        
        job_id = response['JobId']
        logger.debug(f"Textract job started: {job_id}")
        
        # Poll for completion
        start_time = time.time()
        while True:
            response = textract_client.get_document_analysis(JobId=job_id)
            status = response['JobStatus']
            
            if status == 'SUCCEEDED':
                logger.debug(f"Textract job {job_id} completed successfully")
                break
            elif status == 'FAILED':
                error_msg = response.get('StatusMessage', 'Unknown error')
                logger.error(f"Textract job {job_id} failed: {error_msg}")
                return result
            elif status in ['IN_PROGRESS', 'PARTIAL_SUCCESS']:
                elapsed = time.time() - start_time
                if elapsed > max_wait_seconds:
                    logger.warning(f"Textract job {job_id} timed out after {elapsed}s")
                    return result
                time.sleep(poll_seconds)
            else:
                logger.warning(f"Textract job {job_id} in unknown status: {status}")
                return result
        
        # Parse blocks
        blocks = response.get('Blocks', [])
        next_token = response.get('NextToken')
        
        # Handle pagination
        while next_token:
            response = textract_client.get_document_analysis(JobId=job_id, NextToken=next_token)
            blocks.extend(response.get('Blocks', []))
            next_token = response.get('NextToken')
        
        # Extract structured data
        result = _parse_textract_blocks(blocks)
        
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        logger.error(f"AWS error during Textract extraction: {error_code} - {str(e)}")
    except BotoCoreError as e:
        logger.error(f"Boto3 error during Textract extraction: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during Textract extraction: {str(e)}", exc_info=True)
    finally:
        # Clean up S3 file
        if s3_key:
            try:
                s3_client = boto3.client('s3', region_name=region)
                s3_client.delete_object(Bucket=s3_bucket, Key=s3_key)
                logger.debug(f"Deleted temporary S3 file: {s3_key}")
            except Exception as e:
                logger.warning(f"Failed to delete S3 file {s3_key}: {e}")
    
    return result


def _check_aws_config() -> bool:
    """Check if AWS credentials are configured."""
    try:
        # Try to get credentials from environment or config
        session = boto3.Session()
        credentials = session.get_credentials()
        return credentials is not None
    except Exception:
        return False


def _parse_textract_blocks(blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Parse Textract blocks into structured data.
    
    Args:
        blocks: List of Textract block dictionaries
        
    Returns:
        Dictionary with key_values, lines, selection_elements, and tables
    """
    result = {
        "key_values": [],
        "lines": [],
        "selection_elements": [],
        "tables": []
    }
    
    # Build block map for quick lookup
    block_map = {block['Id']: block for block in blocks}
    
    # Extract key-value pairs
    for block in blocks:
        if block['BlockType'] == 'KEY_VALUE_SET':
            entity_type = block.get('EntityTypes', [])
            if 'KEY' in entity_type:
                # This is a KEY block
                key_text = _extract_text_from_block(block, block_map)
                # Find associated VALUE
                value_block = _find_value_for_key(block, blocks, block_map)
                if value_block:
                    value_text = _extract_text_from_block(value_block, block_map)
                    result["key_values"].append({
                        "key": key_text,
                        "value": value_text,
                        "key_bbox": block.get('Geometry', {}).get('BoundingBox', {}),
                        "value_bbox": value_block.get('Geometry', {}).get('BoundingBox', {}),
                        "confidence": block.get('Confidence', 0.0)
                    })
            elif 'VALUE' in entity_type:
                # VALUE blocks are handled when processing KEY blocks
                pass
    
    # Extract lines
    for block in blocks:
        if block['BlockType'] == 'LINE':
            text = _extract_text_from_block(block, block_map)
            if text.strip():
                result["lines"].append({
                    "text": text,
                    "bbox": block.get('Geometry', {}).get('BoundingBox', {}),
                    "confidence": block.get('Confidence', 0.0),
                    "page": block.get('Page', 1)
                })
    
    # Extract selection elements (checkboxes)
    for block in blocks:
        if block['BlockType'] == 'SELECTION_ELEMENT':
            selection_status = block.get('SelectionStatus', 'NOT_SELECTED')
            # Find associated text
            text = _find_text_for_selection(block, blocks, block_map)
            result["selection_elements"].append({
                "selected": selection_status == 'SELECTED',
                "text": text,
                "bbox": block.get('Geometry', {}).get('BoundingBox', {}),
                "confidence": block.get('Confidence', 0.0),
                "page": block.get('Page', 1)
            })
    
    # Extract tables
    tables = _extract_tables(blocks, block_map)
    result["tables"] = tables
    
    return result


def _extract_text_from_block(block: Dict[str, Any], block_map: Dict[str, Dict[str, Any]]) -> str:
    """Extract text from a block, following relationships."""
    text_parts = []
    
    if 'Text' in block:
        text_parts.append(block['Text'])
    
    # Follow relationships
    relationships = block.get('Relationships', [])
    for rel in relationships:
        if rel['Type'] == 'CHILD':
            for child_id in rel['Ids']:
                if child_id in block_map:
                    child = block_map[child_id]
                    if child['BlockType'] == 'WORD':
                        text_parts.append(child.get('Text', ''))
    
    return ' '.join(text_parts).strip()


def _find_value_for_key(key_block: Dict[str, Any], all_blocks: List[Dict[str, Any]], block_map: Dict[str, Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Find the VALUE block associated with a KEY block."""
    relationships = key_block.get('Relationships', [])
    for rel in relationships:
        if rel['Type'] == 'VALUE':
            for value_id in rel['Ids']:
                if value_id in block_map:
                    value_block = block_map[value_id]
                    if 'VALUE' in value_block.get('EntityTypes', []):
                        return value_block
    return None


def _find_text_for_selection(selection_block: Dict[str, Any], all_blocks: List[Dict[str, Any]], block_map: Dict[str, Dict[str, Any]]) -> str:
    """Find text associated with a selection element."""
    # Look for nearby LINE or WORD blocks
    sel_bbox = selection_block.get('Geometry', {}).get('BoundingBox', {})
    sel_page = selection_block.get('Page', 1)
    
    # Find closest LINE on same page
    closest_line = None
    min_distance = float('inf')
    
    for block in all_blocks:
        if block.get('Page') == sel_page and block['BlockType'] == 'LINE':
            line_bbox = block.get('Geometry', {}).get('BoundingBox', {})
            distance = _bbox_distance_norm(sel_bbox, line_bbox)
            if distance < min_distance:
                min_distance = distance
                closest_line = block
    
    if closest_line:
        return _extract_text_from_block(closest_line, block_map)
    
    return ""


def _bbox_distance_norm(bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
    """Calculate distance between two normalized bboxes."""
    center1_x = bbox1.get('Left', 0) + bbox1.get('Width', 0) / 2
    center1_y = bbox1.get('Top', 0) + bbox1.get('Height', 0) / 2
    center2_x = bbox2.get('Left', 0) + bbox2.get('Width', 0) / 2
    center2_y = bbox2.get('Top', 0) + bbox2.get('Height', 0) / 2
    
    return ((center1_x - center2_x) ** 2 + (center1_y - center2_y) ** 2) ** 0.5


def _extract_tables(blocks: List[Dict[str, Any]], block_map: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract table structures from Textract blocks."""
    tables = []
    
    for block in blocks:
        if block['BlockType'] == 'TABLE':
            table_data = {
                "page": block.get('Page', 1),
                "bbox": block.get('Geometry', {}).get('BoundingBox', {}),
                "rows": []
            }
            
            # Find cells
            relationships = block.get('Relationships', [])
            cells = []
            for rel in relationships:
                if rel['Type'] == 'CHILD':
                    for cell_id in rel['Ids']:
                        if cell_id in block_map:
                            cell = block_map[cell_id]
                            if cell['BlockType'] == 'CELL':
                                cell_text = _extract_text_from_block(cell, block_map)
                                cells.append({
                                    "text": cell_text,
                                    "row_index": cell.get('RowIndex', 0),
                                    "column_index": cell.get('ColumnIndex', 0),
                                    "bbox": cell.get('Geometry', {}).get('BoundingBox', {})
                                })
            
            # Group cells by row
            rows_dict = {}
            for cell in cells:
                row_idx = cell['row_index']
                if row_idx not in rows_dict:
                    rows_dict[row_idx] = []
                rows_dict[row_idx].append(cell)
            
            # Sort rows and cells
            for row_idx in sorted(rows_dict.keys()):
                row_cells = sorted(rows_dict[row_idx], key=lambda c: c['column_index'])
                table_data["rows"].append([cell['text'] for cell in row_cells])
            
            tables.append(table_data)
    
    return tables
