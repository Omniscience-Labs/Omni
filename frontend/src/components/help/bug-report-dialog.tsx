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
import { useCreateCustomerRequest } from '@/hooks/customer-requests/use-customer-requests';
import { TicketImageUpload } from './ticket-image-upload';
import { toast } from 'sonner';
import { Loader2, Bug } from 'lucide-react';

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('high');
  const [attachments, setAttachments] = useState<string[]>([]);

  const createRequestMutation = useCreateCustomerRequest();

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
        request_type: 'bug',
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      toast.success("Bug report submitted! We'll look into it right away.");
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
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <Bug className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Report a Bug</DialogTitle>
              <DialogDescription>
                Help us fix issues by reporting bugs you encounter
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="bug-title">
              Bug Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the bug..."
              required
              disabled={createRequestMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-priority">Severity</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
              disabled={createRequestMutation.isPending}
            >
              <SelectTrigger id="bug-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Minor — Cosmetic issue</SelectItem>
                <SelectItem value="medium">Moderate — Workaround available</SelectItem>
                <SelectItem value="high">Major — Impacting work</SelectItem>
                <SelectItem value="urgent">Critical — Blocking work</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-description">
              Bug Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What did you expect to happen? Steps to reproduce?"
              rows={5}
              required
              disabled={createRequestMutation.isPending}
              className="resize-none"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Please include:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>What you were trying to do</li>
                <li>What actually happened</li>
                <li>Steps to reproduce the issue</li>
              </ul>
            </div>
          </div>

          <TicketImageUpload
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            disabled={createRequestMutation.isPending}
            label="Screenshots (Highly Recommended)"
            uploadId="bug-file-upload"
          />

          <div className="flex items-center justify-end gap-2 pt-2">
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
              variant="destructive"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
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
