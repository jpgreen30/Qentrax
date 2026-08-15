import { apiError, apiOk } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { generatePublicTransactionId } from "@/lib/transaction-id";
import { createClient } from "@/lib/supabase/server";

/**
 * Controlled opportunity intake (Phase 3/4 skeleton).
 * Requires authenticated publisher membership on the source org.
 * Full Q-Shield + auction workers land in later hardening; this path
 * records received → validating shell with reason-coded stubs.
 */
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
    product?: string;
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

  const { data: source } = await supabase
    .from("publisher_sources")
    .select("id, publisher_org_id, status")
    .eq("id", body.source_id)
    .maybeSingle();

  if (!source) {
    return apiError("AUTH_FORBIDDEN", "Source not found or not accessible.", id, 403);
  }

  // Test mode: only draft/testing/approved/active may submit; live charges blocked until Phase 4 workers
  if (!["draft", "testing", "approved", "active"].includes(source.status)) {
    return apiError(
      "VALIDATION_ERROR",
      "Source is not eligible to submit opportunities.",
      id,
      400,
      { reason_code: "CAMPAIGN_INACTIVE" },
    );
  }

  let verticalId: string | null = null;
  let productId: string | null = null;
  if (body.vertical) {
    const { data: v } = await supabase
      .from("verticals")
      .select("id")
      .eq("code", body.vertical)
      .maybeSingle();
    verticalId = v?.id ?? null;
    if (v && body.product) {
      const { data: p } = await supabase
        .from("products")
        .select("id")
        .eq("vertical_id", v.id)
        .eq("code", body.product)
        .maybeSingle();
      productId = p?.id ?? null;
    }
  }

  const publicTxn = generatePublicTransactionId();
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      public_transaction_id: publicTxn,
      publisher_org_id: source.publisher_org_id,
      source_id: source.id,
      vertical_id: verticalId,
      product_id: productId,
      external_submission_id: body.external_submission_id ?? null,
      status: "validating",
      schema_version: "v1",
    })
    .select("id, public_transaction_id, status")
    .single();

  if (error || !opportunity) {
    if (error?.code === "23505") {
      return apiOk(
        {
          transaction_id: publicTxn,
          status: "accepted",
          note: "Idempotent replay — original submission retained.",
        },
        id,
      );
    }
    return apiError("INTERNAL_ERROR", error?.message ?? "Failed to record opportunity.", id, 500);
  }

  const { data: run } = await supabase
    .from("validation_runs")
    .insert({
      opportunity_id: opportunity.id,
      pipeline_version: "v1-stub",
      status: "completed",
      composite_score: body.consent ? 90 : 40,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (run) {
    await supabase.from("validation_results").insert([
      {
        validation_run_id: run.id,
        check_code: "SCHEMA",
        outcome: "pass",
        reason_code: null,
      },
      {
        validation_run_id: run.id,
        check_code: "CONSENT",
        outcome: body.consent ? "pass" : "fail",
        reason_code: body.consent ? null : "CONSENT_MISSING",
      },
    ]);
  }

  const accepted = Boolean(body.consent);
  await supabase
    .from("opportunities")
    .update({
      status: accepted ? "ready" : "rejected_quality",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunity.id);

  return apiOk(
    {
      transaction_id: opportunity.public_transaction_id,
      status: accepted ? "accepted" : "rejected",
      decision: accepted
        ? { buyer_status: "queued_for_auction", note: "Auction worker not yet live (Phase 4)" }
        : { buyer_status: "rejected", reason_codes: ["CONSENT_MISSING"] },
      quality: {
        score: accepted ? 90 : 40,
        reason_codes: accepted ? [] : ["CONSENT_MISSING"],
      },
    },
    id,
  );
}
