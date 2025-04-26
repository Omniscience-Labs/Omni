import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui/submit-button";
import { manageSubscription, getAccountSubscription } from "@/lib/actions/billing";
import { PlanComparison, SUBSCRIPTION_PLANS } from "@/components/billing/plan-comparison";
import { isLocalMode } from "@/lib/config";

type Props = {
    accountId: string;
    returnUrl: string;
}

export default async function AccountBillingStatus({ accountId, returnUrl }: Props) {

    // In local development mode, show a simplified component
    if (isLocalMode()) {
        return (
            <div className="rounded-xl border shadow-sm bg-card p-6">
                <h2 className="text-xl font-semibold mb-4">Billing Status</h2>
                <div className="p-4 mb-4 bg-muted/30 border border-border rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                        Running in local development mode - billing features are disabled
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Agent usage limits are not enforced in this environment
                    </p>
                </div>
            </div>
        );
    }

    const result = await getAccountSubscription(accountId);
    
    // Check if we got an error response or if result is undefined
    if (!result || 'message' in result) {
        return (
            <div className="rounded-xl border shadow-sm bg-card p-6">
                <h2 className="text-xl font-semibold mb-4">Billing Status</h2>
                <div className="p-4 mb-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
                    <p className="text-sm text-destructive">
                        Error loading billing status: {result?.message || 'Unknown error'}
                    </p>
                </div>
            </div>
        );
    }

    const { subscription: subscriptionData, usage } = result;
    
    const isPlan = (planId?: string) => {
        return subscriptionData?.price_id === planId;
    };
    
    const planName = isPlan(SUBSCRIPTION_PLANS.FREE) 
        ? "Free" 
        : isPlan(SUBSCRIPTION_PLANS.PRO)
            ? "Pro"
            : isPlan(SUBSCRIPTION_PLANS.ENTERPRISE)
                ? "Enterprise"
                : "Unknown";

    return (
        <div className="rounded-xl border shadow-sm bg-card p-6">
            <h2 className="text-xl font-semibold mb-4">Billing Status</h2>
            
            {subscriptionData ? (
                <>
                    <div className="mb-6">
                        <div className="rounded-lg border bg-background p-4 grid grid-cols-1 md:grid-cols-2 gap-4">                            
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-foreground/90">Agent Usage This Month</span>
                                <span className="text-sm font-medium text-card-title">{usage.display}</span>
                            </div>
                        </div>
                    </div>

                    {/* Plans Comparison */}
                    <PlanComparison
                        accountId={accountId}
                        returnUrl={returnUrl}
                        className="mb-6"
                    />

                    {/* Manage Subscription Button */}
                    <form>
                        <input type="hidden" name="accountId" value={accountId} />
                        <input type="hidden" name="returnUrl" value={returnUrl} />
                        <SubmitButton
                            pendingText="Loading..."
                            formAction={manageSubscription}
                            className="w-full bg-primary text-white hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
                        >
                            Manage Subscription
                        </SubmitButton>
                    </form>
                </>
            ) : (
                <>
                    <div className="mb-6">
                        <div className="rounded-lg border bg-background p-4 gap-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-foreground/90">Current Plan</span>
                                <span className="text-sm font-medium text-card-title">Free</span>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-foreground/90">Agent Usage This Month</span>
                                <span className="text-sm font-medium text-card-title">{usage.display}</span>
                            </div>
                        </div>
                    </div>

                    {/* Plans Comparison */}
                    <PlanComparison
                        accountId={accountId}
                        returnUrl={returnUrl}
                        className="mb-6"
                    />

                    {/* Manage Subscription Button */}
                    <form>
                        <input type="hidden" name="accountId" value={accountId} />
                        <input type="hidden" name="returnUrl" value={returnUrl} />
                        <SubmitButton
                            pendingText="Loading..."
                            formAction={manageSubscription}
                            className="w-full bg-primary text-white hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
                        >
                            Manage Subscription
                        </SubmitButton>
                    </form>
                </>
            )}
        </div>
    )
}