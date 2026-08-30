import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deliverToEndpoint } from "./http-delivery";
import { isRetryable, computeBackoffMs, mapDeliveryStatus, DEFAULT_MAX_ATTEMPTS } from "./retry";

/**
 * Behavioral coverage for webhook delivery against a controlled endpoint.
 *
 * These replace the placeholder assertions that stood in for this subsystem
 * while it was off the critical path. Delivery is now the mechanism the Golden
 * Path depends on, so it is exercised over real HTTP: a local server that can
 * accept, reject, fail, stall or return malformed bodies on demand.
 */
type Behavior =
  | { kind: "accept" }
  | { kind: "status"; code: number }
  | { kind: "stall"; ms: number }
  | { kind: "body"; code: number; body: string; contentType?: string };

let server: http.Server;
let baseUrl: string;
let behavior: Behavior = { kind: "accept" };
const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];

let previousLoopback: string | undefined;

beforeAll(async () => {
  // Delivering to a local controlled endpoint requires the explicit loopback
  // opt-in, which is exactly the contract the SSRF guard enforces.
  previousLoopback = process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
  process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = "1";

  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      const b = behavior;
      if (b.kind === "accept") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, lead_id: "buyer-123" }));
      }
      if (b.kind === "status") {
        res.writeHead(b.code, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "upstream" }));
      }
      if (b.kind === "body") {
        res.writeHead(b.code, { "Content-Type": b.contentType ?? "text/plain" });
        return res.end(b.body);
      }
      // stall: never respond within the timeout
      setTimeout(() => {
        try {
          res.writeHead(200);
          res.end("late");
        } catch {
          /* client already gone */
        }
      }, b.ms);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (previousLoopback !== undefined) {
    process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = previousLoopback;
  } else {
    delete process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function payload() {
  return {
    transaction_id: "txn-1",
    opportunity_id: "opp-1",
    campaign_id: "camp-1",
    vertical: "solar",
    state: "CA",
    delivered_at: new Date().toISOString(),
  };
}

describe("deliverToEndpoint over real HTTP", () => {
  it("accepts a 200 and records the endpoint and latency", async () => {
    behavior = { kind: "accept" };
    const r = await deliverToEndpoint({ endpointUrl: `${baseUrl}/hook`, payload: payload() });
    expect(r.mode).toBe("http");
    expect(r.status).toBe("accepted");
    expect(r.http_status).toBe(200);
    expect(r.endpoint_url).toBe(`${baseUrl}/hook`);
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    expect(r.error_message).toBeNull();
  });

  it("actually sends the payload as JSON to the endpoint", async () => {
    behavior = { kind: "accept" };
    received.length = 0;
    await deliverToEndpoint({ endpointUrl: `${baseUrl}/hook`, payload: payload() });

    expect(received).toHaveLength(1);
    const sent = JSON.parse(received[0].body);
    expect(sent.transaction_id).toBe("txn-1");
    expect(sent.campaign_id).toBe("camp-1");
    expect(String(received[0].headers["content-type"])).toContain("application/json");
  });

  it("passes custom headers through to the destination", async () => {
    behavior = { kind: "accept" };
    received.length = 0;
    await deliverToEndpoint({
      endpointUrl: `${baseUrl}/hook`,
      payload: payload(),
      headers: { "X-Api-Key": "secret-value" },
    });
    expect(received[0].headers["x-api-key"]).toBe("secret-value");
  });

  it("treats a 500 as a failure rather than an acceptance", async () => {
    behavior = { kind: "status", code: 500 };
    const r = await deliverToEndpoint({ endpointUrl: `${baseUrl}/hook`, payload: payload() });
    expect(r.status).not.toBe("accepted");
    expect(r.http_status).toBe(500);
  });

  it("treats a 4xx as a rejection, not a transport error", async () => {
    behavior = { kind: "status", code: 422 };
    const r = await deliverToEndpoint({ endpointUrl: `${baseUrl}/hook`, payload: payload() });
    expect(r.http_status).toBe(422);
    expect(r.status).not.toBe("accepted");
  });

  it("times out rather than hanging when the buyer stalls", async () => {
    behavior = { kind: "stall", ms: 5_000 };
    const started = Date.now();
    const r = await deliverToEndpoint({
      endpointUrl: `${baseUrl}/hook`,
      payload: payload(),
      timeoutMs: 300,
    });
    expect(r.status).toBe("timeout");
    // The bound must actually be enforced, not merely declared.
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("reports an unreachable endpoint as an error without throwing", async () => {
    behavior = { kind: "accept" };
    // Port 1 refuses connections; loopback is permitted for this suite.
    const r = await deliverToEndpoint({
      endpointUrl: "http://127.0.0.1:1/hook",
      payload: payload(),
      timeoutMs: 1_000,
    });
    expect(r.status).toBe("error");
    expect(r.error_message).toBeTruthy();
  });

  it("survives a non-JSON body from the buyer", async () => {
    behavior = { kind: "body", code: 200, body: "<html>thanks</html>", contentType: "text/html" };
    const r = await deliverToEndpoint({ endpointUrl: `${baseUrl}/hook`, payload: payload() });
    expect(r.http_status).toBe(200);
    expect(r.status).toBe("accepted");
  });

  it("refuses to deliver to a private or metadata address", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/hook",
      "file:///etc/passwd",
    ]) {
      const r = await deliverToEndpoint({ endpointUrl: url, payload: payload() });
      expect(r.mode, `${url} must not be attempted`).toBe("config_error");
      expect(r.status).not.toBe("accepted");
      expect(r.http_status).toBeNull();
    }
  });

  it("does not accept when no endpoint is configured and simulation is not requested", async () => {
    const r = await deliverToEndpoint({ endpointUrl: null, payload: payload() });
    expect(r.mode).toBe("config_error");
    expect(r.status).not.toBe("accepted");
  });
});

