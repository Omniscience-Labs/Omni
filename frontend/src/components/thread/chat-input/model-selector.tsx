'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Check, ChevronDown, Search, AlertTriangle, Crown, ArrowUpRight } from 'lucide-react';
import { ModelOption, SubscriptionStatus } from './_use-model-selection';
import { PaywallDialog } from '@/components/payment/paywall-dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

const LOW_QUALITY_MODELS = ['deepseek', 'grok-3-mini', 'qwen3', 'gemini-flash-2.5'];

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
  const router = useRouter();

  const filteredOptions = modelOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    opt.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedOptions = {
    premium: filteredOptions.filter(model => model.top),
    standard: filteredOptions.filter(model => !model.top && !LOW_QUALITY_MODELS.includes(model.id)),
    basic: filteredOptions.filter(model => LOW_QUALITY_MODELS.includes(model.id))
  };

  const getBestAvailableModel = () => {
    if (subscriptionStatus === 'active') {
      const sonnetModel = modelOptions.find(m => m.id === 'sonnet-3.7');
      if (sonnetModel && canAccessModel(sonnetModel.id)) {
        return sonnetModel.id;
      }
    }
    
    const defaultFreeModel = modelOptions.find(m => m.id === DEFAULT_FREE_MODEL_ID);
    if (defaultFreeModel && canAccessModel(defaultFreeModel.id)) {
      return defaultFreeModel.id;
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
    
  const isLowQualitySelected = LOW_QUALITY_MODELS.includes(selectedModel);

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

  const handleUpgradeClick = () => {
    router.push('/settings/billing');
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

  const renderModelOption = (opt: ModelOption, index: number) => {
    const accessible = canAccessModel(opt.id);
    const isHighlighted = filteredOptions.indexOf(opt) === highlightedIndex;
    const isPremium = opt.requiresSubscription;
    const isLowQuality = LOW_QUALITY_MODELS.includes(opt.id);
    
    return (
      <TooltipProvider key={opt.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className='w-full'>
              <DropdownMenuItem
                className={cn(
                  "text-sm px-3 py-1 flex items-center justify-between cursor-pointer",
                  isHighlighted && "bg-accent",
                  !accessible && "opacity-70"
                )}
                onClick={() => handleSelect(opt.id)}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.indexOf(opt))}
              >
                <div className="flex items-center">
                  <span className="font-medium">{opt.label}</span>
                  {isLowQuality && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-1.5" />
                  )}
                </div>
                <div className="flex items-center">
                  {isPremium && !accessible && (
                    <span className="text-xs text-purple-500 font-semibold mr-2">MAX</span>
                  )}
                  {selectedModel === opt.id && (
                    <Check className="mr-2 h-4 w-4 text-blue-500" />
                  )}
                  {opt.top && (
                    <Badge className="bg-purple-500/20 text-purple-500 rounded-full">TOP</Badge>
                  )}
                </div>
              </DropdownMenuItem>
            </div>
          </TooltipTrigger>
          {!accessible ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Requires subscription to access premium model</p>
            </TooltipContent>
          ) : isLowQuality ? (
            <TooltipContent side="left" className="text-xs max-w-xs">
              <p>Not recommended for complex tasks</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    );
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
              {isLowQualitySelected && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mr-1" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p>Basic model with limited capabilities</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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

          {subscriptionStatus !== 'active' && (
            <div className="p-3 bg-primary/10 border-b border-border">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center">
                  <Crown className="h-4 w-4 text-primary mr-2" />
                  <div>
                    <p className="text-sm font-medium">Unlock Premium Models</p>
                    <p className="text-xs text-muted-foreground">Get better results with top-tier AI</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  className="w-full h-8 font-medium"
                  onClick={handleUpgradeClick}
                >
                  <span>Upgrade to Pro</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
          
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
              
              <div className="max-h-[280px] overflow-y-auto w-full p-1 scrollbar-hide">
                {filteredOptions.length > 0 ? (
                  <div>
                    {groupedOptions.premium.length > 0 && (
                      <div>
                        {groupedOptions.premium.map(renderModelOption)}
                      </div>
                    )}
                    {groupedOptions.standard.length > 0 && (
                      <div>
                        {groupedOptions.standard.map(renderModelOption)}
                      </div>
                    )}
                    {groupedOptions.basic.length > 0 && (
                      <div>
                        {groupedOptions.basic.map(renderModelOption)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-center py-4 text-muted-foreground">
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
              : 'Subscribe to access premium models with enhanced capabilities'
          }
          ctaText="Subscribe Now"
          cancelText="Maybe Later"
        />
      )}
    </div>
  );
};