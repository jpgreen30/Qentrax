/**
 * Buyer endpoint delivery — real HTTP POST with simulation fallback.
 * Used after auction when a campaign has an active campaign_endpoints row,
 * or via POST /api/v1/deliveries for manual re-delivery.
 */

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
  mode: "http" | "simulated";
  status: "accepted" | "rejected" | "timeout" | "error";
  http_status: number | null;
  latency_ms: number;
  endpoint_url: string | null;
  response_body_redacted: string | null;
  error_message: string | null;
};

const DEFAULT_TIMEOUT_MS = 8_000;

function redact(body: string, max = 500): string {
  const trimmed = body.slice(0, max);
  return trimmed
    .replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "[email]")
    .replace(/("?((?:api[_-]?key|token|authorization))"?\s*[:=]\s*")[^"]+"/gi, '$1[redacted]"');
}

/**
 * POST payload to buyer endpoint. On missing URL or network failure with
 * simulate=true, returns a simulated accept (legacy auction behavior).
 */
export async function deliverToEndpoint(opts: {
  endpointUrl: string | null | undefined;
  timeoutMs?: number;
  payload: DeliveryPayload;
  /** When true (default), missing/failed endpoints still count as accepted simulation */
  simulateOnMissing?: boolean;
  headers?: Record<string, string>;
}): Promise<DeliveryAttemptResult> {
  const simulateOnMissing = opts.simulateOnMissing !== false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = (opts.endpointUrl ?? "").trim();

  if (!url) {
    if (!simulateOnMissing) {
      return {
        mode: "simulated",
        status: "error",
        http_status: null,
        latency_ms: 0,
        endpoint_url: null,
        response_body_redacted: null,
        error_message: "No endpoint URL configured for campaign.",
      };
    }
    return {
      mode: "simulated",
      status: "accepted",
      http_status: 200,
      latency_ms: 1,
      endpoint_url: null,
      response_body_redacted: JSON.stringify({ simulated: true, accepted: true }),
      error_message: null,
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
      response_body_redacted: redact(text),
      error_message: ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    if (simulateOnMissing) {
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
      };
    }
    return {
      mode: "http",
      status: aborted ? "timeout" : "error",
      http_status: null,
      latency_ms,
      endpoint_url: url,
      response_body_redacted: null,
      error_message: aborted ? "Request timed out" : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
