import { describe, it, expect } from "vitest";
import {
  DISPOSITIONS,
  isDisposition,
  carriesRevenue,
  isNegative,
  funnelRank,
} from "./dispositions";

/**
 * Replaces the 135 placeholder assertions that stood in for conversion
 * tracking. Conversions now feed revenue and ROAS, so the vocabulary and its
 * revenue rules are covered directly; the write path is exercised against the
 * live database in retry-lifecycle's companion suite.
 */
describe("disposition vocabulary", () => {
  it("covers every outcome the checklist requires", () => {
    for (const required of [
      "received", "contacted", "qualified", "quoted", "appointment",
      "application", "sale", "duplicate", "invalid", "returned",
    ]) {
      expect(DISPOSITIONS).toContain(required);
    }
  });

  it("rejects anything outside the vocabulary", () => {
    for (const bad of ["won", "closed", "SALE", "", null, undefined, 7]) {
      expect(isDisposition(bad)).toBe(false);
    }
    expect(isDisposition("sale")).toBe(true);
  });

  it("treats only a sale as revenue-bearing", () => {
    expect(carriesRevenue("sale")).toBe(true);
    for (const d of ["received", "contacted", "qualified", "quoted", "appointment", "application"] as const) {
      expect(carriesRevenue(d)).toBe(false);
    }
  });

  it("classifies negative outcomes that can support a return", () => {
    expect(isNegative("duplicate")).toBe(true);
    expect(isNegative("invalid")).toBe(true);
    expect(isNegative("returned")).toBe(true);
    expect(isNegative("sale")).toBe(false);
  });

  it("orders the funnel so a regression is detectable", () => {
    expect(funnelRank("received")).toBeLessThan(funnelRank("contacted"));
    expect(funnelRank("qualified")).toBeLessThan(funnelRank("sale"));
    expect(funnelRank("sale")).toBeGreaterThan(funnelRank("appointment"));
  });

  it("places negative outcomes outside the funnel ladder", () => {
    for (const d of ["duplicate", "invalid", "returned"] as const) {
      expect(funnelRank(d)).toBe(-1);
    }
  });
});
