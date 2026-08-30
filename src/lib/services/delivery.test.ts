import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverToEndpoint, type DeliveryPayload } from "../delivery/http-delivery";
import { computeBackoffMs, isRetryable, mapDeliveryStatus } from "../delivery/retry";

const payload: DeliveryPayload = {
  transaction_id: "txn-1",
  public_transaction_id: "QX-1",
  opportunity_id: "opp-1",
  campaign_id: "campaign-1",
  consumer: { email: "lead@example.com" },
  attributes: { state: "CA" },
  consent: { certificate_url: "https://example.com/cert" },
  advertiser_price_cents: 2500,
  delivered_at: "2026-08-30T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buyer HTTP delivery", () => {
  it("never simulates a missing endpoint in production", async () => {
    vi.stubEnv("QENTRAX_FORCE_PRODUCTION", "1");

    const result = await deliverToEndpoint({
      endpointUrl: null,
      payload,
      simulateOnMissing: true,
    });

    expect(result).toMatchObject({
      mode: "config_error",
      status: "error",
      reason_code: "DELIVERY_CONFIG_ERROR",
    });
  });

  it("sends the complete POST payload and accepts a 2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverToEndpoint({
      endpointUrl: "https://buyer.example/leads",
      payload,
      timeoutMs: 1000,
    });

    expect(result.status).toBe("accepted");
    expect(result.http_status).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request.body))).toEqual(payload);
  });

  it("treats a buyer 4xx response as a terminal rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid lead", { status: 422 })),
    );

    const result = await deliverToEndpoint({
      endpointUrl: "https://buyer.example/leads",
      payload,
    });

    expect(result).toMatchObject({
      status: "rejected",
      http_status: 422,
      reason_code: "DELIVERY_REJECTED",
    });
    expect(isRetryable({ status: result.status, http_status: result.http_status })).toBe(false);
  });

  it("marks network errors retryable without simulating acceptance", async () => {
    vi.stubEnv("QENTRAX_FORCE_PRODUCTION", "1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const result = await deliverToEndpoint({
      endpointUrl: "https://buyer.example/leads",
      payload,
      simulateOnMissing: true,
    });

    expect(result.status).toBe("error");
    expect(result.mode).toBe("http");
    expect(isRetryable({ status: result.status, http_status: result.http_status })).toBe(true);
  });
});

describe("delivery retry policy", () => {
  it("maps canonical database statuses", () => {
    expect(mapDeliveryStatus("accepted")).toBe("accepted");
    expect(mapDeliveryStatus("rejected")).toBe("rejected");
    expect(mapDeliveryStatus("timeout")).toBe("timed_out");
    expect(mapDeliveryStatus("error")).toBe("failed");
  });

  it("retries timeouts, 429, and 5xx but not config errors", () => {
    expect(isRetryable({ status: "timeout", http_status: null })).toBe(true);
    expect(isRetryable({ status: "rejected", http_status: 429 })).toBe(true);
    expect(isRetryable({ status: "rejected", http_status: 503 })).toBe(true);
    expect(isRetryable({ status: "error", http_status: null, mode: "config_error" })).toBe(false);
  });

  it("uses capped exponential backoff", () => {
    expect(computeBackoffMs(1)).toBe(30_000);
    expect(computeBackoffMs(2)).toBe(120_000);
    expect(computeBackoffMs(5)).toBe(3_600_000);
  });
});
