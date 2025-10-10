'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, HelpCircle } from 'lucide-react';
import { CustomerRequestDialog } from './customer-request-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FloatingHelpFeedbackButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 left-6 z-50">
        <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40 shadow-lg border border-blue-200/50 dark:border-blue-800/50 p-4 transition-all hover:shadow-xl max-w-xs">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-foreground">
                Need Help? Got Feedback?
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Share feedback, report bugs, or request features to help us improve
            </span>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <MessageSquarePlus className="h-4 w-4 mr-2" />
                    Submit Request
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Submit Feature Request or Bug Report</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <CustomerRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}

