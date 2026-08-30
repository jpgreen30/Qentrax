/**
 * Delivery retry worker — claim due attempts, POST buyer endpoints, schedule backoff.
 * Production never simulates acceptance.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowSimulatedDelivery } from "@/lib/env";
import { deliverToEndpoint, type DeliveryPayload } from "./http-delivery";
import { requestId } from "@/lib/request-id";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_SLA_MINUTES = 30;
export const DEFAULT_TIMEOUT_MS = 8_000;

export function mapDeliveryStatus(
  status: "accepted" | "rejected" | "timeout" | "error",
): "accepted" | "rejected" | "timed_out" | "failed" {
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "timeout") return "timed_out";
  return "failed";
}

export function isRetryable(opts: {
  status: "accepted" | "rejected" | "timeout" | "error";
  http_status: number | null;
  mode?: string;
}): boolean {
  if (opts.status === "accepted") return false;
  if (opts.mode === "config_error") return false; // terminal — fix config
  if (opts.status === "timeout" || opts.status === "error") return true;
  const code = opts.http_status ?? 0;
  if (code === 408 || code === 429) return true;
  if (code >= 500 && code <= 599) return true;
  return false;
}

export function computeBackoffMs(attemptNumber: number): number {
  const base = 30_000;
  const ms = base * Math.pow(4, Math.max(0, attemptNumber - 1));
  return Math.min(ms, 60 * 60 * 1000);
}

export type EnqueueDeliveryInput = {
  opportunityId: string;
  campaignId: string;
  auctionRunId: string;
  transactionId?: string | null;
  endpointId?: string | null;
  endpointUrl?: string | null;
  timeoutMs?: number;
  payload: DeliveryPayload;
  /** Only honored in non-production when explicitly true */
  simulateOnMissing?: boolean;
  maxAttempts?: number;
  slaMinutes?: number;
  requestId?: string | null;
};

export type EnqueueDeliveryResult = {
  deliveryId: string;
  attemptNumber: number;
  status: string;
  mode: string;
  willRetry: boolean;
  nextAttemptAt: string | null;
  reason_code?: string;
};

export async function enqueueAndAttemptDelivery(
  supabase: SupabaseClient,
  input: EnqueueDeliveryInput,
): Promise<EnqueueDeliveryResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const slaMinutes = input.slaMinutes ?? DEFAULT_SLA_MINUTES;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attemptNumber = 1;
  const slaDue = new Date(Date.now() + slaMinutes * 60_000).toISOString();

  // Production: never simulate
  const simulate =
    allowSimulatedDelivery() && input.simulateOnMissing === true;

  const result = await deliverToEndpoint({
    endpointUrl: input.endpointUrl,
    timeoutMs,
    payload: input.payload,
    simulateOnMissing: simulate,
  });

  const dbStatus = mapDeliveryStatus(result.status);
  const retryable =
    result.mode === "http" &&
    isRetryable({
      status: result.status,
      http_status: result.http_status,
      mode: result.mode,
    }) &&
    attemptNumber < maxAttempts;

  const nextAttemptAt = retryable
    ? new Date(Date.now() + computeBackoffMs(attemptNumber)).toISOString()
    : null;

  const { data: row, error } = await supabase
    .from("deliveries")
    .insert({
      opportunity_id: input.opportunityId,
      campaign_id: input.campaignId,
      auction_run_id: input.auctionRunId,
      endpoint_id: input.endpointId ?? null,
      transaction_id: input.transactionId ?? null,
      endpoint_url: result.endpoint_url ?? input.endpointUrl ?? null,
      attempt_number: attemptNumber,
      status: dbStatus,
      request_id: input.requestId ?? null,
      response_code: result.http_status,
      latency_ms: result.latency_ms,
      response_snapshot_redacted: {
        body: result.response_body_redacted,
        mode: result.mode,
        error: result.error_message,
        reason_code: result.reason_code,
      },
      request_snapshot_redacted: {
        // Do not store full PII attributes in delivery snapshots
        payload: {
          transaction_id: input.payload.transaction_id,
          public_transaction_id: input.payload.public_transaction_id,
          opportunity_id: input.payload.opportunity_id,
          campaign_id: input.payload.campaign_id,
          vertical: input.payload.vertical,
          state: input.payload.state,
          advertiser_price_cents: input.payload.advertiser_price_cents,
          delivered_at: input.payload.delivered_at,
        },
      },
      delivered_at: result.status === "accepted" ? new Date().toISOString() : null,
      next_attempt_at: nextAttemptAt,
      max_attempts: maxAttempts,
      last_error: result.error_message,
      sla_due_at: slaDue,
      delivery_mode: result.mode,
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Failed to insert delivery row");
  }

  return {
    deliveryId: row.id,
    attemptNumber,
    status: dbStatus,
    mode: result.mode,
    willRetry: Boolean(nextAttemptAt),
    nextAttemptAt,
    reason_code: result.reason_code,
  };
}

type DueRow = {
  id: string;
  opportunity_id: string;
  campaign_id: string;
  auction_run_id: string;
  transaction_id: string | null;
  endpoint_id: string | null;
  endpoint_url: string | null;
  attempt_number: number;
  max_attempts: number;
  sla_due_at: string | null;
  request_snapshot_redacted: { payload?: DeliveryPayload } | null;
  organization_id?: string | null;
};

