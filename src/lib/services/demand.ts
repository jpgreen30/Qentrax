/**
 * Demand discovery — non-destructive.
 * Answers: "What demand is available for vertical X in state Y?"
 * Does NOT call providers, distribute PII, or create transactions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FindDemandInput = {
  vertical: string;
  state?: string | null;
  product?: string | null;
  traffic_source?: string | null;
  /** Max results */
  limit?: number;
};

export type DemandCandidate = {
  campaign_id: string;
  campaign_name: string;
  vertical: string | null;
  product: string | null;
  /** Advertiser bid in cents (floor/fixed) — not a guaranteed payout */
  bid_cents: number;
  bid_type: string;
  states: string[] | null;
  status: string;
  /** Opaque network label — never credentials */
  network: "qentrax_marketplace";
};

export type FindDemandResult = {
  ok: true;
  query: FindDemandInput;
  count: number;
  candidates: DemandCandidate[];
  reason_code?: "NO_DEMAND";
} | {
  ok: false;
  error: { code: string; message: string };
};

/**
 * Query active marketplace campaigns matching vertical + optional state.
 * Read-only. No external network calls. No PII required.
 */
export async function findDemand(
  supabase: SupabaseClient,
  input: FindDemandInput,
): Promise<FindDemandResult> {
  const vertical = (input.vertical ?? "").trim().toLowerCase();
  if (!vertical) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "vertical is required." },
    };
  }

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const state = input.state?.trim().toUpperCase() || null;

  // Resolve vertical id if known
  const { data: vert } = await supabase
    .from("verticals")
    .select("id, code, name")
    .eq("code", vertical)
    .eq("active", true)
    .maybeSingle();

  let query = supabase
    .from("campaigns")
    .select(
      "id, name, status, base_bid_cents, bid_type, targeting_json, vertical_id, product_id, verticals(code), products(code)",
    )
    .eq("status", "active")
    .gt("base_bid_cents", 0)
    .order("base_bid_cents", { ascending: false })
    .limit(limit * 3); // over-fetch then filter geo in memory

  if (vert?.id) {
    query = query.or(`vertical_id.eq.${vert.id},vertical_id.is.null`);
  }

  const { data: rows, error } = await query;
  if (error) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    };
  }

  const candidates: DemandCandidate[] = [];
  for (const row of rows ?? []) {
    const targeting = (row.targeting_json ?? {}) as { states?: string[] };
    const states = Array.isArray(targeting.states)
      ? targeting.states.map((s) => String(s).toUpperCase())
      : null;

    // State filter: null targeting = all states; otherwise must include
    if (state && states && states.length > 0 && !states.includes(state)) {
      continue;
    }

    const verticalCode =
      (row.verticals as { code?: string } | null)?.code ??
      (vert?.code ?? null);
    const productCode = (row.products as { code?: string } | null)?.code ?? null;

    // Optional product filter
    if (input.product && productCode && productCode !== input.product) {
      continue;
    }

    candidates.push({
      campaign_id: row.id,
      campaign_name: row.name,
      vertical: verticalCode,
      product: productCode,
      bid_cents: row.base_bid_cents ?? 0,
      bid_type: row.bid_type ?? "fixed",
      states,
      status: row.status,
      network: "qentrax_marketplace",
    });

    if (candidates.length >= limit) break;
  }

  return {
    ok: true,
    query: input,
    count: candidates.length,
    candidates,
    ...(candidates.length === 0 ? { reason_code: "NO_DEMAND" as const } : {}),
  };
}
