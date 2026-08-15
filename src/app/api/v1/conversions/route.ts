import { apiError, apiOk } from "@/lib/api";
import { requireAuthContext } from "@/lib/auth-context";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/conversions — advertiser (or publisher) disposition / sale event.
 * Body: organization_id, transaction_id, event_type, external_event_id, revenue_cents?, product?
 */
export async function POST(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const auth = await requireAuthContext();
  if (!auth) return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);

  let body: {
    organization_id?: string;
    transaction_id?: string;
    event_type?: string;
    external_event_id?: string;
    revenue_cents?: number;
    product?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.organization_id || !body.transaction_id || !body.event_type || !body.external_event_id) {
    return apiError(
      "VALIDATION_ERROR",
      "organization_id, transaction_id, event_type, and external_event_id are required.",
      id,
      400,
    );
  }

  const allowed = ["contacted", "qualified", "sale", "rejected", "returned", "refunded"];
  if (!allowed.includes(body.event_type)) {
    return apiError(
      "VALIDATION_ERROR",
      `event_type must be one of: ${allowed.join(", ")}.`,
      id,
      400,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_conversion_event", {
    p_organization_id: body.organization_id,
    p_transaction_id: body.transaction_id,
    p_event_type: body.event_type,
    p_external_event_id: body.external_event_id,
    p_revenue_cents: body.revenue_cents ?? null,
    p_product: body.product ?? null,
    p_payload: body.payload ?? {},
  });

  if (error) {
    return apiError("INTERNAL_ERROR", error.message, id, 500);
  }

  return apiOk({ conversion: data }, id, 201);
}
