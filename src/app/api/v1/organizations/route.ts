import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { ownerRoleForType } from "@/lib/permissions";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      "organization_id, role:roles(code,name), organization:organizations(id,type,legal_name,dba_name,website,status,onboarding_status)",
    )
    .eq("user_id", auth.userId)
    .eq("status", "active");

  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);
  return apiOk({ organizations: data ?? [] }, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    type?: "advertiser" | "publisher";
    legal_name?: string;
    dba_name?: string;
    website?: string;
    tax_country?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.type || !["advertiser", "publisher"].includes(body.type)) {
    return apiError("VALIDATION_ERROR", "type must be advertiser or publisher.", id, 400);
  }
  if (!body.legal_name?.trim()) {
    return apiError("VALIDATION_ERROR", "legal_name is required.", id, 400);
  }

  const supabase = await createClient();
  const roleCode = ownerRoleForType(body.type);
  const { data: role } = await supabase.from("roles").select("id").eq("code", roleCode).single();
  if (!role) return apiError("INTERNAL_ERROR", "Owner role missing from seed.", id, 500);

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      type: body.type,
      legal_name: body.legal_name.trim(),
      dba_name: body.dba_name?.trim() || null,
      website: body.website?.trim() || null,
      tax_country: body.tax_country?.slice(0, 2) || "US",
      onboarding_status: "profile_submitted",
      status: "active",
    })
    .select("id, type, legal_name, onboarding_status")
    .single();

  if (orgError || !org) {
    return apiError("INTERNAL_ERROR", orgError?.message ?? "Failed to create organization.", id, 500);
  }

  const { error: memberError } = await supabase.from("organization_members").insert({
    organization_id: org.id,
    user_id: auth.userId,
    role_id: role.id,
    status: "active",
    joined_at: new Date().toISOString(),
  });

  if (memberError) {
    return apiError("INTERNAL_ERROR", memberError.message, id, 500);
  }

  await supabase.from("organization_profiles").insert({
    organization_id: org.id,
    kyb_status: "not_started",
  });

  await supabase.from("financial_accounts").insert({
    organization_id: org.id,
    type: body.type === "advertiser" ? "advertiser_balance" : "publisher_payable",
    currency: "USD",
    status: "active",
  });

  await supabase.from("audit_events").insert({
    actor_user_id: auth.userId,
    actor_org_id: org.id,
    action: "organization.created",
    resource_type: "organization",
    resource_id: org.id,
    request_id: id,
    after_redacted: { type: org.type, legal_name: org.legal_name },
  });

  return apiOk({ organization: org }, id, 201);
}
