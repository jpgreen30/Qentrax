/**
 * POST /api/v1/ping
 *
 * Ping: minimal data → validation → auction → return best bid + txn ID
 *
 * Idempotent on (source_id, external_submission_id).
 * Bid expires after configurable window (default 30 seconds).
 */

import { apiError, apiOk } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { ping as pingService } from "@/lib/services/ping-post";

export async function POST(request: Request) {
  const id = requestId(
    request.headers.get("x-request-id") ?? request.headers.get("idempotency-key"),
  );

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims) {
    return apiError("AUTH_REQUIRED", "Authentication is required.", id, 401);
  }

  let body: {
    source_id?: string;
    external_submission_id?: string;
    vertical?: string;
    product?: string | null;
    consumer?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
    consent?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.source_id) {
    return apiError("VALIDATION_ERROR", "source_id is required.", id, 400);
  }

  if (!body.external_submission_id) {
    return apiError("VALIDATION_ERROR", "external_submission_id is required.", id, 400);
  }

  if (!body.vertical) {
    return apiError("VALIDATION_ERROR", "vertical is required.", id, 400);
  }

  const result = await pingService(supabase, {
    source_id: body.source_id,
    external_submission_id: body.external_submission_id,
    vertical: body.vertical,
    product: body.product,
    consumer: body.consumer,
    attributes: body.attributes,
    consent: body.consent,
  });

  if (!result.ok) {
    return apiError(result.error_code, result.error_message, id, 400);
  }

  return apiOk(result, id, 200);
}
