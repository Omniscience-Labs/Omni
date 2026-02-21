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
import { Loader2, Lightbulb } from 'lucide-react';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
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
        request_type: 'improvement',
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      toast.success('Feedback submitted successfully!');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAttachments([]);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit feedback');
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
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Lightbulb className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <DialogTitle>Share Your Feedback</DialogTitle>
              <DialogDescription>
                Help us improve by sharing your thoughts and ideas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="feedback-title">
              Summary <span className="text-destructive">*</span>
            </Label>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your feedback..."
              required
              disabled={createRequestMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
              disabled={createRequestMutation.isPending}
            >
              <SelectTrigger id="feedback-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Nice to have</SelectItem>
                <SelectItem value="medium">Would be great</SelectItem>
                <SelectItem value="high">Important</SelectItem>
                <SelectItem value="urgent">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">
              Details <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="feedback-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share your feedback, suggestions, or ideas for improvement..."
              rows={5}
              required
              disabled={createRequestMutation.isPending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              What would you like to see improved? What features would be helpful? How can we make your experience better?
            </p>
          </div>

          <TicketImageUpload
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            disabled={createRequestMutation.isPending}
            label="Screenshots (Optional)"
            uploadId="feedback-file-upload"
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
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
