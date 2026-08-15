import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
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
  const { data, error } = await supabase.rpc("register_organization", {
    p_type: body.type,
    p_legal_name: body.legal_name.trim(),
    p_dba_name: body.dba_name?.trim() || null,
    p_website: body.website?.trim() || null,
    p_tax_country: body.tax_country?.slice(0, 2) || "US",
  });

  if (error || !data) {
    return apiError("INTERNAL_ERROR", error?.message ?? "Failed to create organization.", id, 500);
  }

  return apiOk({ organization: data }, id, 201);
}
