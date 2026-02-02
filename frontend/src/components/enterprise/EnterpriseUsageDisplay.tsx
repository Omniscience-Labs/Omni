'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { isEnterpriseMode } from '@/lib/config';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, TrendingUp, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnterpriseUserStatus {
  monthly_limit: number;
  current_month_usage: number;
  remaining: number;
  is_active: boolean;
  last_reset_at: string | null;
}

/**
 * Fetches the current user's enterprise billing status.
 */
export function useEnterpriseUserStatus() {
  return useQuery({
    queryKey: ['enterprise', 'user-status'],
    queryFn: async (): Promise<EnterpriseUserStatus> => {
      const response = await backendApi.get('/billing/enterprise/user-status');
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch enterprise status');
      }
      return response.data;
    },
    enabled: isEnterpriseMode(),
    staleTime: 30 * 1000, // 30 seconds
    retry: 1,
  });
}

/**
 * Calculate days until monthly reset.
 */
function getDaysUntilReset(lastResetAt: string | null): number {
  if (!lastResetAt) return 0;
  
  const lastReset = new Date(lastResetAt);
  const nextReset = new Date(lastReset);
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);
  nextReset.setHours(0, 0, 0, 0);
  
  const now = new Date();
  const diffTime = nextReset.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Compact enterprise credit display for header/sidebar.
 * Shows remaining credits and usage percentage.
 */
export function EnterpriseCreditsChip({ className }: { className?: string }) {
  const { data: status, isLoading, error } = useEnterpriseUserStatus();

  if (!isEnterpriseMode()) return null;
  
  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full", className)}>
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-muted-foreground text-sm", className)}>
        <Building2 className="h-4 w-4" />
        <span>Enterprise</span>
      </div>
    );
  }

  const usagePercent = status.monthly_limit > 0 
    ? Math.round((status.current_month_usage / status.monthly_limit) * 100)
    : 0;
  
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = usagePercent >= 100;

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
        isOverLimit ? "bg-destructive/10 text-destructive" :
        isNearLimit ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
        "bg-primary/10 text-primary",
        className
      )}
    >
      <Building2 className="h-4 w-4" />
      <span>${status.remaining.toFixed(2)} left</span>
    </div>
  );
}

/**
 * Full enterprise usage card for dashboard or settings.
 * Shows monthly limit, usage, remaining, and progress bar.
 */
export function EnterpriseUsageCard({ className }: { className?: string }) {
  const { data: status, isLoading, error } = useEnterpriseUserStatus();

  if (!isEnterpriseMode()) return null;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Enterprise Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Enterprise Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load usage information.
          </p>
        </CardContent>
      </Card>
    );
  }

  const usagePercent = status.monthly_limit > 0 
    ? Math.min(100, Math.round((status.current_month_usage / status.monthly_limit) * 100))
    : 0;
  
  const daysUntilReset = getDaysUntilReset(status.last_reset_at);
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = status.remaining <= 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5 text-primary" />
          Enterprise Usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">${status.monthly_limit.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Monthly Limit</p>
          </div>
          <div>
            <p className="text-2xl font-bold">${status.current_month_usage.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Used</p>
          </div>
          <div>
            <p className={cn(
              "text-2xl font-bold",
              isOverLimit ? "text-destructive" : isNearLimit ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
            )}>
              ${status.remaining.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Usage</span>
            <span>{usagePercent}%</span>
          </div>
          <Progress 
            value={usagePercent} 
            className={cn(
              "h-2",
              isOverLimit ? "[&>div]:bg-destructive" :
              isNearLimit ? "[&>div]:bg-amber-500" : ""
            )}
          />
        </div>

        {/* Reset info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>Resets in {daysUntilReset} days</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span>{usagePercent}% used</span>
          </div>
        </div>

        {/* Warning message if near limit */}
        {isNearLimit && !isOverLimit && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md p-2">
            You&apos;re approaching your monthly limit. Contact your admin if you need more credits.
          </div>
        )}
        
        {isOverLimit && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2">
            You&apos;ve reached your monthly limit. Contact your admin for additional credits.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EnterpriseUsageCard;
