/**
 * Ping/Post domain: native Qentrax lead submission and delivery.
 *
 * Ping: minimal data → validation → auction → return best bid + txn ID
 * Post: full data → bind to ping → deliver → charge
 *
 * Both flows are idempotent on (source_id, external_submission_id).
 * Bids expire after configurable window (default 30s).
 * Capacity reservations are atomic; released on delivery failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePublicTransactionId } from "../transaction-id";
import { runAuction, RoutingStrategy } from "./routing";
import { recordAuctionDecision } from "./auction-log";
import { enqueueAndAttemptDelivery } from "../delivery/retry";

const BID_EXPIRATION_MS = 30000; // 30 seconds, configurable

export type PingInput = {
  source_id: string;
  external_submission_id: string;
  vertical: string;
  product?: string | null;
  consumer?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  consent?: Record<string, unknown>;
};

export type PingResult = {
  ok: true;
  public_transaction_id: string;
  winning_campaign_id: string | null;
  winning_bid_cents: number | null;
  bid_expires_at: string;
  eligible_buyer_count: number;
} | {
  ok: false;
  error_code: string;
  error_message: string;
  public_transaction_id?: string;
};

export type PostInput = {
  public_transaction_id: string;
  external_submission_id: string;
  source_id: string;
  consumer: Record<string, unknown>;
  attributes: Record<string, unknown>;
  consent: Record<string, unknown>;
};

export type PostResult = {
  ok: true;
  transaction_id: string;
  delivered_to_campaign_id: string;
  status: "delivered" | "accepted" | "rejected";
  charge_cents: number;
} | {
  ok: false;
  error_code: string;
  error_message: string;
};

/**
 * PING: Return best available bid for this opportunity.
 *
 * Idempotent on (source_id, external_submission_id).
 * If resubmitted within expiration window, returns original bid.
 */
export async function ping(
  supabase: SupabaseClient,
  input: PingInput,
): Promise<PingResult> {
  const { source_id, external_submission_id, vertical, product, consumer, attributes, consent } =
    input;

  // Check for existing ping (idempotency)
  const { data: existingOpp } = await supabase
    .from("opportunities")
    .select("id, public_transaction_id, status")
    .eq("source_id", source_id)
    .eq("external_submission_id", external_submission_id)
    .maybeSingle();

  if (existingOpp) {
    // Ping already exists; return previous transaction ID
    const { data: existingAuction } = await supabase
      .from("auction_runs")
      .select("winning_campaign_id, winning_bid_cents, completed_at")
      .eq("opportunity_id", existingOpp.id)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAuction) {
      const expiresAt = new Date(
        new Date(existingAuction.completed_at).getTime() + BID_EXPIRATION_MS,
      );
      if (new Date() < expiresAt) {
        return {
          ok: true,
          public_transaction_id: existingOpp.public_transaction_id,
          winning_campaign_id: existingAuction.winning_campaign_id,
          winning_bid_cents: existingAuction.winning_bid_cents,
          bid_expires_at: expiresAt.toISOString(),
          eligible_buyer_count: 0, // TODO: count from auction_candidates
        };
      }
    }

    return {
      ok: false,
      error_code: "BID_EXPIRED",
      error_message: "The prior bid expired; submit a new external_submission_id to run a fresh auction",
      public_transaction_id: existingOpp.public_transaction_id,
    };
  }

  // Load source to get publisher org
  const { data: source, error: sourceError } = await supabase
    .from("publisher_sources")
    .select("id, publisher_org_id, name")
    .eq("id", source_id)
    .maybeSingle();

  if (sourceError || !source) {
    return {
      ok: false,
      error_code: "SOURCE_NOT_FOUND",
      error_message: "Publisher source does not exist",
    };
  }

  // Load vertical
  const { data: vert, error: vertError } = await supabase
    .from("verticals")
    .select("id, code, name")
    .eq("code", vertical.toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (vertError || !vert) {
    return {
      ok: false,
      error_code: "VERTICAL_NOT_FOUND",
      error_message: `Vertical '${vertical}' not found`,
    };
  }

  // Create opportunity record (idempotent insert or retrieve)
  const publicTxnId = generatePublicTransactionId();
  const { data: opp, error: oppError } = await supabase
    .from("opportunities")
    .insert({
      public_transaction_id: publicTxnId,
      publisher_org_id: source.publisher_org_id,
      source_id: source.id,
      vertical_id: vert.id,
      product_id: product ? (await resolveProductId(supabase, vert.id, product))?.id : null,
      external_submission_id,
      status: "received",
      received_at: new Date().toISOString(),
      schema_version: "1.0",
    })
    .select("id")
    .single();

  if (oppError) {
    // Could be duplicate key violation; try to retrieve
    const { data: existing } = await supabase
      .from("opportunities")
      .select("id, public_transaction_id")
      .eq("source_id", source.id)
      .eq("external_submission_id", external_submission_id)
      .maybeSingle();

    if (existing) {
      return ping(supabase, input); // Recurse to return existing bid
    }

    return {
      ok: false,
      error_code: "OPPORTUNITY_CREATE_FAILED",
      error_message: oppError.message,
    };
  }

  // Run auction
  const decision = await runAuction(supabase, {
    opportunity_id: opp.id,
    vertical_id: vert.id,
    product_id: product,
    consumer,
    attributes,
  });

  // Record auction decision
  await recordAuctionDecision(supabase, { opportunity_id: opp.id, decision });

  const expiresAt = new Date(Date.now() + BID_EXPIRATION_MS);

  return {
    ok: true,
    public_transaction_id: publicTxnId,
    winning_campaign_id: decision.winning_campaign_id,
    winning_bid_cents: decision.winning_bid_cents,
    bid_expires_at: expiresAt.toISOString(),
    eligible_buyer_count: decision.eligible_candidates.filter((c) => c.eligible).length,
  };
}

