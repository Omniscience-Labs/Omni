'use client';

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/home";
import { isLocalMode } from "@/lib/config";
import { getSubscription, createCheckoutSession, SubscriptionStatus, CreateCheckoutSessionResponse } from "@/lib/api";
import { toast } from "sonner";

export const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PRO: 'base',
  ENTERPRISE: 'extra',
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

// Define a helper type for Button variants
type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "link" | null;

interface PlanComparisonProps {
  accountId?: string | null;
  returnUrl?: string;
  isManaged?: boolean;
  onPlanSelect?: (planId: string) => void;
  className?: string;
  isCompact?: boolean; // When true, uses vertical stacked layout for modals
  onSubscriptionUpdate?: () => void;
}

export function PlanComparison({
  accountId,
  returnUrl = typeof window !== 'undefined' ? window.location.href : '',
  isManaged = true,
  onPlanSelect,
  className = "",
  isCompact = false,
  onSubscriptionUpdate
}: PlanComparisonProps) {
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [isFetchingPlan, setIsFetchingPlan] = useState(true);

  const fetchCurrentPlan = async () => {
    setIsFetchingPlan(true);
    try {
      const subscriptionData = await getSubscription();
      console.log("Fetched Subscription Status:", subscriptionData);
      setCurrentSubscription(subscriptionData);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Set a default status if fetch fails, e.g., assume free tier
      // Assuming 8 minutes for free tier if not directly available in siteConfig type
      const freeTierMinutes = siteConfig.cloudPricingItems.find(p => p.name === 'Free')?.hours === '8 hours' ? 8 : 0; 
      setCurrentSubscription({
        status: 'no_subscription',
        plan_name: 'free',
        price_id: siteConfig.cloudPricingItems.find(p => p.name === 'Free')?.stripePriceId || '',
        cancel_at_period_end: false,
        has_schedule: false,
        minutes_limit: freeTierMinutes // Use derived minutes
      });
    } finally {
      setIsFetchingPlan(false);
    }
  };

  useEffect(() => {
    fetchCurrentPlan();
  }, []);

  if (isLocalMode()) {
    return (
      <div className={cn("p-4 bg-muted/30 border border-border rounded-lg text-center", className)}>
        <p className="text-sm text-muted-foreground">
          Running in local development mode - billing features are disabled
        </p>
      </div>
    );
  }

  const handleSubscribe = async (planStripePriceId: string) => {
    if (isLoading[planStripePriceId] || isFetchingPlan) {
      return;
    }

    try {
      setIsLoading(prev => ({ ...prev, [planStripePriceId]: true }));
      // Explicitly type the response for clarity
      const response: CreateCheckoutSessionResponse = await createCheckoutSession({
        price_id: planStripePriceId,
        success_url: returnUrl,
        cancel_url: returnUrl
      });
      
      console.log('Subscription action response:', response);

      // Handle different statuses
      switch (response.status) {
        case 'checkout_created':
          // Redirect to Stripe Checkout
          if (response.url) {
            window.location.href = response.url;
          } else {
            console.error("Error: Received status 'checkout_created' but no checkout URL.");
            toast.error('Failed to initiate subscription. Please try again.');
          }
          break;
        case 'upgraded':
          // Handle immediate upgrade
          toast.success('Subscription upgraded successfully!');
          // Refresh data after success
          if (onSubscriptionUpdate) onSubscriptionUpdate();
          fetchCurrentPlan(); 
          break;
        case 'downgrade_scheduled':
          // Handle scheduled downgrade
          const effectiveDate = response.effective_date 
            ? new Date(response.effective_date).toLocaleDateString() 
            : 'the end of your billing period';
          
          toast.success(
            <div>
              <p>Subscription downgrade scheduled!</p>
              <p className="text-sm mt-1">
                Your plan will change on {effectiveDate}.
              </p>
            </div>
          );
          // Refresh data after success
          if (onSubscriptionUpdate) onSubscriptionUpdate();
          fetchCurrentPlan(); 
          break;
        case 'no_change':
          toast.info(response.message || 'You are already on this plan.');
          break;
        default:
          console.warn('Received unexpected status from createCheckoutSession:', response.status);
          toast.error('An unexpected error occurred. Please try again.');
      }

    } catch (error: any) {
      console.error('Error processing subscription:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to process subscription. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsLoading(prev => ({ ...prev, [planStripePriceId]: false }));
    }
  };

  // UI Rendering Logic
  const currentPlanId = currentSubscription?.price_id;
  const isScheduled = currentSubscription?.has_schedule;
  const scheduledPlanId = currentSubscription?.scheduled_price_id;

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
        const tierPriceId = tier.stripePriceId;
        const isCurrentActivePlan = !isScheduled && currentPlanId === tierPriceId;
        const isScheduledTargetPlan = isScheduled && scheduledPlanId === tierPriceId;
        const isPlanLoading = isLoading[tierPriceId];
        const isFetching = isFetchingPlan;
        
        let buttonText = "Select Plan";
        let buttonDisabled = isFetching || isPlanLoading;
        let buttonVariant: ButtonVariant = null;
        let ringClass = "";
        let statusBadge = null;

        if (isCurrentActivePlan) {
            buttonText = "Current Plan";
            buttonDisabled = true;
            buttonVariant = "secondary";
            ringClass = isCompact ? "ring-1 ring-primary" : "ring-2 ring-primary";
            statusBadge = (
                <span className="bg-secondary/10 text-secondary text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                  Current
                </span>
            );
        } else if (isScheduledTargetPlan) {
            buttonText = "Scheduled";
            buttonDisabled = true; // Can't change again until schedule completes/is cancelled
            buttonVariant = "outline";
            ringClass = isCompact ? "ring-1 ring-yellow-500" : "ring-2 ring-yellow-500";
             statusBadge = (
                 <span className="bg-yellow-500/10 text-yellow-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                   Scheduled
                 </span>
             );
        } else if (isScheduled && currentPlanId === tierPriceId) {
             // This is the plan they are currently on, but a downgrade is scheduled
            buttonText = "Change Scheduled"; // Or allow cancelling schedule?
            buttonVariant = "secondary";
             ringClass = isCompact ? "ring-1 ring-primary" : "ring-2 ring-primary";
              statusBadge = (
                  <span className="bg-yellow-500/10 text-yellow-600 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                    Downgrade Pending
                  </span>
              );
        } else {
            // Determine if it's an upgrade or downgrade relative to the *active* plan
            const currentTier = siteConfig.cloudPricingItems.find(p => p.stripePriceId === currentPlanId);
            // Handle case where currentSubscription might be null initially
            const currentPriceString = currentSubscription ? (currentTier?.price || '$0') : '$0';
            const currentAmount = currentPriceString === '$0' ? 0 : parseFloat(currentPriceString.replace(/[^\d.]/g, '') || '0') * 100;
            const targetAmount = tier.price === '$0' ? 0 : parseFloat(tier.price.replace(/[^\d.]/g, '') || '0') * 100;
            
            // Prevent downgrade from free if already free (or if current plan is unknown)
            if (currentAmount === 0 && targetAmount === 0 && currentSubscription?.status !== 'no_subscription') {
                buttonText = "Select Plan";
                buttonDisabled = true; // Disable selecting Free if already Free (or unknown)
                buttonVariant = "secondary";
            } else {
                 buttonText = targetAmount > currentAmount ? "Upgrade" : "Downgrade";
                 buttonVariant = tier.buttonColor as ButtonVariant;
            }
        }

        if (isPlanLoading) buttonText = "Loading...";
        if (isFetching) buttonText = "Checking...";

        return (
          <div
            key={tier.name}
            className={cn(
              "rounded-lg bg-background border border-border relative", 
              isCompact ? "p-3 text-sm" : "p-5",
              ringClass
            )}
          >
            {isCompact ? (
              // Compact layout
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
                      {statusBadge}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{tier.description}</div>
                  </div>
                   {/* Compact Price Display */}
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
                 {/* Compact Features */}
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
              // Standard layout
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium">{tier.name}</h3>
                  <div className="flex gap-1">
                     {tier.isPopular && (
                       <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                         Popular
                       </span>
                     )}
                     {statusBadge}
                  </div>
                </div>
                  {/* Standard Price Display */}
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
                  {/* Standard Features */}
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
             <Button
               onClick={() => handleSubscribe(tierPriceId)}
               disabled={buttonDisabled}
               variant={buttonVariant || "default"} // Provide default variant
               className={cn(
                 "w-full font-medium transition-colors mt-auto", // Added mt-auto for consistency
                 isCompact 
                   ? "h-7 rounded-md text-xs" 
                   : "h-10 rounded-full text-sm"
               )}
             >
               {buttonText}
             </Button>
          </div>
        );
      })}
    </div>
  );
} 