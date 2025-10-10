'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';
import { CustomerRequestDialog } from './customer-request-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FloatingCustomerRequestButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsDialogOpen(true)}
              size="lg"
              className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all z-50"
            >
              <MessageSquarePlus className="h-6 w-6" />
              <span className="sr-only">Submit Customer Request</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Submit Feature Request or Bug Report</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CustomerRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}