describe("retry classification", () => {
  it("never retries an accepted delivery", () => {
    expect(isRetryable({ status: "accepted", http_status: 200 })).toBe(false);
  });

  it("retries transport failures and timeouts", () => {
    expect(isRetryable({ status: "timeout", http_status: null })).toBe(true);
    expect(isRetryable({ status: "error", http_status: null })).toBe(true);
  });

  it("retries 5xx, 408 and 429", () => {
    for (const code of [500, 502, 503, 504, 408, 429]) {
      expect(isRetryable({ status: "rejected", http_status: code })).toBe(true);
    }
  });

  it("does not retry a deterministic 4xx, which would fail identically", () => {
    for (const code of [400, 401, 403, 404, 422]) {
      expect(isRetryable({ status: "rejected", http_status: code })).toBe(false);
    }
  });

  it("treats a configuration error as terminal", () => {
    expect(isRetryable({ status: "error", http_status: null, mode: "config_error" })).toBe(false);
  });
});

describe("backoff schedule", () => {
  it("grows exponentially from 30 seconds", () => {
    expect(computeBackoffMs(1)).toBe(30_000);
    expect(computeBackoffMs(2)).toBe(120_000);
    expect(computeBackoffMs(3)).toBe(480_000);
  });

  it("is bounded at one hour so a dead buyer cannot push retries indefinitely", () => {
    for (const attempt of [5, 10, 100]) {
      expect(computeBackoffMs(attempt)).toBe(3_600_000);
    }
  });

  it("is monotonic and never negative", () => {
    let previous = 0;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const ms = computeBackoffMs(attempt);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeGreaterThanOrEqual(previous);
      previous = ms;
    }
  });

  it("exhausts within a bounded wall-clock window at the default attempt cap", () => {
    let total = 0;
    for (let attempt = 1; attempt < DEFAULT_MAX_ATTEMPTS; attempt += 1) {
      total += computeBackoffMs(attempt);
    }
    // Five attempts must not stretch past a few hours.
    expect(total).toBeLessThan(4 * 3_600_000);
  });
});

describe("delivery status mapping", () => {
  it("maps each attempt outcome to a persisted delivery state", () => {
    expect(mapDeliveryStatus("accepted")).toBe("accepted");
    expect(mapDeliveryStatus("rejected")).toBe("rejected");
    expect(mapDeliveryStatus("timeout")).toBe("timed_out");
    expect(mapDeliveryStatus("error")).toBe("failed");
  });

  it("produces only states the deliveries CHECK constraint allows", () => {
    const allowed = ["pending", "sent", "acknowledged", "accepted", "rejected", "timed_out", "failed"];
    for (const s of ["accepted", "rejected", "timeout", "error"] as const) {
      expect(allowed).toContain(mapDeliveryStatus(s));
    }
  });
});