export type RetryBatchResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
  exhausted: number;
  slaBreached: number;
  errors: string[];
};

export async function processDueDeliveries(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<RetryBatchResult> {
  const limit = opts?.limit ?? 20;
  const nowIso = new Date().toISOString();
  const out: RetryBatchResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    exhausted: 0,
    slaBreached: 0,
    errors: [],
  };

  const { data: due, error } = await supabase
    .from("deliveries")
    .select(
      "id, opportunity_id, campaign_id, auction_run_id, transaction_id, endpoint_id, endpoint_url, attempt_number, max_attempts, sla_due_at, request_snapshot_redacted, organization_id",
    )
    .in("status", ["rejected", "timed_out", "failed", "acknowledged"])
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (error) {
    out.errors.push(error.message);
    return out;
  }

  const rows = (due ?? []) as DueRow[];
  out.claimed = rows.length;

  for (const row of rows) {
    try {
      await supabase.from("deliveries").update({ next_attempt_at: null }).eq("id", row.id);

      const slaBreached = row.sla_due_at ? new Date(row.sla_due_at).getTime() < Date.now() : false;
      if (slaBreached) out.slaBreached += 1;

      let endpointUrl = row.endpoint_url;
      let timeoutMs = DEFAULT_TIMEOUT_MS;

      if (!endpointUrl && row.campaign_id) {
        const { data: ep } = await supabase
          .from("campaign_endpoints")
          .select("endpoint_url, timeout_ms")
          .eq("campaign_id", row.campaign_id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        endpointUrl = ep?.endpoint_url ?? null;
        if (ep?.timeout_ms) timeoutMs = Number(ep.timeout_ms);
      }

      const payload: DeliveryPayload = row.request_snapshot_redacted?.payload ?? {
        transaction_id: row.transaction_id ?? "",
        opportunity_id: row.opportunity_id,
        campaign_id: row.campaign_id,
        delivered_at: new Date().toISOString(),
      };
      payload.delivered_at = new Date().toISOString();

      const nextAttempt = row.attempt_number + 1;
      const result = await deliverToEndpoint({
        endpointUrl,
        timeoutMs,
        payload,
        simulateOnMissing: false,
      });

      const dbStatus = mapDeliveryStatus(result.status);
      const underMax = nextAttempt < (row.max_attempts ?? DEFAULT_MAX_ATTEMPTS);
      const retryable =
        !slaBreached &&
        underMax &&
        isRetryable({
          status: result.status,
          http_status: result.http_status,
          mode: result.mode,
        });

      const nextAttemptAt = retryable
        ? new Date(Date.now() + computeBackoffMs(nextAttempt)).toISOString()
        : null;

      // deliveries.request_id is NOT NULL with no default. This insert
      // previously omitted it and never checked the returned error, so every
      // retry attempt was silently discarded: the worker made the HTTP request,
      // threw the outcome away, and — because next_attempt_at was already
      // cleared above — the delivery was dropped after one attempt with no
      // record, no retry and no dead-letter.
      const attemptRequestId = requestId(null);
      const { error: attemptError } = await supabase.from("deliveries").insert({
        opportunity_id: row.opportunity_id,
        campaign_id: row.campaign_id,
        auction_run_id: row.auction_run_id,
        endpoint_id: row.endpoint_id,
        transaction_id: row.transaction_id,
        organization_id: row.organization_id ?? null,
        request_id: attemptRequestId,
        endpoint_url: result.endpoint_url ?? endpointUrl,
        attempt_number: nextAttempt,
        status: dbStatus,
        response_code: result.http_status,
        latency_ms: result.latency_ms,
        response_snapshot_redacted: {
          body: result.response_body_redacted,
          mode: result.mode,
          error: result.error_message,
          parent_delivery_id: row.id,
          sla_breached: slaBreached,
          reason_code: result.reason_code,
        },
        request_snapshot_redacted: { payload },
        // The schema records sent_at/accepted_at; there is no delivered_at
        // column, and writing one made every insert fail.
        sent_at: new Date().toISOString(),
        accepted_at: result.status === "accepted" ? new Date().toISOString() : null,
        next_attempt_at: nextAttemptAt,
        max_attempts: row.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
        last_error: result.error_message,
        sla_due_at: row.sla_due_at,
        delivery_mode: result.mode,
      });

      if (attemptError) {
        // The attempt happened but could not be recorded. Restore the schedule
        // so the delivery is retried rather than lost, and surface the failure
        // instead of reporting a clean batch.
        out.errors.push(`attempt not recorded (${row.id}): ${attemptError.message}`);
        if (nextAttemptAt) {
          await supabase
            .from("deliveries")
            .update({ next_attempt_at: nextAttemptAt })
            .eq("id", row.id);
        }
        out.failed += 1;
        continue;
      }

      if (result.status === "accepted") {
        out.succeeded += 1;
      } else if (retryable) {
        out.retried += 1;
        out.failed += 1;
      } else {
        out.exhausted += 1;
        out.failed += 1;
      }
    } catch (e) {
      out.errors.push(e instanceof Error ? e.message : String(e));
      out.failed += 1;
    }
  }

  return out;
}
