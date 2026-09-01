"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/workspace-data";
import { parseCampaignInput, type OfferPricing } from "@/lib/campaigns/campaign-input";

function back(orgId: string, offerId: string, errors: string[]): never {
  const q = new URLSearchParams({ org: orgId, offer: offerId, error: errors.join(" ") });
  redirect(`/workspace/advertiser/campaigns/new?${q}`);
}

/**
 * Creates a campaign against a published offer version.
 *
 * The campaign is created in `draft`; activation is a separate, explicit step
 * after the advertiser has reviewed the full configuration, so a
 * half-configured campaign never starts buying.
 */
export async function createCampaign(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const offerId = String(formData.get("offer_id") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  if (!offerId) back(org.id, "", ["An offer is required."]);

  // Read the live version's terms; RLS means an unpublished offer is invisible.
  const { data: offer } = await supabase
    .from("offers")
    .select(
      `id, name, current_version_id, vertical_id,
       offer_versions!offers_current_version_id_fkey (
         id, pricing_mode, price_cents, floor_cents, ceiling_cents, geo_rules_json
       )`,
    )
    .eq("id", offerId)
    .maybeSingle();

  const version = offer?.offer_versions as unknown as {
    id: string;
    pricing_mode: string;
    price_cents: number | null;
    floor_cents: number | null;
    ceiling_cents: number | null;
    geo_rules_json: { states?: { include?: string[] } };
  } | null;

  if (!offer || !version) {
    back(org.id, offerId, ["That offer is not available."]);
  }

  const pricing: OfferPricing = {
    pricing_mode: version.pricing_mode,
    price_cents: version.price_cents,
    floor_cents: version.floor_cents,
    ceiling_cents: version.ceiling_cents,
    geo_states_include: version.geo_rules_json?.states?.include,
  };

  const parsed = parseCampaignInput(formData, pricing);
  if (!parsed.ok) back(org.id, offerId, parsed.errors);

  const v = parsed.value;
  const endpointId = String(formData.get("delivery_endpoint_id") ?? "") || null;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      advertiser_org_id: org.id,
      name: v.name,
      status: "draft",
      vertical_id: offer.vertical_id,
      offer_id: offer.id,
      // Pin the version bought against, so a later reprice cannot change the
      // terms this campaign agreed to.
      offer_version_id: version.id,
      timezone: v.timezone,
      base_bid_cents: v.base_bid_cents,
      daily_cap: v.daily_cap,
      hourly_cap: v.hourly_cap,
      monthly_cap: v.monthly_cap,
      daily_budget_cents: v.daily_budget_cents,
      monthly_budget_cents: v.monthly_budget_cents,
      pacing: v.pacing,
      targeting_json: { states: v.states, zips: v.zips },
    })
    .select("id")
    .maybeSingle();

  if (error || !campaign) {
    back(org.id, offerId, [error?.message ?? "Could not create the campaign."]);
  }

  if (v.dayparts.length) {
    const { error: dpError } = await supabase.from("campaign_dayparts").insert(
      v.dayparts.map((w) => ({ campaign_id: campaign.id, ...w })),
    );
    if (dpError) back(org.id, offerId, [dpError.message]);
  }

  if (endpointId) {
    // Resolve the chosen connector into the per-campaign endpoint row the
    // delivery pipeline reads. It must start active, because post/delivery
    // only looks at active campaign endpoints.
    const { data: connector } = await supabase
      .from("connectors")
      .select("id, connector_type, endpoint_url, timeout_ms")
      .eq("id", endpointId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (connector) {
      await supabase.from("campaign_endpoints").insert({
        campaign_id: campaign.id,
        type: connector.connector_type,
        endpoint_url: connector.endpoint_url,
        timeout_ms: connector.timeout_ms ?? 10000,
        status: "active",
      });
    }
  }

  const { emitNotification } = await import("@/lib/notifications");
  await emitNotification(supabase, {
    organizationId: org.id,
    type: "campaign.created",
    title: "Campaign drafted",
    body: `${v.name} is ready for review. It will not buy until you activate it.`,
    href: `/workspace/advertiser/campaigns/${campaign.id}/review?org=${org.id}`,
    dedupeKey: `campaign-created:${campaign.id}`,
  });

  revalidatePath("/workspace/advertiser/campaigns");
  redirect(`/workspace/advertiser/campaigns/${campaign.id}/review?org=${org.id}`);
}

/** Activation is deliberately separate from creation. */
export async function activateCampaign(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("advertiser_org_id", org.id);

  if (error) {
    const q = new URLSearchParams({ org: org.id, error: error.message });
    redirect(`/workspace/advertiser/campaigns/${campaignId}/review?${q}`);
  }

  const { emitNotification } = await import("@/lib/notifications");
  await emitNotification(supabase, {
    organizationId: org.id,
    type: "campaign.activated",
    title: "Campaign activated",
    body: "This campaign is now eligible to buy against its offer.",
    href: `/workspace/advertiser/campaigns/${campaignId}/review?org=${org.id}`,
    dedupeKey: `campaign-activated:${campaignId}`,
  });

  revalidatePath("/workspace/advertiser/campaigns");
  redirect(`/workspace/advertiser/campaigns?org=${org.id}`);
}

export async function setCampaignStatus(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  if (!["active", "paused", "archived"].includes(status)) {
    redirect(`/workspace/advertiser/campaigns?org=${org.id}`);
  }

  await supabase
    .from("campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("advertiser_org_id", org.id);

  const { emitNotification } = await import("@/lib/notifications");
  await emitNotification(supabase, {
    organizationId: org.id,
    type: `campaign.${status}`,
    severity: status === "paused" || status === "archived" ? "warning" : "info",
    title: `Campaign ${status}`,
    body: `Buying status is now ${status}.`,
    href: `/workspace/advertiser/campaigns?org=${org.id}`,
    dedupeKey: `campaign-status:${campaignId}:${status}`,
  });

  revalidatePath("/workspace/advertiser/campaigns");
  redirect(`/workspace/advertiser/campaigns?org=${org.id}`);
}
