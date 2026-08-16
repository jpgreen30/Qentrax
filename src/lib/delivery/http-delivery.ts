/**
 * Buyer endpoint delivery — real HTTP POST.
 * Simulated acceptance is FORBIDDEN in production (see allowSimulatedDelivery).
 */

import { allowSimulatedDelivery } from "@/lib/env";
import { redactText } from "@/lib/redact";

export type DeliveryPayload = {
  transaction_id: string;
  public_transaction_id?: string;
  opportunity_id: string;
  campaign_id: string;
  vertical?: string | null;
  state?: string | null;
  attributes?: Record<string, unknown>;
  advertiser_price_cents?: number | null;
  delivered_at: string;
};

export type DeliveryAttemptResult = {
  mode: "http" | "simulated" | "config_error";
  status: "accepted" | "rejected" | "timeout" | "error";
  http_status: number | null;
  latency_ms: number;
  endpoint_url: string | null;
  response_body_redacted: string | null;
  error_message: string | null;
  reason_code?: string;
};

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * POST payload to buyer endpoint.
 * Production + missing endpoint → DELIVERY_CONFIG_ERROR (not accepted).
 * Simulation only when allowSimulatedDelivery() is true AND caller opts in.
 */
export async function deliverToEndpoint(opts: {
  endpointUrl: string | null | undefined;
  timeoutMs?: number;
  payload: DeliveryPayload;
  /** Only honored when allowSimulatedDelivery() is true */
  simulateOnMissing?: boolean;
  headers?: Record<string, string>;
}): Promise<DeliveryAttemptResult> {
  const simAllowed = allowSimulatedDelivery() && opts.simulateOnMissing === true;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = (opts.endpointUrl ?? "").trim();

  if (!url) {
    if (simAllowed) {
      return {
        mode: "simulated",
        status: "accepted",
        http_status: 200,
        latency_ms: 1,
        endpoint_url: null,
        response_body_redacted: JSON.stringify({ simulated: true, accepted: true }),
        error_message: null,
        reason_code: "DELIVERY_SIMULATED",
      };
    }
    return {
      mode: "config_error",
      status: "error",
      http_status: null,
      latency_ms: 0,
      endpoint_url: null,
      response_body_redacted: null,
      error_message: "No endpoint URL configured for campaign.",
      reason_code: "DELIVERY_CONFIG_ERROR",
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Qentrax-Delivery/1.0",
        accept: "application/json, text/plain, */*",
        ...(opts.headers ?? {}),
      },
      body: JSON.stringify(opts.payload),
      signal: controller.signal,
    });
    const latency_ms = Date.now() - started;
    const text = await res.text().catch(() => "");
    const ok = res.status >= 200 && res.status < 300;
    return {
      mode: "http",
      status: ok ? "accepted" : "rejected",
      http_status: res.status,
      latency_ms,
      endpoint_url: url,
      response_body_redacted: redactText(text),
      error_message: ok ? null : `HTTP ${res.status}`,
      reason_code: ok ? undefined : "DELIVERY_REJECTED",
    };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    // Never simulate-accept network failures in production
    if (simAllowed) {
      return {
        mode: "simulated",
        status: "accepted",
        http_status: null,
        latency_ms,
        endpoint_url: url,
        response_body_redacted: JSON.stringify({
          simulated: true,
          accepted: true,
          note: aborted ? "timeout_fallback" : "network_fallback",
        }),
        error_message: aborted ? "timeout — simulated accept" : String(err),
        reason_code: "DELIVERY_SIMULATED",
      };
    }
    return {
      mode: "http",
      status: aborted ? "timeout" : "error",
      http_status: null,
      latency_ms,
      endpoint_url: url,
      response_body_redacted: null,
      error_message: aborted
        ? "Request timed out"
        : err instanceof Error
          ? err.message
          : String(err),
      reason_code: aborted ? "DELIVERY_TIMEOUT" : "DELIVERY_ERROR",
    };
  } finally {
    clearTimeout(timer);
  }
}
