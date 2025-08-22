#!/usr/bin/env python3
"""
HTML Presentation to PDF Converter

This script converts HTML slides to a single PDF file based on metadata.json.
It uses Playwright to render each HTML slide at exactly 1920x1080 resolution
and combines them into a single PDF.

Usage:
    python html_to_pdf.py [presentation_directory] [output_pdf_path]

Example:
    python html_to_pdf.py . elon_musk_presentation.pdf
    python html_to_pdf.py /path/to/presentation output.pdf
"""

import json
import os
import sys
import asyncio
from pathlib import Path
from typing import Dict, List, Tuple
import tempfile
import subprocess

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Error: Playwright is not installed. Please install it with:")
    print("pip install playwright")
    print("playwright install chromium")
    sys.exit(1)

try:
    from PyPDF2 import PdfWriter, PdfReader
except ImportError:
    print("Error: PyPDF2 is not installed. Please install it with:")
    print("pip install PyPDF2")
    sys.exit(1)


class PresentationToPDF:
    def __init__(self, presentation_dir: str, output_path: str = None):
        """
        Initialize the converter.
        
        Args:
            presentation_dir: Directory containing metadata.json and HTML slides
            output_path: Output PDF file path (optional, defaults to presentation_name.pdf)
        """
        self.presentation_dir = Path(presentation_dir).resolve()
        self.metadata_path = self.presentation_dir / "metadata.json"
        self.output_path = output_path
        self.metadata = None
        self.slides_info = []
        
        # Validate inputs
        if not self.presentation_dir.exists():
            raise FileNotFoundError(f"Presentation directory not found: {self.presentation_dir}")
        
        if not self.metadata_path.exists():
            raise FileNotFoundError(f"metadata.json not found in: {self.presentation_dir}")
    
    def load_metadata(self) -> Dict:
        """Load and parse metadata.json"""
        try:
            with open(self.metadata_path, 'r', encoding='utf-8') as f:
                self.metadata = json.load(f)
            
            # Extract slide information and sort by slide number
            slides = self.metadata.get('slides', {})
            self.slides_info = []
            
            for slide_num, slide_data in slides.items():
                filename = slide_data.get('filename')
                title = slide_data.get('title', f'Slide {slide_num}')
                
                if filename:
                    html_path = self.presentation_dir / filename
                    if html_path.exists():
                        self.slides_info.append({
                            'number': int(slide_num),
                            'title': title,
                            'filename': filename,
                            'path': html_path
                        })
                    else:
                        print(f"Warning: HTML file not found: {html_path}")
            
            # Sort slides by number
            self.slides_info.sort(key=lambda x: x['number'])
            
            if not self.slides_info:
                raise ValueError("No valid slides found in metadata.json")
            
            # Set default output path if not provided
            if not self.output_path:
                presentation_name = self.metadata.get('presentation_name', 'presentation')
                self.output_path = self.presentation_dir / f"{presentation_name}.pdf"
            else:
                self.output_path = Path(self.output_path).resolve()
            
            print(f"Loaded {len(self.slides_info)} slides from metadata")
            return self.metadata
            
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in metadata.json: {e}")
        except Exception as e:
            raise ValueError(f"Error loading metadata: {e}")
    
    async def render_slide_to_pdf(self, browser, slide_info: Dict, temp_dir: Path) -> Path:
        """
        Render a single HTML slide to PDF using Playwright.
        
        Args:
            browser: Playwright browser instance
            slide_info: Slide information dictionary
            temp_dir: Temporary directory for intermediate files
        
        Returns:
            Path to the generated PDF file
        """
        html_path = slide_info['path']
        slide_num = slide_info['number']
        
        print(f"Rendering slide {slide_num}: {slide_info['title']}")
        
        # Create new page with exact presentation dimensions
        page = await browser.new_page()
        
        try:
            # CRITICAL: Set exact viewport to 1920x1080 - this is the key!
            await page.set_viewport_size({"width": 1920, "height": 1080})
            
            # Use screen media type for accurate rendering
            await page.emulate_media(media='screen')
            
            # Disable device scale factor to ensure 1:1 pixel mapping
            await page.evaluate("""
                () => {
                    // Override device pixel ratio to ensure exact dimensions
                    Object.defineProperty(window, 'devicePixelRatio', {
                        get: () => 1
                    });
                }
            """)
            
            # Navigate to the HTML file
            file_url = f"file://{html_path.absolute()}"
            await page.goto(file_url, wait_until="networkidle", timeout=30000)
            
            # Wait for fonts and dynamic content to fully load
            await page.wait_for_timeout(3000)
            
            # Ensure the slide container is exactly 1920x1080
            await page.evaluate("""
                () => {
                    const slideContainer = document.querySelector('.slide-container');
                    if (slideContainer) {
                        slideContainer.style.width = '1920px';
                        slideContainer.style.height = '1080px';
                        slideContainer.style.transform = 'none';
                        slideContainer.style.maxWidth = 'none';
                        slideContainer.style.maxHeight = 'none';
                    }
                    
                    // Ensure body doesn't interfere with dimensions
                    document.body.style.margin = '0';
                    document.body.style.padding = '0';
                    document.body.style.width = '1920px';
                    document.body.style.height = '1080px';
                    document.body.style.overflow = 'hidden';
                }
            """)
            
            # Wait a bit more for the layout adjustments
            await page.wait_for_timeout(1000)
            
            # Generate PDF for this slide with exact dimensions
            temp_pdf_path = temp_dir / f"slide_{slide_num:02d}.pdf"
            
            await page.pdf(
                path=str(temp_pdf_path),
                width="1920px",
                height="1080px",
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                print_background=True,
                prefer_css_page_size=False
            )
            
            print(f"  ✓ Slide {slide_num} rendered at 1920x1080")
            return temp_pdf_path
            
        except Exception as e:
            raise RuntimeError(f"Error rendering slide {slide_num}: {e}")
        finally:
            await page.close()
    
    def combine_pdfs(self, pdf_paths: List[Path]) -> None:
        """
        Combine multiple PDF files into a single PDF.
        
        Args:
            pdf_paths: List of PDF file paths to combine
        """
        print(f"Combining {len(pdf_paths)} PDFs into final output...")
        
        pdf_writer = PdfWriter()
        
        try:
            for pdf_path in pdf_paths:
                if not pdf_path.exists():
                    print(f"Warning: PDF file not found: {pdf_path}")
                    continue
                
                with open(pdf_path, 'rb') as pdf_file:
                    pdf_reader = PdfReader(pdf_file)
                    for page in pdf_reader.pages:
                        pdf_writer.add_page(page)
            
            # Write the combined PDF
            with open(self.output_path, 'wb') as output_file:
                pdf_writer.write(output_file)
            
            print(f"✅ PDF created successfully: {self.output_path}")
            print(f"📊 Total pages: {len(pdf_writer.pages)}")
            
        except Exception as e:
            raise RuntimeError(f"Error combining PDFs: {e}")
    
    async def convert_to_pdf(self) -> None:
        """Main conversion method"""
        print("🚀 Starting HTML to PDF conversion...")
        
        # Load metadata
        self.load_metadata()
        
        # Create temporary directory for intermediate files
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            pdf_paths = []
            
            # Launch browser with exact rendering settings
            async with async_playwright() as p:
                print("🌐 Launching browser with 1920x1080 configuration...")
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--no-first-run',
                        '--disable-default-apps',
                        '--disable-web-security',
                        '--disable-features=TranslateUI',
                        '--disable-ipc-flooding-protection',
                        # Force device scale factor to 1 for exact pixel mapping
                        '--force-device-scale-factor=1',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding'
                    ]
                )
                
                try:
                    # Process each slide
                    for slide_info in self.slides_info:
                        pdf_path = await self.render_slide_to_pdf(browser, slide_info, temp_path)
                        pdf_paths.append(pdf_path)
                    
                finally:
                    await browser.close()
            
            # Combine all PDFs
            self.combine_pdfs(pdf_paths)
        
        print("✨ Conversion completed successfully!")


