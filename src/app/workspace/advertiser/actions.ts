"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

export async function createCampaign(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const baseBid = Number(formData.get("base_bid_cents") ?? 0);
  const dailyBudget = Number(formData.get("daily_budget_cents") ?? 0);
  const verticalCode = String(formData.get("vertical_code") ?? "").trim();
  const statesRaw = String(formData.get("states") ?? "").trim();

  if (!organizationId || !name) redirect(`/workspace/advertiser?org=${organizationId}`);

  const supabase = await createClient();

  let verticalId: string | null = null;
  if (verticalCode) {
    const { data: v } = await supabase
      .from("verticals")
      .select("id")
      .eq("code", verticalCode)
      .maybeSingle();
    verticalId = v?.id ?? null;
  }

  const states = statesRaw
    ? statesRaw
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : [];

  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      advertiser_org_id: organizationId,
      name,
      base_bid_cents: Number.isFinite(baseBid) ? baseBid : 0,
      daily_budget_cents: Number.isFinite(dailyBudget) ? dailyBudget : null,
      vertical_id: verticalId,
      targeting_json: states.length ? { states } : {},
      status: "draft",
    })
    .select("id")
    .single();

  if (campaign) {
    await supabase.from("campaign_versions").insert({
      campaign_id: campaign.id,
      version: 1,
      created_by: auth.userId,
    });

    const endpointUrl = String(formData.get("endpoint_url") ?? "").trim();
    if (endpointUrl) {
      await supabase.from("campaign_endpoints").insert({
        campaign_id: campaign.id,
        type: "http_post",
        endpoint_url: endpointUrl,
        status: "active",
        timeout_ms: 8000,
      });
    }
  }

  redirect(`/workspace/advertiser/campaigns?org=${organizationId}`);
}

export async function postTestFunding(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const amountCents = Number(formData.get("amount_cents") ?? 50000);
  if (!organizationId) redirect("/workspace");

  const supabase = await createClient();
  const idempotencyKey = `test-fund-${organizationId}-${Date.now()}`;
  const { error } = await supabase.rpc("record_test_funding", {
    p_organization_id: organizationId,
    p_amount_cents: Number.isFinite(amountCents) ? amountCents : 50000,
    p_idempotency_key: idempotencyKey,
    p_description: "Test-mode funding (Stripe webhook simulation)",
  });

  redirect(
    `/workspace/advertiser?org=${organizationId}${error ? "&fund_error=1" : "&funded=1"}`,
  );
}

export async function activateCampaign(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!organizationId || !campaignId) redirect(`/workspace/advertiser?org=${organizationId}`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_campaign_if_ready", {
    p_campaign_id: campaignId,
  });

  const reason =
    error
      ? "error"
      : data && typeof data === "object" && "reason" in data
        ? String((data as { reason?: string }).reason ?? "")
        : "";
  redirect(
    `/workspace/advertiser?org=${organizationId}${reason ? `&activate=${reason}` : "&activated=1"}`,
  );
}

export async function recordDisposition(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const transactionId = String(formData.get("transaction_id") ?? "");
  const eventType = String(formData.get("event_type") ?? "").trim();
  const revenueCentsRaw = String(formData.get("revenue_cents") ?? "").trim();
  const product = String(formData.get("product") ?? "").trim();
  const externalEventId =
    String(formData.get("external_event_id") ?? "").trim() ||
    `ui-${transactionId}-${eventType}-${Date.now()}`;

  if (!organizationId || !transactionId || !eventType) {
    redirect(`/workspace/advertiser/opportunities?org=${organizationId}&disp=missing`);
  }

  const allowed = ["contacted", "qualified", "sale", "rejected", "returned", "refunded"];
  if (!allowed.includes(eventType)) {
    redirect(`/workspace/advertiser/opportunities?org=${organizationId}&disp=invalid`);
  }

  const revenueCents =
    revenueCentsRaw === ""
      ? null
      : Number.isFinite(Number(revenueCentsRaw))
        ? Number(revenueCentsRaw)
        : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_conversion_event", {
    p_organization_id: organizationId,
    p_transaction_id: transactionId,
    p_event_type: eventType,
    p_external_event_id: externalEventId,
    p_revenue_cents: revenueCents,
    p_product: product || null,
    p_payload: { source: "workspace_ui" },
  });

  redirect(
    `/workspace/advertiser/opportunities?org=${organizationId}${error ? "&disp=error" : "&disp=ok"}`,
  );
}
