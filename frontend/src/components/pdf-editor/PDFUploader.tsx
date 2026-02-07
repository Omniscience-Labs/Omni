'use client';

import { useRef, ChangeEvent } from 'react';
import { Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PDFUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function PDFUploader({ onFileSelect, disabled, className }: PDFUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        return;
      }
      onFileSelect(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
      />
      <Button
        onClick={handleClick}
        disabled={disabled}
        variant="outline"
        size="lg"
        className="gap-2"
      >
        <Upload className="h-4 w-4" />
        Upload PDF
      </Button>
      <p className="mt-2 text-sm text-muted-foreground">
        Select a PDF file to detect form fields
      </p>
    </div>
  );
}
