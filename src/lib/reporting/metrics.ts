import { BILLABLE_STATUSES, isBillable, isReleased, isReserved } from "./transaction-status";
import { localDayKey, type DateRange } from "./date-range";

export type TransactionRow = {
  id: string;
  status: string;
  advertiser_price_cents: number | null;
  publisher_amount_cents?: number | null;
  created_at: string;
  campaign_id: string | null;
};

export type ConversionRow = {
  id: string;
  event_type: string;
  revenue_cents: number | null;
  occurred_at: string;
  transaction_id: string | null;
};

export type ReportTotals = {
  /** Charged transactions only. Reservations and releases are excluded. */
  billableLeads: number;
  reservedLeads: number;
  releasedLeads: number;
  spendCents: number;
  revenueCents: number;
  conversions: number;
  sales: number;
  /** Integer cents; 0 when there is nothing to divide by. */
  avgCplCents: number;
  revenuePerLeadCents: number;
  /** null rather than a fabricated 0 when the ratio is undefined. */
  roas: number | null;
  conversionRate: number | null;
};

export type DailyPoint = {
  day: string;
  billableLeads: number;
  spendCents: number;
  revenueCents: number;
};

export type CampaignBreakdownRow = {
  campaignId: string;
  name: string;
  billableLeads: number;
  spendCents: number;
  revenueCents: number;
  avgCplCents: number;
  roas: number | null;
};

/** SALE is the revenue-bearing disposition; the rest are funnel stages. */
export const REVENUE_EVENT_TYPES = ["sale"] as const;

function isRevenueEvent(eventType: string): boolean {
  return (REVENUE_EVENT_TYPES as readonly string[]).includes(eventType.toLowerCase());
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeTotals(
  transactions: readonly TransactionRow[],
  conversions: readonly ConversionRow[],
): ReportTotals {
  let billableLeads = 0;
  let reservedLeads = 0;
  let releasedLeads = 0;
  let spendCents = 0;

  const billableTransactionIds = new Set<string>();

  for (const t of transactions) {
    if (isBillable(t.status)) {
      billableLeads += 1;
      spendCents += t.advertiser_price_cents ?? 0;
      billableTransactionIds.add(t.id);
    } else if (isReserved(t.status)) {
      reservedLeads += 1;
    } else if (isReleased(t.status)) {
      releasedLeads += 1;
    }
  }

  let revenueCents = 0;
  let sales = 0;
  for (const c of conversions) {
    if (!isRevenueEvent(c.event_type)) continue;
    sales += 1;
    revenueCents += c.revenue_cents ?? 0;
  }

  return {
    billableLeads,
    reservedLeads,
    releasedLeads,
    spendCents,
    revenueCents,
    conversions: conversions.length,
    sales,
    avgCplCents: billableLeads > 0 ? Math.round(spendCents / billableLeads) : 0,
    revenuePerLeadCents: billableLeads > 0 ? Math.round(revenueCents / billableLeads) : 0,
    roas: ratio(revenueCents, spendCents),
    conversionRate: ratio(sales, billableLeads),
  };
}

/**
 * One point per local day in the range, including days with no activity, so a
 * quiet period renders as a real zero rather than being dropped from the axis.
 */
export function computeDailySeries(
  transactions: readonly TransactionRow[],
  conversions: readonly ConversionRow[],
  range: DateRange,
): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (const day of range.days) {
    byDay.set(day, { day, billableLeads: 0, spendCents: 0, revenueCents: 0 });
  }

  for (const t of transactions) {
    if (!isBillable(t.status)) continue;
    const key = localDayKey(new Date(t.created_at), range.timezone);
    const point = byDay.get(key);
    if (!point) continue;
    point.billableLeads += 1;
    point.spendCents += t.advertiser_price_cents ?? 0;
  }

  for (const c of conversions) {
    if (!isRevenueEvent(c.event_type)) continue;
    const key = localDayKey(new Date(c.occurred_at), range.timezone);
    const point = byDay.get(key);
    if (!point) continue;
    point.revenueCents += c.revenue_cents ?? 0;
  }

  return range.days.map((d) => byDay.get(d)!);
}

export function computeCampaignBreakdown(
  transactions: readonly TransactionRow[],
  conversions: readonly ConversionRow[],
  campaigns: readonly { id: string; name: string }[],
): CampaignBreakdownRow[] {
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const transactionCampaign = new Map<string, string>();
  const rows = new Map<string, CampaignBreakdownRow>();

  const ensure = (campaignId: string): CampaignBreakdownRow => {
    let row = rows.get(campaignId);
    if (!row) {
      row = {
        campaignId,
        name: names.get(campaignId) ?? campaignId.slice(0, 8),
        billableLeads: 0,
        spendCents: 0,
        revenueCents: 0,
        avgCplCents: 0,
        roas: null,
      };
      rows.set(campaignId, row);
    }
    return row;
  };

  for (const t of transactions) {
    if (!t.campaign_id || !isBillable(t.status)) continue;
    transactionCampaign.set(t.id, t.campaign_id);
    const row = ensure(t.campaign_id);
    row.billableLeads += 1;
    row.spendCents += t.advertiser_price_cents ?? 0;
  }

  // Revenue is attributed through the transaction that produced the lead, so a
  // conversion cannot inflate a campaign that was never charged for it.
  for (const c of conversions) {
    if (!isRevenueEvent(c.event_type) || !c.transaction_id) continue;
    const campaignId = transactionCampaign.get(c.transaction_id);
    if (!campaignId) continue;
    ensure(campaignId).revenueCents += c.revenue_cents ?? 0;
  }

  for (const row of rows.values()) {
    row.avgCplCents = row.billableLeads > 0 ? Math.round(row.spendCents / row.billableLeads) : 0;
    row.roas = ratio(row.revenueCents, row.spendCents);
  }

  return Array.from(rows.values()).sort((a, b) => b.spendCents - a.spendCents);
}

export { BILLABLE_STATUSES };
