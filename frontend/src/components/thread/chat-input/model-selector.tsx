'use client';

import React, { useState, useRef, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Check, ChevronDown, Search } from 'lucide-react';
import { ModelOption, SubscriptionStatus } from './_use-model-selection';
import { PaywallDialog } from '@/components/payment/paywall-dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  modelOptions: ModelOption[];
  canAccessModel: (modelId: string) => boolean;
  subscriptionStatus: SubscriptionStatus;
  initialAutoSelect?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  modelOptions,
  canAccessModel,
  subscriptionStatus,
  initialAutoSelect = true,
}) => {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [lockedModel, setLockedModel] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [autoSelect, setAutoSelect] = useState(initialAutoSelect);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = modelOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opt.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getBestAvailableModel = () => {
    if (subscriptionStatus === 'active') {
      const sonnetModel = modelOptions.find(m => m.id === 'sonnet-3.7');
      if (sonnetModel && canAccessModel(sonnetModel.id)) {
        return sonnetModel.id;
      }
    }
    
    const deepseekModel = modelOptions.find(m => m.id === 'deepseek');
    if (deepseekModel && canAccessModel(deepseekModel.id)) {
      return deepseekModel.id;
    }
    
    const firstAvailable = modelOptions.find(m => canAccessModel(m.id));
    return firstAvailable ? firstAvailable.id : selectedModel;
  };

  useEffect(() => {
    if (autoSelect) {
      const bestModel = getBestAvailableModel();
      if (bestModel && bestModel !== selectedModel) {
        onModelChange(bestModel);
      }
    }
  }, [autoSelect, subscriptionStatus, modelOptions, selectedModel]);

  useEffect(() => {
    if (isOpen && !autoSelect && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen, autoSelect]);

  const selectedLabel =
    modelOptions.find((o) => o.id === selectedModel)?.label || 'Select model';

  const handleSelect = (id: string) => {
    if (canAccessModel(id)) {
      onModelChange(id);
      setIsOpen(false);
    } else {
      setLockedModel(id);
      setPaywallOpen(true);
    }
  };

  const handleAutoSelectToggle = (checked: boolean) => {
    setAutoSelect(checked);
    if (checked) {
      const bestModel = getBestAvailableModel();
      if (bestModel) {
        onModelChange(bestModel);
      }
    }
  };

  const closeDialog = () => {
    setPaywallOpen(false);
    setLockedModel(null);
  };

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => 
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => 
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const selectedOption = filteredOptions[highlightedIndex];
      if (selectedOption) {
        handleSelect(selectedOption.id);
      }
    }
  };

  return (
    <div className="relative">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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

        <DropdownMenuContent 
          align="end" 
          className="w-64 p-0 overflow-hidden"
          sideOffset={4}
        >
          <div className="px-3 py-2.5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Auto-select</span>
                <span className="text-xs text-muted-foreground">
                  Balanced quality and speed, recommended for most tasks
                </span>
              </div>
              <Switch 
                checked={autoSelect} 
                onCheckedChange={handleAutoSelectToggle}
              />
            </div>
          </div>
          
          {!autoSelect && (
            <>
              <div className="px-3 py-2 border-b border-border">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchInputKeyDown}
                    className="w-full h-8 px-8 py-1 rounded-md text-sm focus:outline-none bg-muted"
                  />
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto w-full p-3 scrollbar-hide">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((opt, index) => {
                    const accessible = canAccessModel(opt.id);
                    const isHighlighted = index === highlightedIndex;
                    const isPremium = opt.requiresSubscription;
                    
                    return (
                      <TooltipProvider key={opt.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className='w-full'>
                              <DropdownMenuItem
                                className={cn(
                                  "text-sm px-3 py-1.5 flex items-center justify-between cursor-pointer",
                                  isHighlighted && "bg-accent",
                                  !accessible && "opacity-70"
                                )}
                                onClick={() => handleSelect(opt.id)}
                                onMouseEnter={() => setHighlightedIndex(index)}
                              >
                                <span className="font-medium">{opt.label}</span>
                                <div className="flex items-center">
                                  {isPremium && !accessible && (
                                    <span className="text-xs text-purple-500 font-semibold mr-2">MAX</span>
                                  )}
                                  {selectedModel === opt.id && (
                                    <Check className="mr-2 h-4 w-4 text-blue-500" />
                                  )}
                                  {opt.top && (
                                    <Badge className="bg-yellow-500/20 text-yellow-500 rounded-full">TOP</Badge>
                                  )}
                                </div>
                              </DropdownMenuItem>
                            </div>
                          </TooltipTrigger>
                          {!accessible && (
                            <TooltipContent side="left" className="text-xs">
                              <p>Requires subscription to access</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })
                ) : (
                  <div className="text-sm text-center py-2 text-muted-foreground">
                    No models match your search
                  </div>
                )}
              </div>
            </>
          )}
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