'use client';

import React from 'react';
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
import { Check, ChevronDown, Crown, LockIcon } from 'lucide-react';
import { ModelOption, SubscriptionTier } from './_use-model-selection';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelOptions: ModelOption[];
  currentTier: SubscriptionTier;
  canAccessModel: (modelId: string) => boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  modelOptions,
  currentTier,
  canAccessModel,
}) => {
  const selectedModelLabel =
    modelOptions.find((option) => option.id === selectedModel)?.label || '';

  const handleModelSelection = (modelId: string) => {
    if (canAccessModel(modelId)) {
      onModelChange(modelId);
    }
  };

  const getModelTierInfo = (modelTier: string) => {
    switch (modelTier) {
      case 'base-only':
        return {
          icon: <Crown className="h-3 w-3 text-blue-500" />,
          tooltip: 'Requires Pro plan or higher',
        };
      case 'extra-only':
        return {
          icon: <Crown className="h-3 w-3 text-yellow-500" />,
          tooltip: 'Requires Pro plan',
        };
      default:
        return { icon: null, tooltip: null };
    }
  };

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-md text-muted-foreground shadow-none border-none focus:ring-0 w-auto px-2 py-0"
          >
            <div className="flex items-center gap-1 text-xs">
              <span>{selectedModelLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {modelOptions.map((option) => {
            const { icon, tooltip } = getModelTierInfo(option.tier);
            const isAccessible = canAccessModel(option.id);

            return (
              <TooltipProvider key={option.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      className={`text-sm flex items-center justify-between cursor-pointer ${
                        !isAccessible ? 'opacity-50' : ''
                      }`}
                      onClick={() => handleModelSelection(option.id)}
                    >
                      <div className="flex items-center gap-2">
                        {option.label}
                        {icon}
                        {!isAccessible && <LockIcon className="h-3 w-3 ml-1" />}
                      </div>
                      {selectedModel === option.id && (
                        <Check className="h-4 w-4 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  {tooltip && (
                    <TooltipContent side="left" className="text-xs">
                      <p>{tooltip}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
