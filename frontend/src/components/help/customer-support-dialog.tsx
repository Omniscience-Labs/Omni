'use client';

import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare } from 'lucide-react';
import Cal, { getCalApi } from '@calcom/embed-react';

interface CustomerSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerSupportDialog({ open, onOpenChange }: CustomerSupportDialogProps) {
  useEffect(() => {
    (async function () {
      const cal = await getCalApi();
      cal('ui', {
        theme: 'light',
        styles: { branding: { brandColor: '#3b82f6' } },
        hideEventTypeDetails: false,
        layout: 'month_view',
      });
    })();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <DialogTitle>Help & Support</DialogTitle>
              <DialogDescription>
                Schedule a help session with a human
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="h-[580px] overflow-auto rounded-xl">
          <Cal
            namespace="support-booking"
            calLink="sundar001/30min"
            style={{ width: '100%', height: '100%', overflow: 'scroll' }}
            config={{
              layout: 'month_view',
              theme: 'light',
              hideEventTypeDetails: 'false',
              hideBranding: 'true',
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
