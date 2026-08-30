import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { requireAdvertiserCrmAccess } from "@/lib/services/crm-access";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const request_id = requestId(request.headers.get("x-request-id"));
  const { id } = await params;
  const supabase = await createClient();

  const { data: config, error: configError } = await supabase
    .from("crm_integrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (configError || !config) {
    return apiError("NOT_FOUND", "CRM integration not found.", request_id, 404);
  }

  const access = await requireAdvertiserCrmAccess(config.organization_id as string, {
    supabase,
  });
  if (!access.ok) {
    const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "VALIDATION_ERROR" ? 400 : 403;
    return apiError(access.code, access.message, request_id, status);
  }

  return Response.json({ success: true, data: config });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const request_id = requestId(request.headers.get("x-request-id"));
  const { id } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  const allowedFields = [
    "name",
    "status",
    "credentials",
    "mapped_fields",
    "sync_enabled",
    "sync_frequency_minutes",
  ];

  const { data: existing, error: existingError } = await supabase
    .from("crm_integrations")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return apiError("NOT_FOUND", "CRM integration not found.", request_id, 404);
  }

  const access = await requireAdvertiserCrmAccess(existing.organization_id as string, {
    supabase,
  });
  if (!access.ok) {
    const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "VALIDATION_ERROR" ? 400 : 403;
    return apiError(access.code, access.message, request_id, status);
  }

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("crm_integrations")
    .update(updates)
    .eq("id", id);

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, request_id, 500);
  }

  return Response.json({ success: true, message: "Integration updated" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const request_id = requestId(request.headers.get("x-request-id"));
  const { id } = await params;
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("crm_integrations")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return apiError("NOT_FOUND", "CRM integration not found.", request_id, 404);
  }

  const access = await requireAdvertiserCrmAccess(existing.organization_id as string, {
    supabase,
  });
  if (!access.ok) {
    const status = access.code === "AUTH_REQUIRED" ? 401 : access.code === "VALIDATION_ERROR" ? 400 : 403;
    return apiError(access.code, access.message, request_id, status);
  }

  const { error } = await supabase
    .from("crm_integrations")
    .delete()
    .eq("id", id);

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, request_id, 500);
  }

  return Response.json({ success: true, message: "Integration deleted" });
}
