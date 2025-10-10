'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCustomerRequest } from '@/hooks/react-query/use-customer-requests';
import { toast } from 'sonner';
import { Loader2, Upload, X, Bug } from 'lucide-react';

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export function BugReportDialog({
  open,
  onOpenChange,
}: BugReportDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('high');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const createRequestMutation = useCreateCustomerRequest();

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

      setAttachments([...attachments, ...newAttachments]);
      toast.success(`${newAttachments.length} image(s) added`);
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createRequestMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        request_type: 'bug', // Preset as bug
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      toast.success('Bug report submitted successfully! We\'ll look into it right away.');
      
      // Reset form
      setTitle('');
      setDescription('');
      setPriority('high');
      setAttachments([]);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit bug report');
    }
  };

  const handleClose = () => {
    if (!createRequestMutation.isPending) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
              <Bug className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle>Report a Bug</DialogTitle>
              <DialogDescription>
                Help us fix issues by reporting bugs you encounter
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Bug Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the bug..."
              required
              disabled={createRequestMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Severity</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
              disabled={createRequestMutation.isPending}
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Minor - Cosmetic Issue</SelectItem>
                <SelectItem value="medium">Moderate - Workaround Available</SelectItem>
                <SelectItem value="high">Major - Impacting Work</SelectItem>
                <SelectItem value="urgent">Critical - Blocking Work</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Bug Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect to happen? Steps to reproduce?"
              rows={6}
              required
              disabled={createRequestMutation.isPending}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-semibold">Please include:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>What you were trying to do</li>
                <li>What actually happened</li>
                <li>Steps to reproduce the issue</li>
                <li>Browser and device information (if relevant)</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="attachments">Screenshots (Highly Recommended)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || createRequestMutation.isPending}
                onClick={() => document.getElementById('file-upload-bug')?.click()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Screenshots
                  </>
                )}
              </Button>
              <input
                id="file-upload-bug"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading || createRequestMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Max 5MB per image
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Screenshots help us understand and fix the issue faster
            </p>
            
            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 border rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <img
                        src={attachment}
                        alt={`Attachment ${index + 1}`}
                        className="h-10 w-10 object-cover rounded"
                      />
                      <span className="text-sm text-muted-foreground truncate">
                        Screenshot {index + 1}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(index)}
                      disabled={createRequestMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createRequestMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createRequestMutation.isPending}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Bug Report'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

