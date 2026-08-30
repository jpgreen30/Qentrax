import { describe, it, expect } from "vitest";
import {
  computeTotals,
  computeDailySeries,
  computeCampaignBreakdown,
  type TransactionRow,
  type ConversionRow,
} from "./metrics";
import { isBillable, TRANSACTION_STATUSES } from "./transaction-status";
import {
  resolveDateRange,
  localDayKey,
  startOfLocalDay,
  enumerateDays,
} from "./date-range";

const LA = "America/Los_Angeles";

function txn(over: Partial<TransactionRow> & { id: string; status: string }): TransactionRow {
  return {
    advertiser_price_cents: 1000,
    created_at: "2026-08-20T18:00:00Z",
    campaign_id: "camp-1",
    ...over,
  };
}

function conv(over: Partial<ConversionRow> & { id: string }): ConversionRow {
  return {
    event_type: "sale",
    revenue_cents: 5000,
    occurred_at: "2026-08-20T18:00:00Z",
    transaction_id: "t1",
    ...over,
  };
}

describe("transaction status vocabulary", () => {
  it("does not admit a 'billable' status, which the DB constraint cannot produce", () => {
    expect(TRANSACTION_STATUSES).not.toContain("billable");
    expect(isBillable("billable")).toBe(false);
  });

  it("treats charged and settled as revenue, and everything else as not", () => {
    expect(isBillable("charged")).toBe(true);
    expect(isBillable("settled")).toBe(true);
    expect(isBillable("reserved")).toBe(false);
    expect(isBillable("returned")).toBe(false);
    expect(isBillable("pending")).toBe(false);
    expect(isBillable(null)).toBe(false);
  });
});

describe("computeTotals", () => {
  it("counts charged and settled transactions as spend", () => {
    const totals = computeTotals(
      [
        txn({ id: "a", status: "charged", advertiser_price_cents: 2500 }),
        txn({ id: "b", status: "settled", advertiser_price_cents: 1500 }),
      ],
      [],
    );
    expect(totals.billableLeads).toBe(2);
    expect(totals.spendCents).toBe(4000);
  });

  it("excludes reserved and returned transactions from spend", () => {
    const totals = computeTotals(
      [
        txn({ id: "a", status: "charged", advertiser_price_cents: 2500 }),
        txn({ id: "b", status: "reserved", advertiser_price_cents: 9999 }),
        txn({ id: "c", status: "returned", advertiser_price_cents: 9999 }),
        txn({ id: "d", status: "pending", advertiser_price_cents: 9999 }),
      ],
      [],
    );
    expect(totals.spendCents).toBe(2500);
    expect(totals.billableLeads).toBe(1);
    expect(totals.reservedLeads).toBe(1);
    expect(totals.releasedLeads).toBe(1);
  });

  it("regression: a ledger of only reserved/returned rows reports zero, not their value", () => {
    const totals = computeTotals(
      [
        txn({ id: "a", status: "reserved", advertiser_price_cents: 5000 }),
        txn({ id: "b", status: "returned", advertiser_price_cents: 5000 }),
      ],
      [],
    );
    expect(totals.spendCents).toBe(0);
    expect(totals.avgCplCents).toBe(0);
  });

  it("counts only sale events as revenue", () => {
    const totals = computeTotals(
      [txn({ id: "a", status: "charged", advertiser_price_cents: 1000 })],
      [
        conv({ id: "c1", event_type: "sale", revenue_cents: 4000 }),
        conv({ id: "c2", event_type: "contacted", revenue_cents: 9999 }),
        conv({ id: "c3", event_type: "qualified", revenue_cents: 9999 }),
      ],
    );
    expect(totals.revenueCents).toBe(4000);
    expect(totals.sales).toBe(1);
    expect(totals.conversions).toBe(3);
  });

  it("computes CPL, revenue per lead, ROAS and conversion rate from real values", () => {
    const totals = computeTotals(
      [
        txn({ id: "a", status: "charged", advertiser_price_cents: 1000 }),
        txn({ id: "b", status: "charged", advertiser_price_cents: 3000 }),
      ],
      [conv({ id: "c1", revenue_cents: 8000 })],
    );
    expect(totals.avgCplCents).toBe(2000);
    expect(totals.revenuePerLeadCents).toBe(4000);
    expect(totals.roas).toBeCloseTo(2.0);
    expect(totals.conversionRate).toBeCloseTo(0.5);
  });

  it("returns null, not zero, for ratios that are undefined with no activity", () => {
    const totals = computeTotals([], []);
    expect(totals.roas).toBeNull();
    expect(totals.conversionRate).toBeNull();
    expect(totals.spendCents).toBe(0);
    expect(totals.billableLeads).toBe(0);
  });

  it("treats a null price as zero rather than NaN", () => {
    const totals = computeTotals(
      [txn({ id: "a", status: "charged", advertiser_price_cents: null })],
      [],
    );
    expect(totals.spendCents).toBe(0);
    expect(totals.avgCplCents).toBe(0);
  });
});

