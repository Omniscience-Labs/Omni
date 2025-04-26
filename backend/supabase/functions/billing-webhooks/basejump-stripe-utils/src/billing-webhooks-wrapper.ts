import createSupabaseServiceClient from "../lib/create-supabase-service-client.ts";
import {BASEJUMP_BILLING_DATA_UPSERT, upsertCustomerSubscription,} from "../lib/upsert-data.ts";

export type BILLING_WEBHOOKS_WRAPPER_HANDLER = (
    req: Request
) => Promise<BASEJUMP_BILLING_DATA_UPSERT | undefined>;

export function billingWebhooksWrapper(
    handler: BILLING_WEBHOOKS_WRAPPER_HANDLER
): (req: Request) => Promise<Response> {
    return async function (req: Request) {
        try {
            console.log("Starting webhook processing...");
            const data = await handler(req);
            console.log("Handler returned data:", data);
            
            const accountId =
                data?.customer?.account_id || data?.subscription?.account_id;

            if (data && accountId) {
                console.log("Upserting data for account:", accountId);
                const supabaseClient = createSupabaseServiceClient();
                // if we got data back from the webhook, save it
                await upsertCustomerSubscription(supabaseClient, accountId, data);
                console.log("Successfully upserted data");
            } else {
                console.log("No data to upsert or missing accountId");
            }

            return new Response(JSON.stringify({message: "Webhook processed"}), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            });
        } catch (e) {
            console.error("Webhook processing error:", {
                error: e instanceof Error ? {
                    name: e.name,
                    message: e.message,
                    stack: e.stack,
                } : e,
                requestInfo: {
                    method: req.method,
                    url: req.url,
                    headers: Object.fromEntries(req.headers.entries()),
                },
                timestamp: new Date().toISOString(),
            });

            return new Response(
                JSON.stringify({
                    error: "Error processing webhook",
                    details: e instanceof Error ? e.message : "Unknown error",
                }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
        }
    };
}
