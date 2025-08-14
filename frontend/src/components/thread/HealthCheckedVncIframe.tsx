'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVncPreloader } from '@/hooks/useVncPreloader';

interface HealthCheckedVncIframeProps {
  sandbox: {
    id: string;
    vnc_preview: string;
    pass: string;
  };
  className?: string;
}

export function HealthCheckedVncIframe({ sandbox, className }: HealthCheckedVncIframeProps) {
  const [iframeKey, setIframeKey] = useState(0);
  
  // Use the enhanced VNC preloader hook
  const { status, retryCount, retry, isPreloaded } = useVncPreloader(sandbox, {
    maxRetries: 5,
    initialDelay: 1000,
    timeoutMs: 5000
  });



  // No VNC URL yet - waiting for browser setup
  if (!sandbox.vnc_preview) {
    return (
      <div className={cn('rounded-xl overflow-hidden m-4', className)}>
        <div className='flex flex-col items-center justify-center p-8 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800'>
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
          <p className="text-sm font-medium text-center mb-2">Setting up browser environment...</p>
          <p className="text-xs text-muted-foreground mb-2 text-center">
            Browser will be ready when you use browser tools
          </p>
          <p className="text-xs text-blue-600 text-center">
            📡 Waiting for real-time updates...
          </p>
        </div>
      </div>
    );
  }

  // VNC URL received but preloading in progress
  if (status === 'loading') {
    return (
      <div className={cn('rounded-xl overflow-hidden m-4', className)}>
        <div className='flex flex-col items-center justify-center p-8 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800'>
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-3" />
          <p className="text-sm font-medium text-center mb-2">Connecting to browser...</p>
          <p className="text-xs text-muted-foreground mb-2 text-center">
            Testing VNC connection in background
          </p>
          {retryCount > 0 && (
            <p className="text-xs text-amber-600 text-center">
              🔄 Attempt {retryCount + 1}/5
            </p>
          )}
        </div>
      </div>
    );
  }

  // VNC preload failed after retries
  if (status === 'error') {
    return (
      <div className={cn('rounded-xl overflow-hidden m-4', className)}>
        <div className='flex flex-col items-center justify-center p-8 bg-destructive/10 rounded-xl border border-destructive/20'>
          <AlertCircle className="h-8 w-8 text-destructive mb-3" />
          <p className="text-sm font-medium text-center mb-2">Connection Failed</p>
          <p className="text-xs text-muted-foreground mb-4 text-center">
            Unable to connect to VNC server after 5 attempts
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show VNC iframe - we have URL and no connection issues
  if (isPreloaded) {
    return (
      <div className={cn('rounded-xl overflow-hidden m-4 relative', className)}>
        <div className='overflow-hidden xl:h-[400px] lg:h-[339px] md:h-[303px] h-[400px]'>
          <iframe
            key={iframeKey} // Force reload when key changes
            src={`${sandbox.vnc_preview}/vnc_lite.html?password=${sandbox.pass}&autoconnect=true&scale=local`}
            title="Browser preview"
            className="border-0 xl:translate-y-[-140px] lg:translate-y-[-75px] md:translate-y-[-67px] translate-y-[-80px] sm:translate-y-[-75px] lg:translate-x-[-5px] translate-x-[-5px] xl:translate-x-[-6px] h-[100%] md:h-[370px] lg:h-[420px] xl:h-[600px] w-[100%] md:w-[474px] lg:w-[524px] xl:w-[621px]"
            style={{
              objectFit: 'cover',
              objectPosition: 'center'
            }}
            onLoad={() => console.log('✅ VNC iframe displayed')}
            onError={() => console.log('❌ VNC iframe error')}
          />
        </div>
      </div>
    );
  }

  // Should not reach here
  return null;
}
