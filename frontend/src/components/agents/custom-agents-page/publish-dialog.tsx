'use client';

import React from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface PublishDialogData {
  templateId: string;
  templateName: string;
  currentTags: string[];
}

interface PublishDialogProps {
  publishDialog: PublishDialogData | null;
  publishTags: string;
  templatesActioningId: string | null;
  onClose: () => void;
  onPublishTagsChange: (tags: string) => void;
  onPublish: () => void;
}

export const PublishDialog = ({
  publishDialog,
  publishTags,
  templatesActioningId,
  onClose,
  onPublishTagsChange,
  onPublish
}: PublishDialogProps) => {
  return (
    <Dialog open={!!publishDialog} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish Template to Marketplace</DialogTitle>
          <DialogDescription>
            Make "{publishDialog?.templateName}" available for the community to discover and install.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tags">Tags (optional)</Label>
            <Input
              id="tags"
              placeholder="automation, productivity, data-analysis"
              value={publishTags}
              onChange={(e) => onPublishTagsChange(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separate tags with commas to help users discover your template
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={!!templatesActioningId}
          >
            Cancel
          </Button>
          <Button
            onClick={onPublish}
            disabled={!!templatesActioningId}
          >
            {templatesActioningId ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Publishing...
              </>
            ) : (
              <>
                <Globe className="h-4 w-4 mr-2" />
                Publish Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 