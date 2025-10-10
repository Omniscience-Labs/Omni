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
import { Loader2 } from 'lucide-react';

interface CustomerRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RequestType = 'feature' | 'bug' | 'improvement' | 'agent' | 'other';
type Priority = 'low' | 'medium' | 'high' | 'urgent';

export function CustomerRequestDialog({
  open,
  onOpenChange,
}: CustomerRequestDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestType, setRequestType] = useState<RequestType>('feature');
  const [priority, setPriority] = useState<Priority>('medium');

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
        request_type: requestType,
        priority,
      });

      toast.success('Request submitted successfully!');
      
      // Reset form
      setTitle('');
      setDescription('');
      setRequestType('feature');
      setPriority('medium');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit request');
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
          <DialogTitle>Submit a Request</DialogTitle>
          <DialogDescription>
            Share your feedback, report bugs, or request new features. Your input helps us improve!
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of your request..."
              required
              disabled={createRequestMutation.isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Request Type</Label>
              <Select
                value={requestType}
                onValueChange={(value) => setRequestType(value as RequestType)}
                disabled={createRequestMutation.isPending}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="agent">Agent Request</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as Priority)}
                disabled={createRequestMutation.isPending}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide detailed information about your request..."
              rows={6}
              required
              disabled={createRequestMutation.isPending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Include as much detail as possible to help us understand your needs
            </p>
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
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