def check_dependencies():
    """Check if required dependencies are available"""
    missing_deps = []
    
    try:
        import playwright
    except ImportError:
        missing_deps.append("playwright (pip install playwright)")
    
    try:
        import PyPDF2
    except ImportError:
        missing_deps.append("PyPDF2 (pip install PyPDF2)")
    
    if missing_deps:
        print("❌ Missing dependencies:")
        for dep in missing_deps:
            print(f"  - {dep}")
        print("\nPlease install missing dependencies and try again.")
        return False
    
    # Check if Playwright browsers are installed
    try:
        result = subprocess.run(['playwright', 'install', '--dry-run'], 
                              capture_output=True, text=True, timeout=10)
        if "chromium" not in result.stdout.lower():
            print("⚠️  Playwright browser not found. Please run:")
            print("   playwright install chromium")
            return False
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
        print("⚠️  Could not verify Playwright installation. You may need to run:")
        print("   playwright install chromium")
    
    return True


def main():
    """Main CLI entry point"""
    print("📄 HTML Presentation to PDF Converter")
    print("=" * 50)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Parse command line arguments
    if len(sys.argv) < 2:
        presentation_dir = "."
        output_path = None
    elif len(sys.argv) == 2:
        presentation_dir = sys.argv[1]
        output_path = None
    elif len(sys.argv) == 3:
        presentation_dir = sys.argv[1]
        output_path = sys.argv[2]
    else:
        print("Usage: python html_to_pdf.py [presentation_directory] [output_pdf_path]")
        print("\nExamples:")
        print("  python html_to_pdf.py")
        print("  python html_to_pdf.py . my_presentation.pdf")
        print("  python html_to_pdf.py /path/to/slides output.pdf")
        sys.exit(1)
    
    try:
        # Create converter and run
        converter = PresentationToPDF(presentation_dir, output_path)
        asyncio.run(converter.convert_to_pdf())
        
    except KeyboardInterrupt:
        print("\n❌ Conversion cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
