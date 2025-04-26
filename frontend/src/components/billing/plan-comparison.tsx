'use client';

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { setupNewSubscription, getAccountSubscription } from "@/lib/actions/billing";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/home";
import { isLocalMode } from "@/lib/config";
import { SUBSCRIPTION_TIERS } from "@/components/billing/subscription";

export const SUBSCRIPTION_PLANS = {
  FREE: SUBSCRIPTION_TIERS.FREE.priceId,
  PRO: SUBSCRIPTION_TIERS.BASE.priceId,
  ENTERPRISE: SUBSCRIPTION_TIERS.EXTRA.priceId,
};

const PriceDisplay = ({ tier, isCompact }: { tier: typeof siteConfig.cloudPricingItems[number]; isCompact?: boolean }) => {
  return (
    <motion.span
      key={tier.price}
      className={isCompact ? "text-xl font-semibold" : "text-3xl font-semibold"}
      initial={{
        opacity: 0,
        x: 10,
        filter: "blur(5px)",
      }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
    >
      {tier.price}
    </motion.span>
  );
};

interface PlanComparisonProps {
  accountId?: string | null;
  returnUrl?: string;
  isManaged?: boolean;
  onPlanSelect?: (planId: string) => void;
  className?: string;
  isCompact?: boolean; // When true, uses vertical stacked layout for modals
}

export function PlanComparison({
  accountId,
  returnUrl = typeof window !== 'undefined' ? window.location.href : '',
  isManaged = true,
  onPlanSelect,
  className = "",
  isCompact = false
}: PlanComparisonProps) {
  const [currentPlanId, setCurrentPlanId] = useState<string | undefined>();

  useEffect(() => {
    async function fetchCurrentPlan() {
      if (accountId) {
        try {
          const result = await getAccountSubscription(accountId);
          if (result && !('message' in result)) {
            setCurrentPlanId(result.subscription?.price_id || SUBSCRIPTION_PLANS.FREE);
          } else {
            setCurrentPlanId(SUBSCRIPTION_PLANS.FREE);
          }
        } catch (error) {
          console.error('Error fetching subscription:', error);
          setCurrentPlanId(SUBSCRIPTION_PLANS.FREE);
        }
      } else {
        setCurrentPlanId(SUBSCRIPTION_PLANS.FREE);
      }
    }
    
    fetchCurrentPlan();
  }, [accountId]);

  if (isLocalMode()) {
    return (
      <div className={cn("p-4 bg-muted/30 border border-border rounded-lg text-center", className)}>
        <p className="text-sm text-muted-foreground">
          Running in local development mode - billing features are disabled
        </p>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "grid gap-3 w-full mx-auto", 
        isCompact 
          ? "grid-cols-1 max-w-md" 
          : "grid-cols-1 md:grid-cols-3 max-w-6xl",
        className
      )}
    >
      {siteConfig.cloudPricingItems.map((tier) => {
        const isCurrentPlan = currentPlanId === SUBSCRIPTION_PLANS[tier.name.toUpperCase() as keyof typeof SUBSCRIPTION_PLANS];
        
        return (
          <div
            key={tier.name}
            className={cn(
              "rounded-lg bg-background border border-border", 
              isCompact ? "p-3 text-sm" : "p-5",
              isCurrentPlan && (isCompact ? "ring-1 ring-primary" : "ring-2 ring-primary")
            )}
          >
            {isCompact ? (
              // Compact layout for modal
              <>
                <div className="flex justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-medium">{tier.name}</h3>
                      {tier.isPopular && (
                        <span className="bg-primary/10 text-primary text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      {isCurrentPlan && (
                        <span className="bg-secondary/10 text-secondary text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{tier.description}</div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-baseline">
                      <PriceDisplay tier={tier} isCompact={true} />
                      <span className="text-xs text-muted-foreground ml-1">
                        {tier.price !== "$0" ? "/mo" : ""}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {tier.hours}/month
                    </div>
                  </div>
                </div>
                
                <div className="mb-2.5">
                  <div className="text-[10px] text-muted-foreground leading-tight max-h-[40px] overflow-y-auto pr-1">
                    {tier.features.map((feature, index) => (
                      <span key={index} className="whitespace-normal">
                        {index > 0 && ' • '}
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              // Standard layout for normal view
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">{tier.name}</h3>
                  <div className="flex gap-1">
                    {tier.isPopular && (
                      <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                        Popular
                      </span>
                    )}
                    {isCurrentPlan && (
                      <span className="bg-secondary/10 text-secondary text-xs font-medium px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-baseline mb-1">
                  <PriceDisplay tier={tier} />
                  <span className="text-muted-foreground ml-2">
                    {tier.price !== "$0" ? "/month" : ""}
                  </span>
                </div>
                
                <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-secondary/10 text-secondary mb-4">
                  {tier.hours}/month
                </div>
                
                <p className="text-muted-foreground mb-6">{tier.description}</p>
                
                <div className="mb-6">
                  <div className="text-sm text-muted-foreground space-y-2">
                    {tier.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="text-primary"
                          >
                            <path
                              d="M2.5 6L5 8.5L9.5 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            <form>
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="returnUrl" value={returnUrl} />
              <input type="hidden" name="planId" value={tier.stripePriceId} />
              {isManaged ? (
                <SubmitButton
                  pendingText="..."
                  formAction={setupNewSubscription}
                  // disabled={isCurrentPlan}
                  className={cn(
                    "w-full font-medium transition-colors",
                    isCompact 
                      ? "h-7 rounded-md text-xs" 
                      : "h-10 rounded-full text-sm",
                    isCurrentPlan 
                      ? "bg-muted text-muted-foreground hover:bg-muted" 
                      : tier.buttonColor
                  )}
                >
                  {isCurrentPlan ? "Current Plan" : (tier.name === "Free" ? tier.buttonText : "Upgrade")}
                </SubmitButton>
              ) : (
                <Button
                  className={cn(
                    "w-full font-medium transition-colors",
                    isCompact 
                      ? "h-7 rounded-md text-xs" 
                      : "h-10 rounded-full text-sm",
                    isCurrentPlan 
                      ? "bg-muted text-muted-foreground hover:bg-muted" 
                      : tier.buttonColor
                  )}
                  disabled={isCurrentPlan}
                  onClick={() => onPlanSelect?.(tier.stripePriceId)}
                >
                  {isCurrentPlan ? "Current Plan" : (tier.name === "Free" ? tier.buttonText : "Upgrade")}
                </Button>
              )}
            </form>
          </div>
        );
      })}
    </div>
  );
} 