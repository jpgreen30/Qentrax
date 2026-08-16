import { apiError, apiOk } from "@/lib/api";
import { enqueueAndAttemptDelivery } from "@/lib/delivery/retry";
import { requestId } from "@/lib/request-id";
import { generatePublicTransactionId } from "@/lib/transaction-id";
import { createClient } from "@/lib/supabase/server";
import {
  flattenIntakePayload,
  loadFieldSchemas,
  validateAgainstSchemas,
} from "@/lib/validate-vertical-fields";
import { PRIMARY_VERTICAL_CODES } from "@/lib/verticals";

/**
 * Opportunity intake → schema validation → ready → marketplace auction (unless skip_auction).
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
    ping_only?: boolean;
    /** Default true: run auction immediately after validation */
    run_auction?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Invalid JSON body.", id, 400);
  }

  if (!body.source_id) {
    return apiError("VALIDATION_ERROR", "source_id is required.", id, 400);
  }
  if (!body.vertical) {
    return apiError(
      "VALIDATION_ERROR",
      `vertical is required. Primary codes: ${PRIMARY_VERTICAL_CODES.join(", ")}.`,
      id,
      400,
    );
  }

  const { data: source } = await supabase
    .from("publisher_sources")
    .select("id, publisher_org_id, status")
    .eq("id", body.source_id)
    .maybeSingle();

  if (!source) {
    return apiError("AUTH_FORBIDDEN", "Source not found or not accessible.", id, 403);
  }

  if (!["draft", "testing", "approved", "active"].includes(source.status)) {
    return apiError(
      "VALIDATION_ERROR",
      "Source is not eligible to submit opportunities.",
      id,
      400,
      { reason_code: "CAMPAIGN_INACTIVE" },
    );
  }

  const { data: v } = await supabase
    .from("verticals")
    .select("id, code")
    .eq("code", body.vertical)
    .eq("active", true)
    .maybeSingle();

  if (!v) {
    return apiError(
      "VALIDATION_ERROR",
      `Unknown or inactive vertical '${body.vertical}'.`,
      id,
      400,
      { reason_code: "VERTICAL_UNKNOWN" },
    );
  }

  let productId: string | null = null;
  if (body.product) {
    const { data: p } = await supabase
      .from("products")
      .select("id")
      .eq("vertical_id", v.id)
      .eq("code", body.product)
      .eq("active", true)
      .maybeSingle();
    if (!p) {
      return apiError(
        "VALIDATION_ERROR",
        `Unknown product '${body.product}' for vertical '${body.vertical}'.`,
        id,
        400,
      );
    }
    productId = p.id;
  }

  const schemas = await loadFieldSchemas(supabase, body.vertical, body.product ?? null);
  const bag = flattenIntakePayload({
    attributes: body.attributes,
    consumer: body.consumer,
    consent: body.consent,
  });
  const validated = validateAgainstSchemas(body.vertical, schemas, bag, {
    requirePost: !body.ping_only,
  });

  if (!validated.ok) {
    return apiError(
      "VALIDATION_ERROR",
      "Opportunity failed vertical field validation.",
      id,
      400,
      {
        reason_code: "SCHEMA_INVALID",
        issues: validated.issues,
      },
    );
  }

  if (!validated.hasConsent) {
    return apiError(
      "VALIDATION_ERROR",
      "TCPA consent is required (tcpa_consent and/or tcpa_text).",
      id,
      400,
      { reason_code: "CONSENT_MISSING" },
    );
  }

  const publicTxn = generatePublicTransactionId();
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      public_transaction_id: publicTxn,
      publisher_org_id: source.publisher_org_id,
      source_id: source.id,
      vertical_id: v.id,
      product_id: productId,
      external_submission_id: body.external_submission_id ?? null,
      status: "validating",
      schema_version: "v1",
      ping_attributes: validated.pingAttributes,
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
      pipeline_version: "v1-schema",
      status: "completed",
      composite_score: 92,
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
        outcome: "pass",
        reason_code: null,
      },
    ]);
  }

  await supabase
    .from("opportunities")
    .update({
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunity.id);

  const shouldAuction = body.run_auction !== false;
  let auction: unknown = null;
  if (shouldAuction) {
    const { data: auctionResult, error: auctionError } = await supabase.rpc("run_minimal_auction", {
      p_opportunity_id: opportunity.id,
    });
    auction = auctionError
      ? { status: "error", message: auctionError.message }
      : auctionResult;

    const ar = auction as { status?: string; campaign_id?: string; transaction_id?: string } | null;
    if (ar && typeof ar === "object" && ar.campaign_id && ar.status === "billable") {
      const { data: ep } = await supabase
        .from("campaign_endpoints")
        .select("id, endpoint_url, timeout_ms")
        .eq("campaign_id", ar.campaign_id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      try {
        const delivery = await enqueueAndAttemptDelivery(supabase, {
          opportunityId: opportunity.id,
          campaignId: ar.campaign_id,
          transactionId: ar.transaction_id ?? null,
          endpointId: ep?.id ?? null,
          endpointUrl: ep?.endpoint_url ?? null,
          timeoutMs: ep?.timeout_ms ?? 8000,
          simulateOnMissing: true,
          requestId: id,
          payload: {
            transaction_id: String(ar.transaction_id ?? ""),
            public_transaction_id: opportunity.public_transaction_id,
            opportunity_id: opportunity.id,
            campaign_id: ar.campaign_id,
            vertical: body.vertical,
            state:
              typeof validated.pingAttributes.state === "string"
                ? String(validated.pingAttributes.state)
                : null,
            attributes: validated.pingAttributes,
            delivered_at: new Date().toISOString(),
          },
        });
        (auction as Record<string, unknown>).delivery = delivery;
      } catch (e) {
        (auction as Record<string, unknown>).delivery = {
          status: "error",
          message: e instanceof Error ? e.message : "delivery failed",
        };
      }
    }
  }

  return apiOk(
    {
      transaction_id: opportunity.public_transaction_id,
      opportunity_id: opportunity.id,
      status: "accepted",
      vertical: body.vertical,
      product: body.product ?? null,
      ping_attributes: validated.pingAttributes,
      quality: { score: 92, reason_codes: [] },
      auction,
    },
    id,
  );
}
