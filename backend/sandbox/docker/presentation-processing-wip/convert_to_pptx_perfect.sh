#!/bin/bash

# HTML to PPTX Perfect 1:1 Converter Setup and Execution Script
# This script provides PERFECT 1:1 conversion with complete background capture + editable text

set -e  # Exit on any error

echo "🎯 HTML to PPTX Perfect 1:1 Converter"
echo "====================================="
echo "🎨 Perfect background capture + Editable text overlay"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found. Please install Python 3.7+ and try again."
    exit 1
fi

echo "🔧 Setting up dependencies..."

# Install Python dependencies
if [ -f "requirements.txt" ]; then
    echo "📦 Installing Python packages..."
    python3 -m pip install -r requirements.txt
else
    echo "📦 Installing Python packages individually..."
    python3 -m pip install playwright python-pptx Pillow beautifulsoup4 lxml
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browser..."
python3 -m playwright install chromium

echo "✅ Dependencies installed successfully!"
echo ""

# Run the perfect conversion
echo "🚀 Starting PERFECT 1:1 HTML to PPTX conversion..."
echo "📋 Method: Perfect background capture + Editable text overlay"
echo ""

if [ $# -eq 0 ]; then
    # No arguments, use current directory with perfect naming
    python3 html_to_pptx_perfect.py
elif [ $# -eq 1 ]; then
    # One argument (presentation directory or output file)
    if [[ "$1" == *.pptx ]]; then
        # If argument ends with .pptx, treat it as output filename
        python3 html_to_pptx_perfect.py . "$1"
    else
        # Otherwise treat it as presentation directory
        python3 html_to_pptx_perfect.py "$1"
    fi
elif [ $# -eq 2 ]; then
    # Two arguments (presentation directory and output file)
    python3 html_to_pptx_perfect.py "$1" "$2"
else
    echo "Usage: $0 [presentation_directory] [output_file.pptx]"
    echo ""
    echo "Examples:"
    echo "  $0                                  # Convert current directory (perfect mode)"
    echo "  $0 my_slides/                       # Convert my_slides/ (perfect mode)"
    echo "  $0 perfect_output.pptx              # Convert current directory to perfect_output.pptx"
    echo "  $0 my_slides/ perfect_output.pptx   # Convert my_slides/ to perfect_output.pptx"
    echo ""
    echo "Perfect 1:1 Mode Features:"
    echo "  ✅ PERFECT visual fidelity (everything captured exactly)"
    echo "  ✅ All icons, gradients, decorations preserved"
    echo "  ✅ Fully editable text elements"
    echo "  ✅ True 1:1 conversion"
    echo "  ✅ Simple and reliable approach"
    exit 1
fi

echo ""
echo "🎉 PERFECT 1:1 HTML to PPTX conversion completed!"
echo "✨ Perfect backgrounds + Editable text!"
