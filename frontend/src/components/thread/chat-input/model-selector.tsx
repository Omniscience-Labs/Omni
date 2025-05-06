'use client';

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, LockIcon, ZapIcon } from 'lucide-react';
import { ModelOption, SubscriptionStatus } from './_use-model-selection';
import { PaywallDialog } from '@/components/payment/paywall-dialog';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelOptions: ModelOption[];
  canAccessModel: (modelId: string) => boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  modelOptions,
  canAccessModel,
}) => {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [lockedModel, setLockedModel] = useState<string | null>(null);

  const selectedLabel =
    modelOptions.find((o) => o.id === selectedModel)?.label || 'Select model';

  const handleSelect = (id: string) => {
    if (canAccessModel(id)) {
      onModelChange(id);
    } else {
      setLockedModel(id);
      setPaywallOpen(true);
    }
  };

  const closeDialog = () => {
    setPaywallOpen(false);
    setLockedModel(null);
  };

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-8 rounded-md text-muted-foreground shadow-none border-none focus:ring-0 px-3"
          >
            <div className="flex items-center gap-1 text-sm font-medium">
              <span>{selectedLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-50 ml-1" />
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 p-1">
          {modelOptions.map((opt) => {
            const accessible = canAccessModel(opt.id);
            return (
              <TooltipProvider key={opt.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      className="text-sm py-3 px-3 flex items-start cursor-pointer rounded-md"
                      onClick={() => handleSelect(opt.id)}
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            {opt.id === 'sonnet-3.7' && (
                              <ZapIcon className="h-4 w-4 text-yellow-500" />
                            )}
                            <span className="font-medium">{opt.label}</span>
                            {!accessible && <LockIcon className="h-3 w-3 ml-1 text-gray-400" />}
                          </div>
                          {selectedModel === opt.id && (
                            <Check className="h-4 w-4 text-blue-500" />
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {opt.description}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {!accessible && (
                    <TooltipContent side="left" className="text-xs">
                      <p>Requires subscription to access</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {paywallOpen && (
        <PaywallDialog
          open={true}
          onDialogClose={closeDialog}
          title="Premium Model"
          description={
            lockedModel
              ? `Subscribe to access ${modelOptions.find(
                  (m) => m.id === lockedModel
                )?.label}`
              : 'Subscribe to access premium models'
          }
          ctaText="Subscribe Now"
          cancelText="Maybe Later"
        />
      )}
    </div>
  );
};