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

  if (!organizationId || !name) redirect(`/workspace/advertiser?org=${organizationId}`);

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      advertiser_org_id: organizationId,
      name,
      base_bid_cents: Number.isFinite(baseBid) ? baseBid : 0,
      daily_budget_cents: Number.isFinite(dailyBudget) ? dailyBudget : null,
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
  }

  redirect(`/workspace/advertiser?org=${organizationId}`);
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
    error ? "error" : data && typeof data === "object" && "reason" in data ? String((data as { reason?: string }).reason ?? "") : "";
  redirect(
    `/workspace/advertiser?org=${organizationId}${reason ? `&activate=${reason}` : "&activated=1"}`,
  );
}
