"use server";

import { redirect } from "next/navigation";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export async function approveOrganization(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) redirect("/workspace/admin");

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace/admin");

  await supabase
    .from("organizations")
    .update({
      onboarding_status: "approved",
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  await supabase
    .from("organization_profiles")
    .update({
      kyb_status: "approved",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.approved",
    resource_type: "organization",
    resource_id: organizationId,
    reason: "admin_queue",
    request_id: requestId(),
  });

  redirect("/workspace/admin");
}

export async function rejectOrganization(formData: FormData) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");

  const organizationId = String(formData.get("organization_id") ?? "");
  if (!organizationId) redirect("/workspace/admin");

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace/admin");

  await supabase
    .from("organizations")
    .update({
      onboarding_status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: organizationId,
    action: "organization.rejected",
    resource_type: "organization",
    resource_id: organizationId,
    reason: "admin_queue",
    request_id: requestId(),
  });

  redirect("/workspace/admin");
}
