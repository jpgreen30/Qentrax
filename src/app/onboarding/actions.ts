"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { ownerRoleForType } from "@/lib/permissions";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const type = String(formData.get("type") ?? "");
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const dbaName = String(formData.get("dba_name") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const taxCountry = String(formData.get("tax_country") ?? "US").trim().slice(0, 2);

  if (!legalName || (type !== "advertiser" && type !== "publisher")) {
    redirect("/onboarding?error=invalid");
  }

  const supabase = await createClient();
  const roleCode = ownerRoleForType(type);
  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).single();
  if (!role) redirect("/onboarding?error=role");

  const { data: org, error } = await supabase
    .from("organizations")
    .insert({
      type,
      legal_name: legalName,
      dba_name: dbaName || null,
      website: website || null,
      tax_country: taxCountry || "US",
      onboarding_status: "profile_submitted",
    })
    .select("id")
    .single();

  if (error || !org) redirect("/onboarding?error=create");

  await supabase.from("organization_members").insert({
    organization_id: org.id,
    user_id: auth.userId,
    role_id: role.id,
    status: "active",
    joined_at: new Date().toISOString(),
  });

  await supabase.from("organization_profiles").insert({
    organization_id: org.id,
    kyb_status: "not_started",
  });

  await supabase.from("financial_accounts").insert({
    organization_id: org.id,
    type: type === "advertiser" ? "advertiser_balance" : "publisher_payable",
    currency: "USD",
  });

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: org.id,
    action: "organization.created",
    resource_type: "organization",
    resource_id: org.id,
    request_id: requestId(),
  });

  redirect(`/workspace?org=${org.id}`);
}
