/** Format API payloads for LLM consumption — concise, no secrets/IDs clutter. */

export function formatDemand(raw: Record<string, unknown>): string {
  const count = Number(raw.count ?? 0);
  const candidates = (raw.candidates as Array<Record<string, unknown>>) ?? [];
  if (count === 0) {
    return JSON.stringify({
      status: "no_demand",
      reason_code: raw.reason_code ?? "NO_DEMAND",
      message: "No active Qentrax buyer demand matched the criteria.",
      query: raw.query,
    });
  }
  return JSON.stringify({
    status: "demand_found",
    count,
    opportunities: candidates.slice(0, 15).map((c) => ({
      vertical: c.vertical,
      product: c.product,
      bid_usd: typeof c.bid_cents === "number" ? (c.bid_cents as number) / 100 : null,
      bid_type: c.bid_type,
      states: c.states,
      network: c.network,
      campaign: c.campaign_name,
    })),
    note: "Bids are advertiser base bids, not guaranteed publisher payouts. Phase 1 does not submit leads.",
  });
}

export function formatRequirements(raw: Record<string, unknown>): string {
  const required = (raw.required_fields as Array<Record<string, unknown>>) ?? [];
  const optional = (raw.optional_fields as Array<Record<string, unknown>>) ?? [];
  return JSON.stringify({
    vertical: raw.vertical,
    product: raw.product,
    required: required.map((f) => ({
      field: f.field_key,
      label: f.label,
      phase: f.phase,
      type: f.data_type,
      pii: f.pii,
    })),
    optional: optional.slice(0, 20).map((f) => ({
      field: f.field_key,
      label: f.label,
      phase: f.phase,
      type: f.data_type,
      pii: f.pii,
    })),
    consent: raw.consent,
    geography: raw.geography,
  });
}

export function formatPreflight(raw: Record<string, unknown>): string {
  return JSON.stringify({
    eligible: raw.eligible,
    status: raw.status,
    missing_fields: raw.missing_fields,
    warnings: raw.warnings,
    reason_codes: raw.reason_codes,
    q_score: raw.q_score,
    potential_demand_count: raw.potential_demand_count,
    note: "This is a non-destructive preflight. No lead was submitted or distributed.",
  });
}

export function formatPerformance(raw: Record<string, unknown>): string {
  const metrics = (raw.metrics as Record<string, unknown>) ?? raw;
  const revenue = Number(metrics.revenue_cents ?? 0);
  return JSON.stringify({
    submissions: metrics.submissions,
    billable: metrics.billable,
    rejected: metrics.rejected,
    pending: metrics.pending,
    acceptance_rate: metrics.acceptance_rate,
    revenue_usd: revenue / 100,
    avg_payout_usd:
      metrics.avg_payout_cents != null
        ? Number(metrics.avg_payout_cents) / 100
        : null,
    by_status: metrics.by_status,
    rejection_reasons: metrics.rejection_reasons,
  });
}

export function formatError(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } });
}
