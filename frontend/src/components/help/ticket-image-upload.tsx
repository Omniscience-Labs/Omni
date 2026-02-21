'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

interface TicketImageUploadProps {
  attachments: string[];
  onAttachmentsChange: (attachments: string[]) => void;
  disabled?: boolean;
  label?: string;
  uploadId: string;
}

export function TicketImageUpload({
  attachments,
  onAttachmentsChange,
  disabled,
  label = 'Screenshots (Optional)',
  uploadId,
}: TicketImageUploadProps) {
  const [isUploading, setIsUploading] = React.useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAttachments: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is too large. Max size is 5MB.`);
          continue;
        }

        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image file.`);
          continue;
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push(base64);
      }

      if (newAttachments.length > 0) {
        onAttachmentsChange([...attachments, ...newAttachments]);
        toast.success(`${newAttachments.length} image(s) added`);
      }
    } catch {
      toast.error('Failed to read images');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={uploadId}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading || disabled}
          onClick={() => document.getElementById(uploadId)?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Images
            </>
          )}
        </Button>
        <input
          id={uploadId}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploading || disabled}
        />
        <p className="text-xs text-muted-foreground">Max 5MB per image</p>
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2 mt-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 border border-border/50 rounded-xl bg-muted/50"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <img
                  src={attachment}
                  alt={`Attachment ${index + 1}`}
                  className="h-10 w-10 object-cover rounded-lg"
                />
                <span className="text-sm text-muted-foreground truncate">
                  Image {index + 1}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAttachment(index)}
                disabled={disabled}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
