export type FontFamily = 
  | 'Arial'
  | 'Times New Roman'
  | 'Calibri'
  | 'Helvetica'
  | 'Courier New'
  | 'Georgia'
  | 'Verdana'
  | 'Comic Sans MS'
  | 'Trebuchet MS'
  | 'Tahoma';

export interface FormField {
  id: string;
  type: 'text' | 'checkbox' | 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  value?: string;
  checked?: boolean;
  fontSize?: number;
  fontFamily?: FontFamily;
}

export interface DetectedField {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
  type: 'text' | 'checkbox' | 'signature';
}

export interface PDFDetectionResponse {
  image: string; // base64 encoded image
  fields: DetectedField[];
  pageSize?: {
    width_pt: number;
    height_pt: number;
    dpi: number;
  };
}

export interface PDFEditorState {
  fields: FormField[];
  selectedFieldId: string | null;
  imageUrl: string | null;
  pdfFile: File | null;
  scale: number;
  fontSize: number;
}
