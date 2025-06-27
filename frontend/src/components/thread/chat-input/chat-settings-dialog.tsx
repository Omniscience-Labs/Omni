'use client';

import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ModelSelector } from './model-selector';
import { SubscriptionStatus } from './_use-model-selection';
import { cn } from '@/lib/utils';

interface ChatSettingsDialogProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelOptions: any[];
  subscriptionStatus: SubscriptionStatus;
  canAccessModel: (modelId: string) => boolean;
  refreshCustomModels?: () => void;
  disabled?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ChatSettingsDialog({
  selectedModel,
  onModelChange,
  modelOptions,
  subscriptionStatus,
  canAccessModel,
  refreshCustomModels,
  disabled = false,
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ChatSettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 w-8 p-0 text-muted-foreground hover:text-foreground',
              'rounded-lg',
              className
            )}
            disabled={disabled}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Chat Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="model-selector" className="text-sm font-medium">
              AI Model
            </Label>
            <div className="w-full">
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                modelOptions={modelOptions}
                subscriptionStatus={subscriptionStatus}
                canAccessModel={canAccessModel}
                refreshCustomModels={refreshCustomModels}
                hasBorder={true}
                billingModalOpen={billingModalOpen}
                setBillingModalOpen={setBillingModalOpen}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Choose the AI model that best fits your needs. Premium models offer better performance.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 