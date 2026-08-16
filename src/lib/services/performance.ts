/**
 * Performance query — non-destructive read of existing transaction/reporting data.
 * Does NOT create records or call external networks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PerformanceQuery = {
  organization_id: string;
  /** publisher | advertiser — filters the org side of transactions */
  role: "publisher" | "advertiser";
  source_id?: string | null;
  vertical?: string | null;
  from?: string | null; // ISO date
  to?: string | null;
};

export type PerformanceMetrics = {
  submissions: number;
  billable: number;
  rejected: number;
  pending: number;
  acceptance_rate: number | null;
  revenue_cents: number;
  avg_payout_cents: number | null;
  by_status: Record<string, number>;
  rejection_reasons: { reason: string; count: number }[];
};

export type PerformanceResult = {
  ok: true;
  query: PerformanceQuery;
  metrics: PerformanceMetrics;
} | {
  ok: false;
  error: { code: string; message: string };
};

export async function getPerformance(
  supabase: SupabaseClient,
  input: PerformanceQuery,
): Promise<PerformanceResult> {
  if (!input.organization_id) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "organization_id is required." },
    };
  }

  const orgCol =
    input.role === "publisher" ? "publisher_org_id" : "advertiser_org_id";
  const amountCol =
    input.role === "publisher" ? "publisher_amount_cents" : "advertiser_price_cents";

  let q = supabase
    .from("transactions")
    .select(
      `id, status, ${amountCol}, created_at, opportunity_id, campaign_id, opportunities(source_id, vertical_id, verticals(code))`,
    )
    .eq(orgCol, input.organization_id)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (input.from) q = q.gte("created_at", input.from);
  if (input.to) q = q.lte("created_at", input.to);

  const { data: rows, error } = await q;
  if (error) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    };
  }

  let filtered = rows ?? [];
  if (input.source_id) {
    filtered = filtered.filter(
      (r) =>
        (r.opportunities as { source_id?: string } | null)?.source_id ===
        input.source_id,
    );
  }
  if (input.vertical) {
    const v = input.vertical.toLowerCase();
    filtered = filtered.filter((r) => {
      const code = (
        r.opportunities as { verticals?: { code?: string } } | null
      )?.verticals?.code;
      return code?.toLowerCase() === v;
    });
  }

  const by_status: Record<string, number> = {};
  let billable = 0;
  let rejected = 0;
  let pending = 0;
  let revenue = 0;

  for (const r of filtered) {
    const st = String(r.status ?? "unknown");
    by_status[st] = (by_status[st] ?? 0) + 1;
    if (st === "billable" || st === "settled") {
      billable += 1;
      revenue += Number((r as Record<string, unknown>)[amountCol] ?? 0);
    } else if (
      st.includes("reject") ||
      st === "delivery_failed" ||
      st === "buyer_rejected"
    ) {
      rejected += 1;
    } else if (st === "delivery_pending" || st === "pending") {
      pending += 1;
    }
  }

  const submissions = filtered.length;
  const acceptance_rate =
    submissions > 0 ? Math.round((billable / submissions) * 1000) / 1000 : null;
  const avg_payout_cents =
    billable > 0 ? Math.round(revenue / billable) : null;

  return {
    ok: true,
    query: input,
    metrics: {
      submissions,
      billable,
      rejected,
      pending,
      acceptance_rate,
      revenue_cents: revenue,
      avg_payout_cents,
      by_status,
      rejection_reasons: Object.entries(by_status)
        .filter(([k]) => k.includes("reject") || k.includes("fail"))
        .map(([reason, count]) => ({ reason, count })),
    },
  };
}
