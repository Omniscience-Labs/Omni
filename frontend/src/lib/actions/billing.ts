"use server";

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import handleEdgeFunctionError from "../supabase/handle-edge-error";

export async function setupNewSubscription(prevState: any, formData: FormData) {
    const accountId = formData.get("accountId") as string;
    const returnUrl = formData.get("returnUrl") as string;
    const planId = formData.get("planId") as string;
    const supabaseClient = await createClient();

    const { data, error } = await supabaseClient.functions.invoke('billing-functions', {
        body: {
            action: "get_new_subscription_url",
            args: {
                account_id: accountId,
                success_url: returnUrl,
                cancel_url: returnUrl,
                plan_id: planId
            }
        }
    });

    if (error) {
        return await handleEdgeFunctionError(error);
    }

    redirect(data.url);
};

export async function manageSubscription(prevState: any, formData: FormData) {

    const accountId = formData.get("accountId") as string;
    const returnUrl = formData.get("returnUrl") as string;
    const supabaseClient = await createClient();

    const { data, error } = await supabaseClient.functions.invoke('billing-functions', {
        body: {
            action: "get_billing_portal_url",
            args: {
                account_id: accountId,
                return_url: returnUrl
            }
        }
    });

    console.log(data);
    
    if (error) {
        console.error(error);
        return await handleEdgeFunctionError(error);
    }

    redirect(data.url);
};

export async function getPlans(accountId?: string) {
    const supabaseClient = await createClient();

    // console.log("Getting plans for account:", accountId);

    const { data, error } = await supabaseClient.functions.invoke('billing-functions', {
        body: {
            action: "get_plans",
            args: {
                account_id: accountId
            }
        }
    });

    // console.log("Plans data:", data);

    if (error) {
        console.error("Error fetching plans:", error);
        return await handleEdgeFunctionError(error);
    }

    return data;
}

export async function getAccountSubscription(accountId: string) {
    console.log("Getting subscription for account:", accountId);
    const supabaseClient = await createClient();
    
    // Get account subscription data
    const { data: subscriptionData, error: subscriptionError } = await supabaseClient
        .schema('basejump')
        .from('billing_subscriptions')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'active')
        .limit(1)
        .order('created', { ascending: false })
        .single();
    
    if (subscriptionError) {
        console.error("Error fetching subscription data:", subscriptionError);
        return { message: subscriptionError.message };
    }

    console.log("Subscription data:", subscriptionData);

    // Get agent runs for this account
    const { data: threads, error: threadsError } = await supabaseClient
        .from('threads')
        .select('thread_id')
        .eq('account_id', accountId);
    
    if (threadsError) {
        console.error("Error fetching threads:", threadsError);
        return { message: threadsError.message };
    }
    
    const threadIds = threads?.map(t => t.thread_id) || [];
    console.log(`Found ${threadIds.length} threads for account`);
    
    // Get current month usage
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isoStartOfMonth = startOfMonth.toISOString();
    console.log("Calculating usage since:", isoStartOfMonth);
    
    let totalAgentTime = 0;
    let usageDisplay = "No usage this month";
    
    if (threadIds.length > 0) {
        const { data: agentRuns, error: agentRunsError } = await supabaseClient
            .from('agent_runs')
            .select('started_at, completed_at')
            .in('thread_id', threadIds)
            .gte('started_at', isoStartOfMonth);
        
        if (agentRunsError) {
            console.error("Error fetching agent runs:", agentRunsError);
            return { message: agentRunsError.message };
        }
        
        console.log(`Found ${agentRuns?.length || 0} agent runs since start of month`);
        
        if (agentRuns && agentRuns.length > 0) {
            const nowTimestamp = now.getTime();
            
            totalAgentTime = agentRuns.reduce((total, run) => {
                const startTime = new Date(run.started_at).getTime();
                const endTime = run.completed_at 
                    ? new Date(run.completed_at).getTime()
                    : nowTimestamp;
                
                return total + (endTime - startTime) / 1000; // In seconds
            }, 0);
            
            // Convert to minutes
            const totalMinutes = Math.round(totalAgentTime / 60);
            usageDisplay = `${totalMinutes} minutes`;
            console.log(`Total usage: ${totalAgentTime} seconds (${usageDisplay})`);
        }
    }

    return {
        subscription: subscriptionData,
        usage: {
            totalAgentTime,
            display: usageDisplay
        }
    };
}
