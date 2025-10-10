'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageSquare } from 'lucide-react';
import Cal, { getCalApi } from '@calcom/embed-react';
import { useEffect } from 'react';

interface CustomerSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerSupportDialog({
  open,
  onOpenChange,
}: CustomerSupportDialogProps) {
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
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle>Help & Support</DialogTitle>
              <DialogDescription>
                Schedule a help session with a human
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="h-[600px] overflow-auto">
          <style jsx global>{`
            /* Hide Cal.com branding */
            [data-cal-namespace="support-booking"] .cal-branding,
            [data-cal-namespace="support-booking"] .cal-powered-by,
            [data-cal-namespace="support-booking"] [class*="branding"],
            [data-cal-namespace="support-booking"] [class*="powered-by"],
            [data-cal-namespace="support-booking"] .cal-powered,
            [data-cal-namespace="support-booking"] [class*="cal-powered"],
            [data-cal-namespace="support-booking"] .cal-footer,
            [data-cal-namespace="support-booking"] [class*="footer"] {
              display: none !important;
            }
            
            /* Ensure the calendar takes full height */
            [data-cal-namespace="support-booking"] iframe {
              height: 100% !important;
              border: none !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            /* Hide any Cal.com watermark or overlay */
            [data-cal-namespace="support-booking"] .cal-watermark,
            [data-cal-namespace="support-booking"] [class*="watermark"],
            [data-cal-namespace="support-booking"] .cal-overlay,
            [data-cal-namespace="support-booking"] [class*="overlay"] {
              display: none !important;
            }
          `}</style>
          <Cal
            namespace="support-booking"
            calLink="arjun-subramaniam-u32lcu/30min"
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

