"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";

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

export async function submitTestOpportunity(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  const sourceId = String(formData.get("source_id") ?? "");
  if (!organizationId || !sourceId) redirect(`/workspace/publisher?org=${organizationId}`);

  const supabase = await createClient();
  const externalId = `test-${Date.now()}`;

  // Create opportunity as ready (with consent) then run minimal auction
  const publicTxn = `QL-${Math.floor(10000 + Math.random() * 90000)}`;
  const { data: opp, error } = await supabase
    .from("opportunities")
    .insert({
      public_transaction_id: publicTxn,
      publisher_org_id: organizationId,
      source_id: sourceId,
      external_submission_id: externalId,
      status: "ready",
      schema_version: "v1",
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
  redirect(`/workspace/publisher?org=${organizationId}&opp=${status}&txn=${opp.public_transaction_id}`);
}
