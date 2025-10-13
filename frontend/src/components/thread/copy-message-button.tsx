'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CopyMessageButtonProps {
  content: string;
  className?: string;
}

export function CopyMessageButton({ content, className = '' }: CopyMessageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={handleCopy}
          variant="ghost"
          size="icon"
          className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${className}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-400" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{copied ? 'Copied!' : 'Copy message'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

