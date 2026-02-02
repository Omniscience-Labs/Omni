'use client';

import React, { useState } from 'react';
import { Plus, Building2 } from 'lucide-react';
import { useAccountState, accountStateSelectors, invalidateAccountState } from '@/hooks/billing';
import { useAuth } from '@/components/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { isLocalMode, isEnterpriseMode } from '@/lib/config';
import { TierBadge } from '@/components/billing/tier-badge';
import { PlanSelectionModal } from '@/components/billing/pricing';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { formatCredits } from '@/lib/utils/credit-formatter';
import Link from 'next/link';
import { useEnterpriseUserStatus } from '@/components/enterprise/EnterpriseUsageDisplay';

/**
 * Enterprise version of the credits display.
 * Shows remaining credits from user's monthly limit instead of SaaS credits.
 */
function EnterpriseCreditsDisplay() {
  const { data: status, isLoading } = useEnterpriseUserStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-[1.5px] border-border/60 dark:border-border rounded-full px-3.5 py-2 h-[41px] bg-background">
        <Skeleton className="h-4 w-24 bg-muted/50 dark:bg-muted" />
      </div>
    );
  }

  const remaining = status?.remaining ?? 0;
  const monthlyLimit = status?.monthly_limit ?? 0;
  const usagePercent = monthlyLimit > 0 ? Math.round((status?.current_month_usage ?? 0) / monthlyLimit * 100) : 0;
  const isNearLimit = usagePercent >= 80;
  const isOverLimit = remaining <= 0;

  return (
    <Link
      href="/admin/enterprise"
      className={cn(
        "group flex items-center gap-2.5 border-[1.5px] rounded-full pl-2.5 pr-3.5 py-2 h-[41px]",
        "bg-background dark:bg-background",
        isOverLimit ? "border-destructive/60 dark:border-destructive/60" :
        isNearLimit ? "border-amber-500/60 dark:border-amber-500/60" :
        "border-border/60 dark:border-border",
        "hover:bg-accent/30 dark:hover:bg-accent/20 hover:border-border dark:hover:border-border/80",
        "transition-all duration-200 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className={cn(
        "flex items-center justify-center h-[24px] w-[24px] rounded-full flex-shrink-0",
        isOverLimit ? "bg-destructive/10 text-destructive" :
        isNearLimit ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
        "bg-primary/10 text-primary"
      )}>
        <Building2 className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0 flex-shrink-0">
        <span className={cn(
          "text-[15px] font-medium leading-none tabular-nums",
          isOverLimit ? "text-destructive" :
          isNearLimit ? "text-amber-600 dark:text-amber-400" :
          "text-foreground dark:text-foreground"
        )}>
          ${remaining.toFixed(2)}
        </span>
        <span className="text-[13px] font-medium text-muted-foreground dark:text-muted-foreground/60 leading-none whitespace-nowrap">
          left
        </span>
      </div>
    </Link>
  );
}

/**
 * SaaS version of the credits display (original functionality).
 */
function SaaSCreditsDisplay() {
  const { user } = useAuth();
  const { data: accountState, isLoading } = useAccountState({ enabled: !!user });
  const [showPlanModal, setShowPlanModal] = useState(false);
  const queryClient = useQueryClient();
  const isLocal = isLocalMode();
  
  const planName = accountStateSelectors.planName(accountState);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-[1.5px] border-border/60 dark:border-border rounded-full px-3.5 py-2 h-[41px] bg-background">
        <Skeleton className="h-4 w-24 bg-muted/50 dark:bg-muted" />
      </div>
    );
  }

  const credits = accountStateSelectors.totalCredits(accountState);
  const formattedCredits = formatCredits(credits);

  const handleClick = () => {
    setShowPlanModal(true);
  };

  const handleModalClose = (open: boolean) => {
    setShowPlanModal(open);
    
    if (!open) {
      // Invalidate account state when modal closes (in case of changes)
      invalidateAccountState(queryClient, true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          "group flex items-center gap-2.5 border-[1.5px] rounded-full pl-2 pr-1 py-2 h-[41px]",
          "bg-background dark:bg-background",
          "border-border/60 dark:border-border",
          "hover:bg-accent/30 dark:hover:bg-accent/20 hover:border-border dark:hover:border-border/80",
          "transition-all duration-200 cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <TierBadge 
          planName={planName} 
          variant="default" 
          size="md" 
          isLocal={isLocal} 
        />
        <div className="flex items-baseline gap-1.5 min-w-0 flex-shrink-0">
          <span className="text-[15px] font-medium text-foreground dark:text-foreground leading-none tabular-nums">
            {formattedCredits}
          </span>
          <span className="text-[13px] font-medium text-muted-foreground dark:text-muted-foreground/60 leading-none whitespace-nowrap">
            Credits
          </span>
        </div>
        <div className="flex items-center justify-center h-[24px] w-[24px] rounded-full bg-black dark:bg-white group-hover:bg-black/90 dark:group-hover:bg-white/90 transition-colors flex-shrink-0 mr-0.5">
          <Plus className="h-3 w-3 text-white dark:text-black font-bold stroke-[2.5]" />
        </div>
      </button>
      <PlanSelectionModal
        open={showPlanModal}
        onOpenChange={handleModalClose}
        returnUrl={typeof window !== 'undefined' ? window.location.href : '/'}
      />
    </>
  );
}

/**
 * Credits display component that shows different UI for enterprise vs SaaS mode.
 */
export function CreditsDisplay() {
  const { user } = useAuth();
  
  if (!user) return null;
  
  // Show enterprise display in enterprise mode, otherwise show SaaS display
  if (isEnterpriseMode()) {
    return <EnterpriseCreditsDisplay />;
  }
  
  return <SaaSCreditsDisplay />;
}
