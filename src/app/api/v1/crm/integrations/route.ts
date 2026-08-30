import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { requireAdvertiserCrmAccess } from "@/lib/services/crm-access";
import { createClient } from "@/lib/supabase/server";
import type { CrmIntegrationConfig } from "@/lib/services/crm-integrations";

export async function GET(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"));

  const organizationId = request.nextUrl.searchParams.get("organization_id");

  if (!organizationId) {
    return apiError("VALIDATION_ERROR", "organization_id parameter required.", id, 400);
  }

  const access = await requireAdvertiserCrmAccess(organizationId, {
    supabase: await createClient(),
  });
  if (!access.ok) {
    const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "VALIDATION_ERROR" ? 400 : 403;
    return apiError(access.code, access.message, id, status);
  }

  const { data, error } = await access.supabase
    .from("crm_integrations")
    .select("*")
    .eq("organization_id", access.organization.id);

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, id, 500);
  }

  return Response.json({
    success: true,
    data: data || [],
    count: (data || []).length,
  });
}

export async function POST(request: NextRequest) {
  const id = requestId(request.headers.get("x-request-id"));
  const supabase = await createClient();

  const body = await request.json();
  const {
    organization_id,
    platform,
    name,
    credentials,
    mapped_fields,
    sync_enabled,
    sync_frequency_minutes,
  } = body;

  if (
    !organization_id ||
    !platform ||
    !name ||
    !credentials ||
    !mapped_fields
  ) {
    return apiError(
      "VALIDATION_ERROR",
      "Missing required fields: organization_id, platform, name, credentials, mapped_fields",
      id,
      400,
    );
  }

  const access = await requireAdvertiserCrmAccess(String(organization_id), {
    supabase,
  });
  if (!access.ok) {
    const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "VALIDATION_ERROR" ? 400 : 403;
    return apiError(access.code, access.message, id, status);
  }

  const newConfig: CrmIntegrationConfig = {
    id: crypto.randomUUID(),
    organization_id: access.organization.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    platform: platform as any,
    name,
    status: "disconnected",
    credentials,
    mapped_fields,
    sync_enabled: sync_enabled ?? false,
    sync_frequency_minutes: sync_frequency_minutes ?? 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("crm_integrations")
    .insert([newConfig]);

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, id, 500);
  }

  return Response.json({ success: true, data: newConfig }, { status: 201 });
}
