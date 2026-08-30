import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverToEndpoint, type DeliveryPayload } from "./http-delivery";
import { mapDeliveryStatus, DEFAULT_MAX_ATTEMPTS, DEFAULT_TIMEOUT_MS } from "./retry";
import { requestId } from "@/lib/request-id";

/**
 * Manual replay of a failed delivery.
 *
 * Replay re-sends a lead the buyer never successfully received. It must never
 * bill again: the advertiser was already charged when the transaction was
 * finalized, and the money side is deliberately untouched here. This function
 * writes a delivery attempt and an audit record and nothing else — it does not
 * call finalize_campaign_transaction, create a transaction, or touch the
 * ledger. That is the whole no-double-billing guarantee, and it is asserted by
 * replay-lifecycle tests rather than assumed.
 *
 * A delivery that already succeeded is refused, so replay cannot be used to
 * send a lead twice to a buyer who accepted it.
 */
export type ReplayResult =
  | {
      ok: true;
      deliveryId: string;
      attemptNumber: number;
      status: string;
      httpStatus: number | null;
      accepted: boolean;
    }
  | { ok: false; reason: ReplayRejection; message: string };

export type ReplayRejection =
  | "DELIVERY_NOT_FOUND"
  | "ALREADY_ACCEPTED"
  | "NO_ENDPOINT"
  | "NOT_RECORDED";

type DeliveryRow = {
  id: string;
  opportunity_id: string;
  campaign_id: string | null;
  auction_run_id: string;
  transaction_id: string | null;
  endpoint_id: string | null;
  endpoint_url: string | null;
  attempt_number: number;
  max_attempts: number | null;
  status: string;
  organization_id: string | null;
  sla_due_at: string | null;
  request_snapshot_redacted: { payload?: DeliveryPayload } | null;
};

export async function replayDelivery(
  supabase: SupabaseClient,
  opts: {
    deliveryId: string;
    /** Scopes the lookup to one tenant; omit for platform admin replay. */
    organizationId?: string | null;
    actorUserId?: string | null;
    actorOrgId?: string | null;
  },
): Promise<ReplayResult> {
  let query = supabase
    .from("deliveries")
    .select(
      `id, opportunity_id, campaign_id, auction_run_id, transaction_id, endpoint_id,
       endpoint_url, attempt_number, max_attempts, status, organization_id, sla_due_at,
       request_snapshot_redacted`,
    )
    .eq("id", opts.deliveryId);

  if (opts.organizationId) query = query.eq("organization_id", opts.organizationId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return { ok: false, reason: "DELIVERY_NOT_FOUND", message: "Delivery not found." };
  }

  const row = data as DeliveryRow;

  // Never re-send a lead the buyer already took.
  if (row.status === "accepted") {
    return {
      ok: false,
      reason: "ALREADY_ACCEPTED",
      message: "This delivery was already accepted and cannot be replayed.",
    };
  }

  let endpointUrl = row.endpoint_url;
  let timeoutMs = DEFAULT_TIMEOUT_MS;

  if (!endpointUrl && row.campaign_id) {
    const { data: endpoint } = await supabase
      .from("campaign_endpoints")
      .select("endpoint_url, timeout_ms")
      .eq("campaign_id", row.campaign_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    endpointUrl = endpoint?.endpoint_url ?? null;
    if (endpoint?.timeout_ms) timeoutMs = Number(endpoint.timeout_ms);
  }

  if (!endpointUrl) {
    return {
      ok: false,
      reason: "NO_ENDPOINT",
      message: "No delivery endpoint is configured for this campaign.",
    };
  }

  const payload: DeliveryPayload = row.request_snapshot_redacted?.payload ?? {
    transaction_id: row.transaction_id ?? "",
    opportunity_id: row.opportunity_id,
    campaign_id: row.campaign_id ?? "",
    delivered_at: new Date().toISOString(),
  };
  payload.delivered_at = new Date().toISOString();

  const result = await deliverToEndpoint({ endpointUrl, timeoutMs, payload, simulateOnMissing: false });
  const attemptNumber = row.attempt_number + 1;
  const attemptRequestId = requestId(null);

  const { data: inserted, error: insertError } = await supabase
    .from("deliveries")
    .insert({
      opportunity_id: row.opportunity_id,
      campaign_id: row.campaign_id,
      auction_run_id: row.auction_run_id,
      endpoint_id: row.endpoint_id,
      transaction_id: row.transaction_id,
      organization_id: row.organization_id,
      request_id: attemptRequestId,
      endpoint_url: result.endpoint_url ?? endpointUrl,
      attempt_number: attemptNumber,
      status: mapDeliveryStatus(result.status),
      response_code: result.http_status,
      latency_ms: result.latency_ms,
      request_snapshot_redacted: { payload },
      response_snapshot_redacted: {
        body: result.response_body_redacted,
        mode: result.mode,
        error: result.error_message,
        parent_delivery_id: row.id,
        // Marks this attempt as operator-initiated in the audit trail.
        replay: true,
        replayed_by: opts.actorUserId ?? null,
      },
      sent_at: new Date().toISOString(),
      accepted_at: result.status === "accepted" ? new Date().toISOString() : null,
      // A replay is a one-shot operator action; it does not re-enter the
      // automatic retry queue.
      next_attempt_at: null,
      max_attempts: row.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      last_error: result.error_message,
      sla_due_at: row.sla_due_at,
      delivery_mode: result.mode,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted) {
    return {
      ok: false,
      reason: "NOT_RECORDED",
      message: insertError?.message ?? "Replay attempt could not be recorded.",
    };
  }

  await supabase.from("audit_events").insert({
    actor_user_id: opts.actorUserId ?? null,
    actor_org_id: opts.actorOrgId ?? null,
    action: "delivery.replay",
    resource_type: "delivery",
    resource_id: inserted.id,
    reason: `Replay of delivery ${row.id}`,
    after_redacted: {
      parent_delivery_id: row.id,
      attempt_number: attemptNumber,
      status: mapDeliveryStatus(result.status),
      response_code: result.http_status,
      // Recorded so an auditor can see billing was deliberately untouched.
      billing_effect: "none",
    },
    request_id: attemptRequestId,
  });

  return {
    ok: true,
    deliveryId: inserted.id,
    attemptNumber,
    status: mapDeliveryStatus(result.status),
    httpStatus: result.http_status,
    accepted: result.status === "accepted",
  };
}
