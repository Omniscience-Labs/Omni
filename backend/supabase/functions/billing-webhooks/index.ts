import {serve} from "https://deno.land/std@0.177.0/http/server.ts";
import {billingWebhooksWrapper, stripeWebhookHandler} from "./basejump-stripe-utils/mod.ts";

import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripeClient = new Stripe(Deno.env.get("STRIPE_API_KEY") as string, {
    // This is needed to use the Fetch API rather than relying on the Node http
    // package.
    apiVersion: "2022-11-15",
    httpClient: Stripe.createFetchHttpClient(),
});

const stripeResponse = stripeWebhookHandler({
    stripeClient,
    stripeWebhookSigningSecret: Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") as string,
});

const webhookEndpoint = billingWebhooksWrapper(stripeResponse);

serve(async (req) => {
    try {
        const response = await webhookEndpoint(req);
        return response;
    } catch (error) {
        console.error("Webhook error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }
});
