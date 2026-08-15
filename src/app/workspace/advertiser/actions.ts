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
