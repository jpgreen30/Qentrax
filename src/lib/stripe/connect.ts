import { getStripe, siteUrl } from "./client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type ConnectStatus = "not_started" | "pending" | "restricted" | "enabled" | "disabled";

function mapAccountStatus(account: Stripe.Account): {
  status: ConnectStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
} {
  const charges = !!account.charges_enabled;
  const payouts = !!account.payouts_enabled;
  let status: ConnectStatus = "pending";
  if (account.requirements?.disabled_reason) status = "disabled";
  else if (charges && payouts) status = "enabled";
  else if (account.requirements?.currently_due?.length) status = "restricted";
  else status = "pending";
  return { status, charges_enabled: charges, payouts_enabled: payouts };
}

/**
 * Create or resume an Express Connect account for a publisher org.
 * Returns an Account Link URL for onboarding / refresh.
 */
export async function startPublisherConnect(opts: {
  supabase: SupabaseClient;
  org: {
    id: string;
    legal_name: string;
    stripe_connect_account_id?: string | null;
  };
  email?: string | null;
}): Promise<{ url: string; accountId: string }> {
  const stripe = getStripe();
  const base = siteUrl();
  let accountId = opts.org.stripe_connect_account_id ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: opts.email || undefined,
      business_profile: {
        name: opts.org.legal_name,
        product_description: "Lead generation / performance marketing publisher",
      },
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        qentrax_org_id: opts.org.id,
        org_type: "publisher",
      },
    });
    accountId = account.id;

    const mapped = mapAccountStatus(account);
    await opts.supabase
      .from("organizations")
      .update({
        stripe_connect_account_id: accountId,
        stripe_connect_status: mapped.status,
        stripe_charges_enabled: mapped.charges_enabled,
        stripe_payouts_enabled: mapped.payouts_enabled,
        stripe_connect_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.org.id);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/workspace/publisher/earnings?org=${opts.org.id}&connect=refresh`,
    return_url: `${base}/workspace/publisher/earnings?org=${opts.org.id}&connect=return`,
    type: "account_onboarding",
  });

  return { url: link.url, accountId };
}

/** Sync Connect account status from Stripe → organizations row. */
export async function syncConnectAccount(
  supabase: SupabaseClient,
  account: Stripe.Account,
): Promise<void> {
  const orgId = account.metadata?.qentrax_org_id;
  if (!orgId) {
    // Fallback: look up by account id
    const mapped = mapAccountStatus(account);
    await supabase
      .from("organizations")
      .update({
        stripe_connect_status: mapped.status,
        stripe_charges_enabled: mapped.charges_enabled,
        stripe_payouts_enabled: mapped.payouts_enabled,
        stripe_connect_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_connect_account_id", account.id);
    return;
  }

  const mapped = mapAccountStatus(account);
  await supabase
    .from("organizations")
    .update({
      stripe_connect_account_id: account.id,
      stripe_connect_status: mapped.status,
      stripe_charges_enabled: mapped.charges_enabled,
      stripe_payouts_enabled: mapped.payouts_enabled,
      stripe_connect_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
}

/** Create a Transfer to a connected publisher account for a payout item total. */
export async function transferToPublisher(opts: {
  connectAccountId: string;
  amountCents: number;
  transferGroup?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Transfer> {
  const stripe = getStripe();
  return stripe.transfers.create({
    amount: opts.amountCents,
    currency: "usd",
    destination: opts.connectAccountId,
    transfer_group: opts.transferGroup,
    metadata: opts.metadata,
  });
}
