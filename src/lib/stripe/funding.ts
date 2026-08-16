import { getStripe, siteUrl } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensure the advertiser org has a Stripe Customer; create one if needed.
 */
export async function ensureStripeCustomer(
  supabase: SupabaseClient,
  org: { id: string; legal_name: string; stripe_customer_id?: string | null },
  email?: string | null,
): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.legal_name,
    email: email || undefined,
    metadata: {
      qentrax_org_id: org.id,
      org_type: "advertiser",
    },
  });

  await supabase
    .from("organizations")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.id);

  return customer.id;
}

/**
 * Create a Stripe Checkout Session for advertiser media funding.
 * On success, webhook credits the internal ledger via record_stripe_funding.
 */
export async function createFundingCheckoutSession(opts: {
  organizationId: string;
  customerId: string;
  amountCents: number;
  orgName: string;
}): Promise<{ url: string; sessionId: string }> {
  if (opts.amountCents < 50000) {
    throw new Error("Minimum funding is $500 (50000 cents)");
  }

  const stripe = getStripe();
  const base = siteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: opts.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: opts.amountCents,
          product_data: {
            name: "Qentrax media funding",
            description: `Campaign balance top-up for ${opts.orgName}`,
          },
        },
      },
    ],
    success_url: `${base}/workspace/advertiser/billing?org=${opts.organizationId}&funded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/workspace/advertiser/billing?org=${opts.organizationId}&cancelled=1`,
    client_reference_id: opts.organizationId,
    metadata: {
      qentrax_org_id: opts.organizationId,
      purpose: "advertiser_funding",
      amount_cents: String(opts.amountCents),
    },
    payment_intent_data: {
      metadata: {
        qentrax_org_id: opts.organizationId,
        purpose: "advertiser_funding",
      },
    },
  });

  if (!session.url) throw new Error("Stripe Checkout Session missing URL");
  return { url: session.url, sessionId: session.id };
}
