/**
 * Delivery retry worker — claim due attempts, POST buyer endpoints, schedule backoff.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverToEndpoint, type DeliveryPayload } from "./http-delivery";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_SLA_MINUTES = 30;
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Map HTTP attempt status → deliveries.status enum */
export function mapDeliveryStatus(
  status: "accepted" | "rejected" | "timeout" | "error",
): "accepted" | "rejected" | "timed_out" | "failed" {
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "timeout") return "timed_out";
  return "failed";
}

/** Transient failures that should retry */
export function isRetryable(opts: {
  status: "accepted" | "rejected" | "timeout" | "error";
  http_status: number | null;
}): boolean {
  if (opts.status === "accepted") return false;
  if (opts.status === "timeout" || opts.status === "error") return true;
  const code = opts.http_status ?? 0;
  if (code === 408 || code === 429) return true;
  if (code >= 500 && code <= 599) return true;
  // other 4xx = terminal
  return false;
}

/** Exponential backoff: 30s, 2m, 8m, 32m, … capped at 1h */
export function computeBackoffMs(attemptNumber: number): number {
  const base = 30_000;
  const ms = base * Math.pow(4, Math.max(0, attemptNumber - 1));
  return Math.min(ms, 60 * 60 * 1000);
}

export type EnqueueDeliveryInput = {
  opportunityId: string;
  campaignId: string;
  transactionId?: string | null;
  endpointId?: string | null;
  endpointUrl?: string | null;
  timeoutMs?: number;
  payload: DeliveryPayload;
  /** First attempt simulate-on-missing (auction path default true) */
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
};

/**
 * Run one delivery attempt and persist a deliveries row.
 * Schedules next_attempt_at when retryable and under max_attempts.
 */
export async function enqueueAndAttemptDelivery(
  supabase: SupabaseClient,
  input: EnqueueDeliveryInput,
): Promise<EnqueueDeliveryResult> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const slaMinutes = input.slaMinutes ?? DEFAULT_SLA_MINUTES;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attemptNumber = 1;
  const slaDue = new Date(Date.now() + slaMinutes * 60_000).toISOString();

  const result = await deliverToEndpoint({
    endpointUrl: input.endpointUrl,
    timeoutMs,
    payload: input.payload,
    simulateOnMissing: input.simulateOnMissing !== false,
  });

  const dbStatus = mapDeliveryStatus(result.status);
  const retryable =
    result.mode === "http" &&
    isRetryable({ status: result.status, http_status: result.http_status }) &&
    attemptNumber < maxAttempts;

  const nextAttemptAt = retryable
    ? new Date(Date.now() + computeBackoffMs(attemptNumber)).toISOString()
    : null;

  const { data: row, error } = await supabase
    .from("deliveries")
    .insert({
      opportunity_id: input.opportunityId,
      campaign_id: input.campaignId,
      endpoint_id: input.endpointId ?? null,
      transaction_id: input.transactionId ?? null,
      endpoint_url: result.endpoint_url ?? input.endpointUrl ?? null,
      attempt_number: attemptNumber,
      status: result.mode === "simulated" && result.status === "accepted" ? "accepted" : dbStatus,
      request_id: input.requestId ?? null,
      response_code: result.http_status,
      latency_ms: result.latency_ms,
      response_snapshot_redacted: {
        body: result.response_body_redacted,
        mode: result.mode,
        error: result.error_message,
      },
      request_snapshot_redacted: {
        payload: input.payload,
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
  };
}

type DueRow = {
  id: string;
  opportunity_id: string;
  campaign_id: string;
  transaction_id: string | null;
  endpoint_id: string | null;
  endpoint_url: string | null;
  attempt_number: number;
  max_attempts: number;
  sla_due_at: string | null;
  request_snapshot_redacted: { payload?: DeliveryPayload } | null;
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

/**
 * Process up to `limit` due delivery retries (service-role client).
 */
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
      "id, opportunity_id, campaign_id, transaction_id, endpoint_id, endpoint_url, attempt_number, max_attempts, sla_due_at, request_snapshot_redacted",
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
      // Clear claim so concurrent workers skip (best-effort)
      await supabase
        .from("deliveries")
        .update({ next_attempt_at: null })
        .eq("id", row.id);

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
        isRetryable({ status: result.status, http_status: result.http_status });

      const nextAttemptAt = retryable
        ? new Date(Date.now() + computeBackoffMs(nextAttempt)).toISOString()
        : null;

      await supabase.from("deliveries").insert({
        opportunity_id: row.opportunity_id,
        campaign_id: row.campaign_id,
        endpoint_id: row.endpoint_id,
        transaction_id: row.transaction_id,
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
        },
        request_snapshot_redacted: { payload },
        delivered_at: result.status === "accepted" ? new Date().toISOString() : null,
        next_attempt_at: nextAttemptAt,
        max_attempts: row.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
        last_error: result.error_message,
        sla_due_at: row.sla_due_at,
        delivery_mode: result.mode,
      });

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