describe("date ranges", () => {
  it("resolves 7d/30d/90d to the right number of local days", () => {
    const now = new Date("2026-08-30T18:00:00Z");
    expect(resolveDateRange({ range: "7d" }, LA, now).days).toHaveLength(7);
    expect(resolveDateRange({ range: "30d" }, LA, now).days).toHaveLength(30);
    expect(resolveDateRange({ range: "90d" }, LA, now).days).toHaveLength(90);
  });

  it("defaults to 30d for an absent or unknown range", () => {
    const now = new Date("2026-08-30T18:00:00Z");
    expect(resolveDateRange({}, LA, now).preset).toBe("30d");
    expect(resolveDateRange({ range: "bogus" }, LA, now).preset).toBe("30d");
  });

  it("supports a custom range and normalizes an inverted one", () => {
    const now = new Date("2026-08-30T18:00:00Z");
    const r = resolveDateRange({ range: "custom", from: "2026-08-10", to: "2026-08-12" }, LA, now);
    expect(r.days).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);

    const inverted = resolveDateRange(
      { range: "custom", from: "2026-08-12", to: "2026-08-10" },
      LA,
      now,
    );
    expect(inverted.days).toEqual(r.days);
  });

  it("ends the range at an exclusive boundary so the final day is counted once", () => {
    const now = new Date("2026-08-30T18:00:00Z");
    const r = resolveDateRange({ range: "custom", from: "2026-08-10", to: "2026-08-10" }, LA, now);
    // 2026-08-10 00:00 PDT is 07:00Z; the exclusive end is the next local midnight.
    expect(r.start.toISOString()).toBe("2026-08-10T07:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-08-11T07:00:00.000Z");
  });

  it("anchors the range to the viewer's local day, not the UTC day", () => {
    // 03:00Z on the 30th is still the 29th in Los Angeles.
    const now = new Date("2026-08-30T03:00:00Z");
    const r = resolveDateRange({ range: "7d" }, LA, now);
    expect(r.days[r.days.length - 1]).toBe("2026-08-29");
  });

  it("computes local midnight correctly across both DST transitions", () => {
    // Spring forward: 2026-03-08 local midnight is still PST (UTC-8).
    expect(startOfLocalDay("2026-03-08", LA).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    // The day after the transition is PDT (UTC-7).
    expect(startOfLocalDay("2026-03-09", LA).toISOString()).toBe("2026-03-09T07:00:00.000Z");
    // Fall back: 2026-11-01 local midnight is PDT; the next day is PST.
    expect(startOfLocalDay("2026-11-01", LA).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(startOfLocalDay("2026-11-02", LA).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("enumerates days across a month boundary", () => {
    expect(enumerateDays("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
  });

  it("maps an instant to the correct local day either side of local midnight", () => {
    expect(localDayKey(new Date("2026-08-30T06:59:00Z"), LA)).toBe("2026-08-29");
    expect(localDayKey(new Date("2026-08-30T07:01:00Z"), LA)).toBe("2026-08-30");
  });
});

describe("computeDailySeries", () => {
  const range = resolveDateRange(
    { range: "custom", from: "2026-08-10", to: "2026-08-12" },
    LA,
    new Date("2026-08-30T18:00:00Z"),
  );

  it("emits one point per day including days with no activity", () => {
    const series = computeDailySeries(
      [txn({ id: "a", status: "charged", created_at: "2026-08-11T18:00:00Z" })],
      [],
      range,
    );
    expect(series.map((p) => p.day)).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
    expect(series[0].spendCents).toBe(0);
    expect(series[1].spendCents).toBe(1000);
    expect(series[2].spendCents).toBe(0);
  });

  it("buckets by local day, so a late-evening lead is not pushed into tomorrow", () => {
    // 2026-08-11 05:00Z is 2026-08-10 22:00 PDT.
    const series = computeDailySeries(
      [txn({ id: "a", status: "charged", created_at: "2026-08-11T05:00:00Z" })],
      [],
      range,
    );
    expect(series[0].billableLeads).toBe(1);
    expect(series[1].billableLeads).toBe(0);
  });

  it("ignores non-billable transactions", () => {
    const series = computeDailySeries(
      [
        txn({ id: "a", status: "reserved", created_at: "2026-08-11T18:00:00Z" }),
        txn({ id: "b", status: "returned", created_at: "2026-08-11T18:00:00Z" }),
      ],
      [],
      range,
    );
    expect(series.every((p) => p.billableLeads === 0 && p.spendCents === 0)).toBe(true);
  });

  it("drops activity outside the range rather than folding it into an edge bucket", () => {
    const series = computeDailySeries(
      [txn({ id: "a", status: "charged", created_at: "2026-07-01T18:00:00Z" })],
      [],
      range,
    );
    expect(series.reduce((s, p) => s + p.billableLeads, 0)).toBe(0);
  });

  it("places revenue on the day the conversion occurred", () => {
    const series = computeDailySeries(
      [],
      [conv({ id: "c1", occurred_at: "2026-08-12T18:00:00Z", revenue_cents: 7000 })],
      range,
    );
    expect(series[2].revenueCents).toBe(7000);
  });
});

describe("computeCampaignBreakdown", () => {
  const campaigns = [
    { id: "camp-1", name: "California Solar" },
    { id: "camp-2", name: "Texas Solar" },
  ];

  it("aggregates spend and leads per campaign, sorted by spend", () => {
    const rows = computeCampaignBreakdown(
      [
        txn({ id: "a", status: "charged", campaign_id: "camp-1", advertiser_price_cents: 1000 }),
        txn({ id: "b", status: "charged", campaign_id: "camp-1", advertiser_price_cents: 3000 }),
        txn({ id: "c", status: "charged", campaign_id: "camp-2", advertiser_price_cents: 500 }),
      ],
      [],
      campaigns,
    );
    expect(rows.map((r) => r.name)).toEqual(["California Solar", "Texas Solar"]);
    expect(rows[0].billableLeads).toBe(2);
    expect(rows[0].spendCents).toBe(4000);
    expect(rows[0].avgCplCents).toBe(2000);
  });

  it("excludes non-billable transactions from campaign spend", () => {
    const rows = computeCampaignBreakdown(
      [
        txn({ id: "a", status: "charged", campaign_id: "camp-1", advertiser_price_cents: 1000 }),
        txn({ id: "b", status: "reserved", campaign_id: "camp-1", advertiser_price_cents: 9999 }),
      ],
      [],
      campaigns,
    );
    expect(rows[0].spendCents).toBe(1000);
    expect(rows[0].billableLeads).toBe(1);
  });

  it("attributes revenue through the charged transaction that produced it", () => {
    const rows = computeCampaignBreakdown(
      [txn({ id: "t1", status: "charged", campaign_id: "camp-1", advertiser_price_cents: 2000 })],
      [conv({ id: "c1", transaction_id: "t1", revenue_cents: 6000 })],
      campaigns,
    );
    expect(rows[0].revenueCents).toBe(6000);
    expect(rows[0].roas).toBeCloseTo(3.0);
  });

  it("does not credit revenue whose transaction was never charged", () => {
    const rows = computeCampaignBreakdown(
      [txn({ id: "t1", status: "returned", campaign_id: "camp-1", advertiser_price_cents: 2000 })],
      [conv({ id: "c1", transaction_id: "t1", revenue_cents: 6000 })],
      campaigns,
    );
    expect(rows).toHaveLength(0);
  });

  it("renders an empty breakdown with no activity instead of placeholder rows", () => {
    expect(computeCampaignBreakdown([], [], campaigns)).toEqual([]);
  });
});
