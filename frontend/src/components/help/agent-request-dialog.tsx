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
import { Loader2, Bot } from 'lucide-react';

interface AgentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export function AgentRequestDialog({ open, onOpenChange }: AgentRequestDialogProps) {
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
        request_type: 'agent',
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      toast.success('Agent request submitted successfully!');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAttachments([]);
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
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <Bot className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <DialogTitle>Request a Custom Agent</DialogTitle>
              <DialogDescription>
                Tell us about the AI agent or workflow you need
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="agent-title">
              Agent Name / Purpose <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., LinkedIn Outreach Agent, Customer Support Bot..."
              required
              disabled={createRequestMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
              disabled={createRequestMutation.isPending}
            >
              <SelectTrigger id="agent-priority">
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

          <div className="space-y-2">
            <Label htmlFor="agent-description">
              What should this agent do? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="agent-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the agent's workflow, required integrations, inputs, outputs, and any specific requirements..."
              rows={5}
              required
              disabled={createRequestMutation.isPending}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Include: What triggers the agent? What data does it need? What actions should it take? What integrations are required?
            </p>
          </div>

          <TicketImageUpload
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            disabled={createRequestMutation.isPending}
            label="Screenshots / Examples (Optional)"
            uploadId="agent-file-upload"
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
              className="bg-violet-500 hover:bg-violet-600 text-white"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Agent Request'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
