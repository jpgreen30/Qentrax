"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import {
  flattenIntakePayload,
  loadFieldSchemas,
  validateAgainstSchemas,
} from "@/lib/validate-vertical-fields";

export async function createSource(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const channel = String(formData.get("channel") ?? "web").trim();
  const domain = String(formData.get("domain") ?? "").trim();

  if (!organizationId || !name) redirect(`/workspace/publisher?org=${organizationId}`);

  const supabase = await createClient();
  await supabase.from("publisher_sources").insert({
    publisher_org_id: organizationId,
    name,
    channel: channel || "web",
    domain: domain || null,
    status: "draft",
  });

  redirect(`/workspace/publisher?org=${organizationId}`);
}

/** Demo lead uses auto_insurance standard fields (valid schema). */
const DEMO_VERTICAL = "auto_insurance";
const DEMO_ATTRIBUTES = {
  zip: "90210",
  state: "CA",
  currently_insured: true,
  vehicle_count: 1,
  driver_age_band: "35-44",
  homeowner: true,
  tcpa_consent: true,
  source: "qentrax-demo",
  first_name: "Test",
  last_name: "Lead",
  email: "test.lead@example.com",
  phone: "3105550100",
  address1: "1 Demo Way",
  city: "Beverly Hills",
  tcpa_text:
    "I agree to be contacted by phone, SMS, and email regarding auto insurance offers.",
};

export async function submitTestOpportunity(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const sourceId = String(formData.get("source_id") ?? "");
  if (!organizationId || !sourceId) redirect(`/workspace/publisher?org=${organizationId}`);

  const supabase = await createClient();

  const { data: vertical } = await supabase
    .from("verticals")
    .select("id")
    .eq("code", DEMO_VERTICAL)
    .maybeSingle();

  const schemas = await loadFieldSchemas(supabase, DEMO_VERTICAL, null);
  const bag = flattenIntakePayload({ attributes: DEMO_ATTRIBUTES });
  const validated = validateAgainstSchemas(DEMO_VERTICAL, schemas, bag, { requirePost: true });

  if (!validated.ok || !validated.hasConsent) {
    redirect(`/workspace/publisher?org=${organizationId}&opp_error=schema`);
  }

  const externalId = `test-${Date.now()}`;
  const publicTxn = `QL-${Math.floor(10000 + Math.random() * 90000)}`;
  const { data: opp, error } = await supabase
    .from("opportunities")
    .insert({
      public_transaction_id: publicTxn,
      publisher_org_id: organizationId,
      source_id: sourceId,
      vertical_id: vertical?.id ?? null,
      external_submission_id: externalId,
      status: "ready",
      schema_version: "v1",
      ping_attributes: validated.pingAttributes,
    })
    .select("id, public_transaction_id")
    .single();

  if (error || !opp) {
    redirect(`/workspace/publisher?org=${organizationId}&opp_error=1`);
  }

  const { data: result, error: auctionError } = await supabase.rpc("run_minimal_auction", {
    p_opportunity_id: opp.id,
  });

  if (auctionError) {
    redirect(`/workspace/publisher?org=${organizationId}&opp_error=1`);
  }

  const status =
    result && typeof result === "object" && "status" in result
      ? String((result as { status: string }).status)
      : "unknown";
  redirect(
    `/workspace/publisher?org=${organizationId}&opp=${status}&txn=${opp.public_transaction_id}`,
  );
}
