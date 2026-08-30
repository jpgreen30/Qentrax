import { apiError, apiOk } from "@/lib/api";
import { enqueueAndAttemptDelivery } from "@/lib/delivery/retry";
import { allowSimulatedDelivery } from "@/lib/env";
import { computeQScore } from "@/lib/qscore";
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
 * Opportunity intake → schema validation → Q-Score → ready → marketplace auction.
 * Idempotent on (source_id, external_submission_id) — returns ORIGINAL public txn id.
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

  const supabaseClient = supabase;
  const { data: source } = await supabaseClient
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

  // Fast-path idempotent lookup before insert (also protected by UNIQUE constraint)
  if (body.external_submission_id) {
    const { data: existing } = await supabaseClient
      .from("opportunities")
      .select("id, public_transaction_id, status")
      .eq("source_id", body.source_id)
      .eq("external_submission_id", body.external_submission_id)
      .maybeSingle();
    if (existing) {
      return apiOk(
        {
          transaction_id: existing.public_transaction_id,
          opportunity_id: existing.id,
          status: "accepted",
          idempotent_replay: true,
          note: "Original submission returned.",
        },
        id,
      );
    }
  }

  const { data: v } = await supabaseClient
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
    const { data: p } = await supabaseClient
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

  const schemas = await loadFieldSchemas(supabaseClient, body.vertical, body.product ?? null);
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

  const qscore = computeQScore({
    schemaOk: validated.ok,
    hasConsent: validated.hasConsent,
    attributes: validated.pingAttributes as Record<string, unknown>,
  });

  const publicTxn = generatePublicTransactionId();
  const { data: opportunity, error } = await supabaseClient
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
    // UNIQUE (source_id, external_submission_id) — return ORIGINAL row
    if (error?.code === "23505" && body.external_submission_id) {
      const { data: original } = await supabaseClient
        .from("opportunities")
        .select("id, public_transaction_id, status")
        .eq("source_id", body.source_id)
        .eq("external_submission_id", body.external_submission_id)
        .maybeSingle();
      if (original) {
        return apiOk(
          {
            transaction_id: original.public_transaction_id,
            opportunity_id: original.id,
            status: "accepted",
            idempotent_replay: true,
            note: "Original submission returned.",
          },
          id,
        );
      }
    }
    return apiError("INTERNAL_ERROR", error?.message ?? "Failed to record opportunity.", id, 500);
  }

  const { data: run } = await supabaseClient
    .from("validation_runs")
    .insert({
      opportunity_id: opportunity.id,
      pipeline_version: qscore.version,
      status: "completed",
      composite_score: qscore.score,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (run) {
    await supabaseClient.from("validation_results").insert(
      qscore.components.map((c) => ({
        validation_run_id: run.id,
        check_code: c.code,
        outcome: c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "skip",
        reason_code: c.code,
      })),
    );
  }

  await supabaseClient
    .from("opportunities")
    .update({
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opportunity.id);

  const shouldAuction = body.run_auction !== false;
  let auction: unknown = null;
  if (shouldAuction) {
    const { data: auctionResult, error: auctionError } = await supabaseClient.rpc(
      "run_minimal_auction",
      {
        p_opportunity_id: opportunity.id,
      },
    );
    auction = auctionError
      ? { status: "error", message: auctionError.message }
      : auctionResult;

    const ar = auction as { status?: string; campaign_id?: string; transaction_id?: string } | null;
    if (ar && typeof ar === "object" && ar.campaign_id && ar.status === "billable") {
      const { data: ep } = await supabaseClient
        .from("campaign_endpoints")
        .select("id, endpoint_url, timeout_ms")
        .eq("campaign_id", ar.campaign_id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: auctionRunRow } = await supabaseClient
        .from("auction_runs")
        .select("id")
        .eq("opportunity_id", opportunity.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      try {
        if (!auctionRunRow?.id) {
          throw new Error("Auction run was not recorded");
        }
        const delivery = await enqueueAndAttemptDelivery(supabaseClient, {
          opportunityId: opportunity.id,
          campaignId: ar.campaign_id,
          auctionRunId: auctionRunRow.id,
          transactionId: ar.transaction_id ?? null,
          endpointId: ep?.id ?? null,
          endpointUrl: ep?.endpoint_url ?? null,
          timeoutMs: ep?.timeout_ms ?? 8000,
          // Production: false. Dev/test only when explicitly allowed.
          simulateOnMissing: allowSimulatedDelivery(),
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
          reason_code: "DELIVERY_ERROR",
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
      quality: {
        score: qscore.score,
        version: qscore.version,
        reason_codes: qscore.reason_codes,
      },
      auction,
    },
    id,
  );
}
