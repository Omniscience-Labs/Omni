import { useMutation } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { PDFDetectionResponse, DetectedField } from '@/components/pdf-editor/types';
import { toast } from 'sonner';

export const pdfDetectionKeys = {
  all: ['pdf-detection'] as const,
  detect: () => [...pdfDetectionKeys.all, 'detect'] as const,
};

/**
 * Hook for detecting form fields in a PDF using YOLO model
 */
export function usePdfDetection() {
  return useMutation({
    mutationKey: pdfDetectionKeys.detect(),
    mutationFn: async (file: File): Promise<PDFDetectionResponse> => {
      // Validate file type
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        throw new Error('Please upload a valid PDF file');
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('File size exceeds 10MB limit');
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await backendApi.upload<{
        success: boolean;
        fields: Array<{
          id: number;
          type: string;
          confidence: number;
          bbox: { x1: number; y1: number; x2: number; y2: number };
          bbox_pixels: { x1: number; y1: number; x2: number; y2: number };
        }>;
        image: {
          data: string;
          format: string;
          width: number;
          height: number;
        };
        page_size?: {
          width_pt: number;
          height_pt: number;
          dpi: number;
        };
      }>('/pdf-editor/detect', formData);

      if (!response.success || !response.data) {
        const errorMessage = response.error?.message || 'Failed to detect form fields';
        throw new Error(errorMessage);
      }

      const backendData = response.data;

      // Transform backend response to frontend format
      const transformedFields: DetectedField[] = backendData.fields.map((field) => {
        // Use pixel coordinates for frontend (more accurate)
        const x = field.bbox_pixels.x1;
        const y = field.bbox_pixels.y1;
        const width = field.bbox_pixels.x2 - field.bbox_pixels.x1;
        const height = field.bbox_pixels.y2 - field.bbox_pixels.y1;

        // Map backend field types to frontend types
        let fieldType: 'text' | 'checkbox' | 'signature' = 'text';
        const typeLower = field.type.toLowerCase();
        if (typeLower.includes('checkbox') || typeLower.includes('check')) {
          fieldType = 'checkbox';
        } else if (typeLower.includes('signature') || typeLower.includes('sign')) {
          fieldType = 'signature';
        }

        return {
          x,
          y,
          width,
          height,
          label: field.type, // Use field type as label
          confidence: field.confidence,
          type: fieldType,
        };
      });

      return {
        image: backendData.image.data,
        fields: transformedFields,
        pageSize: backendData.page_size,
      };
    },
    onError: (error: Error) => {
      toast.error(`PDF detection failed: ${error.message}`);
    },
  });
}
