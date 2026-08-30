import { describe, it, expect } from "vitest";
import { buildSparkline } from "./sparkline";
import type { DailyPoint } from "./metrics";

const pt = (day: string, spendCents: number): DailyPoint => ({
  day,
  spendCents,
  revenueCents: 0,
  billableLeads: 0,
});

describe("buildSparkline", () => {
  it("reports no data for an all-zero series rather than drawing a flat line", () => {
    const s = buildSparkline([pt("2026-08-01", 0), pt("2026-08-02", 0)], "spendCents");
    expect(s.hasData).toBe(false);
    expect(s.line).toBeNull();
    expect(s.area).toBeNull();
  });

  it("reports no data for a single point, which cannot form a trend", () => {
    expect(buildSparkline([pt("2026-08-01", 500)], "spendCents").hasData).toBe(false);
  });

  it("derives the path from the values, so different data yields a different path", () => {
    const a = buildSparkline([pt("d1", 10), pt("d2", 90)], "spendCents");
    const b = buildSparkline([pt("d1", 90), pt("d2", 10)], "spendCents");
    expect(a.hasData).toBe(true);
    expect(a.line).not.toBe(b.line);
  });

  it("puts the maximum value at the top of the plot and spans the full width", () => {
    const s = buildSparkline([pt("d1", 0), pt("d2", 100)], "spendCents", 700, 230);
    expect(s.max).toBe(100);
    // Peak sits at 10% headroom from the top: 230 - 0.9*230 = 23.
    expect(s.line).toContain("L700 23");
    expect(s.line!.startsWith("M0 230")).toBe(true);
  });

  it("closes the area path back along the baseline", () => {
    const s = buildSparkline([pt("d1", 10), pt("d2", 20)], "spendCents", 700, 230);
    expect(s.area!.endsWith("L700 230 L0 230Z")).toBe(true);
  });

  it("plots whichever metric is requested", () => {
    const points: DailyPoint[] = [
      { day: "d1", spendCents: 0, revenueCents: 5, billableLeads: 0 },
      { day: "d2", spendCents: 0, revenueCents: 10, billableLeads: 0 },
    ];
    expect(buildSparkline(points, "spendCents").hasData).toBe(false);
    expect(buildSparkline(points, "revenueCents").hasData).toBe(true);
  });

  it("emits one vertex per day", () => {
    const points = ["d1", "d2", "d3", "d4"].map((d, i) => pt(d, (i + 1) * 10));
    const s = buildSparkline(points, "spendCents");
    expect(s.line!.match(/[ML]/g)).toHaveLength(4);
  });
});