/**
 * POST: Accept ping bid, deliver to buyer, create charge.
 *
 * Idempotent on public_transaction_id + source_id + external_submission_id.
 * Returns same result if resubmitted.
 */
export async function post(
  supabase: SupabaseClient,
  input: PostInput,
): Promise<PostResult> {
  const {
    public_transaction_id,
    source_id,
    external_submission_id,
    consumer,
    attributes,
    consent,
  } = input;

  if (!consent || Object.keys(consent).length === 0) {
    return {
      ok: false,
      error_code: "CONSENT_REQUIRED",
      error_message: "Consent evidence is required before buyer delivery",
    };
  }

  const { data: opp, error: oppError } = await supabase
    .from("opportunities")
    .select("id, source_id, external_submission_id, vertical_id, product_id, status, publisher_org_id")
    .eq("public_transaction_id", public_transaction_id)
    .maybeSingle();

  if (oppError || !opp) {
    return {
      ok: false,
      error_code: "OPPORTUNITY_NOT_FOUND",
      error_message: `Opportunity ${public_transaction_id} not found`,
    };
  }

  if (opp.source_id !== source_id || opp.external_submission_id !== external_submission_id) {
    return {
      ok: false,
      error_code: "IDEMPOTENCY_MISMATCH",
      error_message: "Submitted IDs do not match original ping",
    };
  }

  const { data: existingTxn } = await supabase
    .from("transactions")
    .select("id, campaign_id, advertiser_price_cents, status")
    .eq("opportunity_id", opp.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTxn) {
    return {
      ok: true,
      transaction_id: existingTxn.id,
      delivered_to_campaign_id: existingTxn.campaign_id,
      status:
        existingTxn.status === "charged" || existingTxn.status === "settled"
          ? "accepted"
          : existingTxn.status === "returned"
            ? "rejected"
            : "delivered",
      charge_cents: existingTxn.advertiser_price_cents,
    };
  }

  const { data: auctionRun } = await supabase
    .from("auction_runs")
    .select("id, winning_campaign_id, winning_bid_cents, completed_at")
    .eq("opportunity_id", opp.id)
    .maybeSingle();

  if (!auctionRun || !auctionRun.winning_campaign_id || !auctionRun.winning_bid_cents) {
    return {
      ok: false,
      error_code: "NO_WINNING_BID",
      error_message: "Opportunity has no winning bid; cannot deliver",
    };
  }

  const bidExpiresAt = new Date(
    new Date(auctionRun.completed_at).getTime() + BID_EXPIRATION_MS,
  );
  if (new Date() > bidExpiresAt) {
    return {
      ok: false,
      error_code: "BID_EXPIRED",
      error_message: `Bid expired at ${bidExpiresAt.toISOString()}`,
    };
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, advertiser_org_id, base_bid_cents")
    .eq("id", auctionRun.winning_campaign_id)
    .maybeSingle();

  if (!campaign) {
    return {
      ok: false,
      error_code: "CAMPAIGN_NOT_FOUND",
      error_message: "Winning campaign no longer exists",
    };
  }

  const idempotencyKey = `${source_id}:${external_submission_id}:${public_transaction_id}`;
  const { data: reservation, error: reservationError } = await supabase
    .rpc("reserve_campaign_transaction", {
      p_opportunity_id: opp.id,
      p_publisher_org_id: opp.publisher_org_id,
      p_advertiser_org_id: campaign.advertiser_org_id,
      p_campaign_id: campaign.id,
      p_price_cents: auctionRun.winning_bid_cents,
      p_idempotency_key: idempotencyKey,
    })
    .single();

  if (reservationError || !reservation) {
    return {
      ok: false,
      error_code: "TRANSACTION_CREATE_FAILED",
      error_message: reservationError?.message || "Transaction reservation failed",
    };
  }

  const typedReservation = reservation as {
    transaction_id: string | null;
    transaction_status: string | null;
    charge_cents: number | null;
    created: boolean;
    error_code: string | null;
  };

  if (typedReservation.error_code || !typedReservation.transaction_id) {
    return {
      ok: false,
      error_code: typedReservation.error_code || "TRANSACTION_CREATE_FAILED",
      error_message: "Campaign cannot accept this transaction",
    };
  }

  if (!typedReservation.created) {
    return {
      ok: true,
      transaction_id: typedReservation.transaction_id,
      delivered_to_campaign_id: campaign.id,
      status:
        typedReservation.transaction_status === "charged" ||
        typedReservation.transaction_status === "settled"
          ? "accepted"
          : typedReservation.transaction_status === "returned"
            ? "rejected"
            : "delivered",
      charge_cents: typedReservation.charge_cents ?? auctionRun.winning_bid_cents,
    };
  }

  const transactionId = typedReservation.transaction_id;
  await supabase.from("transaction_events").insert({
    transaction_id: transactionId,
    event_type: "reserved",
    reason_code: null,
    actor_type: "api",
    payload_json: {
      public_transaction_id,
      external_submission_id,
      consent_present: true,
      reason_code: "PING_POST_ACCEPTED",
    },
    occurred_at: new Date().toISOString(),
  });

  const [{ data: endpoint }, { data: vertical }] = await Promise.all([
    supabase
      .from("campaign_endpoints")
      .select("id, endpoint_url, timeout_ms")
      .eq("campaign_id", campaign.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("verticals").select("code").eq("id", opp.vertical_id).maybeSingle(),
  ]);

  try {
    const delivery = await enqueueAndAttemptDelivery(supabase, {
      opportunityId: opp.id,
      campaignId: campaign.id,
      auctionRunId: auctionRun.id,
      transactionId,
      endpointId: endpoint?.id ?? null,
      endpointUrl: endpoint?.endpoint_url ?? null,
      timeoutMs: endpoint?.timeout_ms ? Number(endpoint.timeout_ms) : undefined,
      maxAttempts: 1,
      requestId: `post:${transactionId}`,
      payload: {
        transaction_id: transactionId,
        public_transaction_id,
        opportunity_id: opp.id,
        campaign_id: campaign.id,
        vertical: vertical?.code ?? null,
        consumer,
        attributes,
        consent,
        advertiser_price_cents: auctionRun.winning_bid_cents,
        delivered_at: new Date().toISOString(),
      },
    });

    const accepted = delivery.status === "accepted";
    const { data: finalized, error: finalizeError } = await supabase
      .rpc("finalize_campaign_transaction", {
        p_transaction_id: transactionId,
        p_delivery_id: delivery.deliveryId,
        p_accepted: accepted,
        p_reason_code: delivery.reason_code ?? (accepted ? "BUYER_ACCEPTED" : "DELIVERY_FAILED"),
      })
      .single();

    if (finalizeError || !finalized) {
      return {
        ok: false,
        error_code: "TRANSACTION_FINALIZE_FAILED",
        error_message: "Delivery completed but transaction finalization failed",
      };
    }

    await supabase
      .from("opportunities")
      .update({ status: accepted ? "delivered" : "received" })
      .eq("id", opp.id);

    if (!accepted) {
      return {
        ok: false,
        error_code: delivery.reason_code ?? "DELIVERY_FAILED",
        error_message: "Buyer delivery was not accepted; budget reservation was released",
      };
    }

    return {
      ok: true,
      transaction_id: transactionId,
      delivered_to_campaign_id: campaign.id,
      status: "accepted",
      charge_cents: typedReservation.charge_cents ?? auctionRun.winning_bid_cents,
    };
  } catch {
    await supabase.rpc("finalize_campaign_transaction", {
      p_transaction_id: transactionId,
      p_delivery_id: null,
      p_accepted: false,
      p_reason_code: "DELIVERY_ERROR",
    });
    return {
      ok: false,
      error_code: "DELIVERY_ERROR",
      error_message: "Buyer delivery failed; budget reservation was released",
    };
  }
}

/**
 * Resolve product ID by code within vertical.
 */
async function resolveProductId(
  supabase: SupabaseClient,
  verticalId: string,
  productCode: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("vertical_id", verticalId)
    .eq("code", productCode.toLowerCase())
    .eq("active", true)
    .maybeSingle();

  return data;
}
