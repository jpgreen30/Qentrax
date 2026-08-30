import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { generateHmacSignature, verifyWebhookSignature } from "./webhooks";
import type { WebhookEvent } from "./webhooks";
import {
  checkOutboundUrl,
  isPrivateAddress,
  isLoopbackAddress,
  isLinkLocalAddress,
} from "@/lib/security/outbound-url";

/**
 * Behavioral coverage for webhook signing and outbound destination safety.
 *
 * This file previously held 150 placeholder assertions that asserted a literal
 * truth and exercised nothing. Webhooks are now on the delivery critical path,
 * so that coverage has been replaced with real tests of the security properties
 * Phase 7 requires.
 */
const SECRET = "whsec_test_secret";

function event(over: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "evt_1",
    event_type: "lead.delivered",
    organization_id: "org_1",
    payload: { transaction_id: "txn_1", amount_cents: 4500 },
    created_at: "2026-08-30T00:00:00.000Z",
    ...over,
  } as WebhookEvent;
}

describe("HMAC signing", () => {
  it("produces a sha256-prefixed hex digest", () => {
    const sig = generateHmacSignature(event(), SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("is deterministic for the same event and secret", () => {
    expect(generateHmacSignature(event(), SECRET)).toBe(generateHmacSignature(event(), SECRET));
  });

  it("changes when the payload changes", () => {
    const a = generateHmacSignature(event(), SECRET);
    const b = generateHmacSignature(event({ payload: { transaction_id: "txn_2" } }), SECRET);
    expect(a).not.toBe(b);
  });

  it("changes when the secret changes", () => {
    expect(generateHmacSignature(event(), SECRET)).not.toBe(
      generateHmacSignature(event(), "different_secret"),
    );
  });

  it("matches an independently computed HMAC of the serialized event", () => {
    const payload = JSON.stringify(event());
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(generateHmacSignature(event(), SECRET)).toBe(`sha256=${expected}`);
  });
});

describe("signature verification", () => {
  const payload = JSON.stringify(event());
  const valid = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

  it("accepts a correct signature", () => {
    expect(verifyWebhookSignature(payload, `sha256=${valid}`, SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(verifyWebhookSignature(payload + " ", `sha256=${valid}`, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const forged = crypto.createHmac("sha256", "wrong").update(payload).digest("hex");
    expect(verifyWebhookSignature(payload, `sha256=${forged}`, SECRET)).toBe(false);
  });

  it("rejects a single flipped character", () => {
    const flipped = (valid[0] === "a" ? "b" : "a") + valid.slice(1);
    expect(verifyWebhookSignature(payload, `sha256=${flipped}`, SECRET)).toBe(false);
  });

  it("rejects a malformed or unprefixed signature without throwing", () => {
    for (const sig of ["", valid, `md5=${valid}`, "sha256=", `sha256=${valid}=extra`]) {
      expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(false);
    }
  });

  it("rejects a truncated digest rather than crashing on unequal lengths", () => {
    // timingSafeEqual throws on differing lengths; the guard must catch it first.
    expect(() => verifyWebhookSignature(payload, `sha256=${valid.slice(0, 30)}`, SECRET))
      .not.toThrow();
    expect(verifyWebhookSignature(payload, `sha256=${valid.slice(0, 30)}`, SECRET)).toBe(false);
  });

  it("rejects a non-hex digest of the correct length", () => {
    expect(verifyWebhookSignature(payload, `sha256=${"z".repeat(64)}`, SECRET)).toBe(false);
  });
});

describe("outbound destination safety (SSRF)", () => {
  it("allows an ordinary public https endpoint", () => {
    const r = checkOutboundUrl("https://buyer.example.com/leads");
    expect(r.ok).toBe(true);
  });

  it("blocks non-http protocols", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "gopher://example.com/",
      "data:text/plain,hello",
    ]) {
      const r = checkOutboundUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("UNSUPPORTED_PROTOCOL");
    }
  });

  it("blocks cloud instance metadata", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ]) {
      const r = checkOutboundUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["METADATA_ADDRESS", "LINK_LOCAL_ADDRESS"]).toContain(r.reason);
    }
  });

  it("blocks private ranges", () => {
    for (const host of ["10.0.0.5", "172.16.4.1", "172.31.255.254", "192.168.1.1", "100.64.0.1"]) {
      const r = checkOutboundUrl(`http://${host}/hook`);
      expect(r.ok, `${host} should be blocked`).toBe(false);
    }
  });

  it("allows public addresses adjacent to private ranges", () => {
    for (const host of ["172.15.0.1", "172.32.0.1", "11.0.0.1", "192.169.0.1"]) {
      expect(checkOutboundUrl(`https://${host}/hook`).ok, `${host} should be allowed`).toBe(true);
    }
  });

  it("blocks loopback and localhost by default", () => {
    const previous = process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
    delete process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
    try {
      for (const url of ["http://127.0.0.1:9000/x", "http://localhost:3000/x", "http://[::1]/x"]) {
        const r = checkOutboundUrl(url);
        expect(r.ok, `${url} should be blocked`).toBe(false);
      }
    } finally {
      if (previous !== undefined) process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = previous;
    }
  });

  it("permits loopback only when explicitly opted in outside production", () => {
    const prevAllow = process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
    const prevForce = process.env.QENTRAX_FORCE_PRODUCTION;
    try {
      process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = "1";
      delete process.env.QENTRAX_FORCE_PRODUCTION;
      expect(checkOutboundUrl("http://127.0.0.1:4010/hook").ok).toBe(true);

      // The opt-in must not survive a production posture.
      process.env.QENTRAX_FORCE_PRODUCTION = "1";
      expect(checkOutboundUrl("http://127.0.0.1:4010/hook").ok).toBe(false);
    } finally {
      if (prevAllow !== undefined) process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY = prevAllow;
      else delete process.env.QENTRAX_ALLOW_LOOPBACK_DELIVERY;
      if (prevForce !== undefined) process.env.QENTRAX_FORCE_PRODUCTION = prevForce;
      else delete process.env.QENTRAX_FORCE_PRODUCTION;
    }
  });

  it("blocks credentials embedded in the URL, which leak through logs", () => {
    const r = checkOutboundUrl("https://user:pass@buyer.example.com/hook");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("CREDENTIALS_IN_URL");
  });

  it("rejects empty and unparseable URLs", () => {
    for (const url of ["", "   ", "not-a-url", "http://"]) {
      expect(checkOutboundUrl(url).ok).toBe(false);
    }
  });

  it("classifies address families correctly", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.255.255.254")).toBe(true);
    expect(isLoopbackAddress("128.0.0.1")).toBe(false);
    expect(isLinkLocalAddress("169.254.1.1")).toBe(true);
    expect(isLinkLocalAddress("169.253.1.1")).toBe(false);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
