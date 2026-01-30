"""
Test script for PDF classifier.

This script can be used to test the PDF inspection functionality.
Run with: python -m core.tools.pdf_inspection.test_pdf_classifier <path_to_pdf>
"""

import sys
import os

# Add backend to path if running as script
if __name__ == "__main__":
    backend_path = os.path.join(os.path.dirname(__file__), "..", "..", "..")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

from core.tools.pdf_inspection import inspect_pdf
import json


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_pdf_classifier.py <path_to_pdf>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        sys.exit(1)
    
    try:
        print(f"Inspecting PDF: {pdf_path}")
        result = inspect_pdf(pdf_path)
        
        print("\n" + "="*60)
        print("INSPECTION RESULTS")
        print("="*60)
        print(json.dumps(result, indent=2))
        print("="*60)
        
        print(f"\nSummary:")
        print(f"  Document Type: {result['doc_type']}")
        print(f"  Pages: {result['page_count']}")
        print(f"  Has AcroForm: {result['has_acroform']}")
        if result['has_acroform']:
            print(f"  AcroForm Fields: {result['acroform_field_count']}")
        print(f"  Reason: {result['reason']}")
        
    except Exception as e:
        print(f"Error inspecting PDF: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
