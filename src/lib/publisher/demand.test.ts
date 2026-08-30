import { describe, it, expect } from "vitest";
import { quotePublisherRate } from "./demand";
import { publisherAmountCents, platformMarginCents, PUBLISHER_SHARE } from "./revenue-share";

describe("publisher revenue share", () => {
  it("floors, so a quoted rate is never above what is actually paid", () => {
    // 4500 * 0.85 = 3825 exactly; 4501 * 0.85 = 3825.85 -> 3825.
    expect(publisherAmountCents(4500)).toBe(3825);
    expect(publisherAmountCents(4501)).toBe(3825);
  });

  it("splits the whole price between publisher and platform with nothing lost", () => {
    for (const price of [1, 99, 100, 4500, 4501, 12345]) {
      expect(publisherAmountCents(price) + platformMarginCents(price)).toBe(price);
    }
  });

  it("never returns a negative or NaN amount for degenerate input", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(publisherAmountCents(bad)).toBe(0);
      expect(platformMarginCents(bad)).toBe(0);
    }
  });

  it("keeps the share where the database expects it", () => {
    // Guards against an edit here drifting from reserve_campaign_transaction.
    expect(PUBLISHER_SHARE).toBe(0.85);
  });
});

describe("quotePublisherRate", () => {
  it("quotes an exact rate for a fixed-price offer", () => {
    const r = quotePublisherRate({ pricing_mode: "fixed", price_cents: 4500, floor_cents: null });
    expect(r).toEqual({ cents: 3825, indicative: false });
  });

  it("quotes the floor as indicative for auction-style pricing", () => {
    for (const mode of ["floor", "bid", "auction"]) {
      const r = quotePublisherRate({ pricing_mode: mode, price_cents: null, floor_cents: 3000 });
      expect(r.cents).toBe(2550);
      expect(r.indicative).toBe(true);
    }
  });

  it("returns no rate when the offer prices per ping/post response", () => {
    const r = quotePublisherRate({ pricing_mode: "ping_post", price_cents: null, floor_cents: null });
    expect(r).toEqual({ cents: null, indicative: true });
  });

  it("prefers the fixed price over a floor when both are present", () => {
    const r = quotePublisherRate({ pricing_mode: "fixed", price_cents: 4500, floor_cents: 1000 });
    expect(r.cents).toBe(3825);
    expect(r.indicative).toBe(false);
  });

  it("falls back to the floor when a fixed offer is missing its price", () => {
    const r = quotePublisherRate({ pricing_mode: "fixed", price_cents: null, floor_cents: 2000 });
    expect(r.cents).toBe(1700);
    expect(r.indicative).toBe(true);
  });
});
