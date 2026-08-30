import { describe, expect, it } from "vitest";
import {
  BID_EXPIRATION_MS,
  bidExpiresAt,
  hasConsentEvidence,
  postStatusForTransaction,
} from "./ping-post";

describe("native Ping/Post invariants", () => {
  it("uses a 30-second bid window", () => {
    expect(BID_EXPIRATION_MS).toBe(30_000);
    expect(bidExpiresAt("2026-08-30T00:00:00.000Z").toISOString()).toBe(
      "2026-08-30T00:00:30.000Z",
    );
  });

  it("requires non-empty consent evidence before POST delivery", () => {
    expect(hasConsentEvidence(undefined)).toBe(false);
    expect(hasConsentEvidence({})).toBe(false);
    expect(hasConsentEvidence({ certificate_url: "https://example.com/cert" })).toBe(true);
  });

  it("reports only charged or settled transactions as accepted", () => {
    expect(postStatusForTransaction("charged")).toBe("accepted");
    expect(postStatusForTransaction("settled")).toBe("accepted");
    expect(postStatusForTransaction("reserved")).toBe("delivered");
  });

  it("reports released reservations as rejected", () => {
    expect(postStatusForTransaction("returned")).toBe("rejected");
  });
});
