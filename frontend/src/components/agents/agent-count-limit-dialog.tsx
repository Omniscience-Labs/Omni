'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PricingSection } from '@/components/home/sections/pricing-section';
import { Separator } from '@/components/ui/separator';

interface AgentCountLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCount: number;
  limit: number;
  tierName: string;
}

export const AgentCountLimitDialog: React.FC<AgentCountLimitDialogProps> = ({
  open,
  onOpenChange,
  currentCount,
  limit,
  tierName,
}) => {
  const returnUrl = typeof window !== 'undefined' ? window.location.href : '/';

  const getNextTierRecommendation = () => {
    if (tierName === 'free') {
      return {
        name: 'Plus',
        price: '$20/month',
        agentLimit: 5,
      };
    } else if (tierName.includes('tier_2_20')) {
      return {
        name: 'Pro',
        price: '$50/month', 
        agentLimit: 20,
      };
    } else if (tierName.includes('tier_6_50')) {
      return {
        name: 'Business',
        price: '$200/month',
        agentLimit: 100,
      };
    }
    return null;
  };

  const nextTier = getNextTierRecommendation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-auto overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="border border-amber-300 dark:border-amber-900 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              Agent Limit Reached
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            You've reached the maximum number of agents allowed on your current plan.
          </DialogDescription>
        </DialogHeader>
        <div className="[&_.grid]:!grid-cols-4 [&_.grid]:gap-3 mt-8">
          <PricingSection 
            returnUrl={returnUrl} 
            showTitleAndTabs={false} 
            insideDialog={true} 
            showInfo={false}
            noPadding={true}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}; 