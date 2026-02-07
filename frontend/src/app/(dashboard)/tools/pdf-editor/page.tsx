'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePdfDetection } from '@/hooks/pdf-editor/use-pdf-detection';
import { PDFUploader } from '@/components/pdf-editor/PDFUploader';
import { Toolbar } from '@/components/pdf-editor/Toolbar';
import { FormField, DetectedField, FontFamily } from '@/components/pdf-editor/types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';

// Use simple canvas implementation to avoid react-konva compatibility issues
// react-konva has known issues with Next.js 15 + React 18
import { PDFCanvasSimple } from '@/components/pdf-editor/PDFCanvasSimple';

export default function PDFEditorPage() {
  const [fields, setFields] = useState<FormField[]>([]);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState<FontFamily>('Times New Roman');
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ width_pt: number; height_pt: number; dpi: number } | null>(null);
  const { mutate: detectFields, isPending: isDetecting } = usePdfDetection();

  const handleFileSelect = useCallback(
    (file: File) => {
      setPdfFile(file);
      setFields([]);
      setDetectedFields([]);
      setImageUrl(null);
      setPageSize(null);

      detectFields(file, {
        onSuccess: (response) => {
          // Convert base64 image to data URL
          const dataUrl = `data:image/png;base64,${response.image}`;
          setImageUrl(dataUrl);
          setDetectedFields(response.fields);
          if (response.pageSize) {
            setPageSize(response.pageSize);
          }
          toast.success(`Detected ${response.fields.length} form fields`);
        },
        onError: (error) => {
          toast.error(`Failed to detect fields: ${error.message}`);
        },
      });
    },
    [detectFields]
  );


  const handleDownloadJson = useCallback(() => {
    if (!pdfFile || fields.length === 0) {
      toast.error('Please upload a PDF and detect fields first');
      return;
    }

    try {
      // Calculate PDF coordinates from pixel coordinates
      const pixelToPoint = pageSize ? 72 / pageSize.dpi : 1;
      
      // Build JSON structure with all field data
      const jsonData = {
        metadata: {
          pdfFileName: pdfFile.name,
          exportDate: new Date().toISOString(),
          totalFields: fields.length,
          pageSize: pageSize ? {
            width_pt: pageSize.width_pt,
            height_pt: pageSize.height_pt,
            dpi: pageSize.dpi,
          } : null,
          globalSettings: {
            fontSize,
            fontFamily,
          },
        },
        fields: fields.map((field) => {
          // Convert pixel coordinates to PDF points
          const x_pt = pageSize ? field.x * pixelToPoint : field.x;
          const y_pt = pageSize ? field.y * pixelToPoint : field.y;
          const width_pt = pageSize ? field.width * pixelToPoint : field.width;
          const height_pt = pageSize ? field.height * pixelToPoint : field.height;

          const fieldData: any = {
            id: field.id,
            type: field.type,
            label: field.label || '',
            coordinates: {
              // Pixel coordinates (as detected/displayed)
              pixels: {
                x: field.x,
                y: field.y,
                width: field.width,
                height: field.height,
              },
              // PDF point coordinates (for PDF rendering)
              pdf_points: {
                x: x_pt,
                y: y_pt,
                width: width_pt,
                height: height_pt,
              },
            },
          };

          // Add value based on field type
          if (field.type === 'checkbox') {
            fieldData.value = field.checked || false;
            fieldData.filled = field.checked || false;
          } else {
            fieldData.value = field.value || '';
            fieldData.filled = !!(field.value && field.value.trim() !== '');
          }

          // Add font settings if applicable
          if (field.type === 'text' || field.type === 'signature') {
            fieldData.fontSize = fontSize;
            fieldData.fontFamily = fontFamily;
          }

          return fieldData;
        }),
      };

      // Convert to JSON string with pretty formatting
      const jsonString = JSON.stringify(jsonData, null, 2);
      
      // Create blob and download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFile.name.replace('.pdf', '_form_data.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('JSON downloaded successfully');
    } catch (error) {
      toast.error(`JSON download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [pdfFile, fields, pageSize, fontSize, fontFamily]);

  const handleExport = useCallback(() => {
    if (!pdfFile || !imageUrl || fields.length === 0 || !pageSize) {
      toast.error('Please upload a PDF and fill in the fields first');
      return;
    }

    try {
      // Create PDF with original page size (in points)
      const pdf = new jsPDF({
        orientation: pageSize.width_pt > pageSize.height_pt ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pageSize.width_pt, pageSize.height_pt],
      });

      // Get image dimensions
      const img = new Image();
      img.src = imageUrl;

      img.onload = () => {
        // Use original image at full quality (no compression)
        // Calculate scale factor: image pixels to PDF points
        // Image was converted at pageSize.dpi, so: 1 pixel = 72/pageSize.dpi points
        const pixelToPoint = 72 / pageSize.dpi;
        
        // Add the original image at full quality (PNG for lossless quality)
        pdf.addImage(
          imageUrl,
          'PNG',
          0,
          0,
          img.width * pixelToPoint,
          img.height * pixelToPoint
        );

        // Add form field values with proper scaling
        fields.forEach((field) => {
          // Convert pixel coordinates to PDF points
          const fieldX = field.x * pixelToPoint;
          const fieldY = field.y * pixelToPoint;
          const fieldWidth = field.width * pixelToPoint;
          const fieldHeight = field.height * pixelToPoint;
          
          // Tab space padding (equivalent to ~8px in original image)
          const tabPadding = 8 * pixelToPoint;

          if (field.type === 'text' && field.value) {
            // Use current fontSize from slider
            // Font size is in original image pixels, convert to PDF points
            // Original image: 1 pixel = 72/pageSize.dpi points
            const fontSizePt = (fontSize * 72) / pageSize.dpi;
            pdf.setFontSize(fontSizePt);
            
            // Map font family to jsPDF font names
            const pdfFontMap: Record<FontFamily, string> = {
              'Arial': 'helvetica',
              'Times New Roman': 'times',
              'Calibri': 'helvetica', // jsPDF doesn't have Calibri, use helvetica
              'Helvetica': 'helvetica',
              'Courier New': 'courier',
              'Georgia': 'times', // jsPDF doesn't have Georgia, use times
              'Verdana': 'helvetica', // jsPDF doesn't have Verdana, use helvetica
              'Comic Sans MS': 'helvetica', // jsPDF doesn't have Comic Sans, use helvetica
              'Trebuchet MS': 'helvetica', // jsPDF doesn't have Trebuchet, use helvetica
              'Tahoma': 'helvetica', // jsPDF doesn't have Tahoma, use helvetica
            };
            
            // Apply global font family to all fields
            const pdfFont = pdfFontMap[fontFamily];
            pdf.setFont(pdfFont, 'normal');
            
            // Center text vertically in field, with tab padding from left
            const textY = fieldY + fieldHeight / 2 + fontSizePt / 3;
            pdf.text(field.value, fieldX + tabPadding, textY, {
              maxWidth: fieldWidth - tabPadding * 2,
              align: 'left',
            });
          } else if (field.type === 'checkbox' && field.checked) {
            // Draw checkbox
            const checkboxSize = Math.min(fieldHeight - 4 * pixelToPoint, fieldWidth - 4 * pixelToPoint);
            const checkboxX = fieldX + 2 * pixelToPoint;
            const checkboxY = fieldY + 2 * pixelToPoint;
            
            pdf.setLineWidth(1 * pixelToPoint);
            pdf.setDrawColor(0, 0, 0);
            pdf.rect(checkboxX, checkboxY, checkboxSize, checkboxSize, 'S');
            
            // Draw checkmark
            pdf.setLineWidth(2 * pixelToPoint);
            pdf.setDrawColor(0, 0, 0);
            pdf.line(
              checkboxX + checkboxSize * 0.2,
              checkboxY + checkboxSize * 0.5,
              checkboxX + checkboxSize * 0.45,
              checkboxY + checkboxSize * 0.75
            );
            pdf.line(
              checkboxX + checkboxSize * 0.45,
              checkboxY + checkboxSize * 0.75,
              checkboxX + checkboxSize * 0.8,
              checkboxY + checkboxSize * 0.3
            );
          } else if (field.type === 'signature' && field.value) {
            // Font size is in original image pixels, convert to PDF points
            const fontSizePt = (fontSize * 72) / pageSize.dpi;
            pdf.setFontSize(fontSizePt);
            
            const pdfFontMap: Record<FontFamily, string> = {
              'Arial': 'helvetica',
              'Times New Roman': 'times',
              'Calibri': 'helvetica',
              'Helvetica': 'helvetica',
              'Courier New': 'courier',
              'Georgia': 'times',
              'Verdana': 'helvetica',
              'Comic Sans MS': 'helvetica',
              'Trebuchet MS': 'helvetica',
              'Tahoma': 'helvetica',
            };
            
            // Apply global font family to all fields
            const pdfFont = pdfFontMap[fontFamily];
            pdf.setFont(pdfFont, 'italic');
            pdf.text(field.value, fieldX + tabPadding, fieldY + fieldHeight / 2);
          }
        });

        // Save the PDF
        const fileName = pdfFile.name.replace('.pdf', '_filled.pdf');
        pdf.save(fileName);
        toast.success('PDF exported successfully');
      };

      img.onerror = () => {
        toast.error('Failed to load image for export');
      };
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [pdfFile, imageUrl, fields, fontSize, fontFamily, pageSize]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        {!imageUrl ? (
          <div className="flex-1 flex items-center justify-center p-8">
            {isDetecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Detecting form fields...</p>
              </div>
            ) : (
              <PDFUploader onFileSelect={handleFileSelect} />
            )}
          </div>
        ) : (
          <>
            <Toolbar
              fontSize={fontSize}
              fontFamily={fontFamily}
              onFontSizeChange={setFontSize}
              onFontFamilyChange={setFontFamily}
              onExport={handleExport}
              onDownloadJson={handleDownloadJson}
              disabled={fields.length === 0 || !pdfFile}
            />
            <div className="flex-1 overflow-auto p-4 bg-muted/30">
              <div className="flex justify-center">
                <PDFCanvasSimple
                  imageUrl={imageUrl}
                  detectedFields={detectedFields}
                  fields={fields}
                  fontSize={fontSize}
                  onFieldsChange={setFields}
                  onFontSizeChange={(newSize) => {
                    setFontSize(newSize);
                    // Font size applies globally, no need to update individual fields
                  }}
                  fontFamily={fontFamily}
                  onFontFamilyChange={(newFamily) => {
                    setFontFamily(newFamily);
                    // Font family applies globally, no need to update individual fields
                  }}
                  className="max-w-full"
                />
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
