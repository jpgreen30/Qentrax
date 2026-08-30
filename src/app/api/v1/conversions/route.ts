import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { recordConversion } from "@/lib/conversions/record";
import { DISPOSITIONS } from "@/lib/conversions/dispositions";

/**
 * Conversion / disposition feedback.
 *
 * This route previously created a service-role client — which bypasses
 * row-level security — took organization_id from a caller-supplied parameter,
 * and performed no authentication whatsoever. Any caller could read another
 * tenant's conversions or write revenue attributed to them, which feeds ROAS.
 * It also queried columns the table does not have (organization_id,
 * delivery_id, conversion_status), so it could not have worked.
 *
 * The tenant now comes from the verified session and every query runs through
 * the RLS-scoped client.
 */
async function resolveAdvertiserOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requested: string | null,
): Promise<{ id: string } | null> {
  // RLS limits this to organizations the caller belongs to, so a requested id
  // that is not theirs simply does not resolve.
  let query = supabase.from("organizations").select("id, type").eq("type", "advertiser");
  if (requested) query = query.eq("id", requested);

  const { data } = await query.limit(1).maybeSingle();
  return data ? { id: data.id as string } : null;
}

export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  const url = new URL(request.url);
  const supabase = await createClient();
  const org = await resolveAdvertiserOrg(supabase, url.searchParams.get("organization_id"));
  if (!org) return apiError("AUTH_FORBIDDEN", "No advertiser organization accessible.", id, 403);

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const transactionId = url.searchParams.get("transaction_id");
  const eventType = url.searchParams.get("event_type");

  let query = supabase
    .from("conversion_events")
    .select(
      `id, transaction_id, external_event_id, external_record_id, event_type,
       revenue_cents, currency, occurred_at, received_at, source_method,
       validation_status`,
      { count: "exact" },
    )
    .eq("advertiser_org_id", org.id)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (transactionId) query = query.eq("transaction_id", transactionId);
  if (eventType) query = query.eq("event_type", eventType);

  const { data, error, count } = await query;
  if (error) return apiError("INTERNAL_ERROR", error.message, id, 500);

  return apiOk({ conversions: data ?? [], count: count ?? 0, limit, offset }, id);
}

export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("INVALID_REQUEST", "Body must be JSON.", id, 400);
  }

  const supabase = await createClient();
  const org = await resolveAdvertiserOrg(
    supabase,
    typeof body.organization_id === "string" ? body.organization_id : null,
  );
  if (!org) return apiError("AUTH_FORBIDDEN", "No advertiser organization accessible.", id, 403);

  const transactionId = typeof body.transaction_id === "string" ? body.transaction_id : "";
  const disposition =
    typeof body.disposition === "string"
      ? body.disposition
      : typeof body.event_type === "string"
        ? body.event_type
        : "";

  if (!transactionId) {
    return apiError("VALIDATION_ERROR", "transaction_id is required.", id, 400);
  }
  if (!disposition) {
    return apiError(
      "VALIDATION_ERROR",
      `disposition is required; one of ${DISPOSITIONS.join(", ")}.`,
      id,
      400,
    );
  }

  const result = await recordConversion(supabase, {
    advertiserOrgId: org.id,
    transactionId,
    disposition,
    revenueCents:
      typeof body.revenue_cents === "number" ? body.revenue_cents : null,
    externalEventId:
      typeof body.external_event_id === "string" ? body.external_event_id : null,
    externalRecordId:
      typeof body.external_record_id === "string" ? body.external_record_id : null,
    occurredAt: typeof body.occurred_at === "string" ? body.occurred_at : null,
    sourceMethod: "api",
  });

  if (!result.ok) {
    const status =
      result.code === "TRANSACTION_NOT_FOUND"
        ? 404
        : result.code === "WRITE_FAILED"
          ? 500
          : 400;
    return apiError(result.code, result.message, id, status);
  }

  return apiOk(
    {
      conversion_id: result.id,
      disposition: result.disposition,
      // A repeat of the same event is success; the caller should not retry.
      duplicate: result.duplicate,
    },
    id,
    result.duplicate ? 200 : 201,
  );
}
