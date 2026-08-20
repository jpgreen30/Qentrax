/**
 * Format API payloads for LLM consumption — concise, no secrets/IDs clutter.
 *
 * Each `*Payload` builder returns a plain object that conforms to the matching
 * tool `outputSchema` in server.ts. The `format*` wrappers keep the historical
 * JSON-string shape used for the text content block, so text output is
 * unchanged from before structured content was added.
 *
 * Scalars are normalized on the way out so a surprising upstream type can never
 * fail schema validation and break a tool call.
 */

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

export function demandPayload(raw: Record<string, unknown>) {
  const count = Number(raw.count ?? 0);
  const candidates = (raw.candidates as Array<Record<string, unknown>>) ?? [];
  if (count === 0) {
    return {
      status: "no_demand",
      reason_code: str(raw.reason_code) ?? "NO_DEMAND",
      message: "No active Qentrax buyer demand matched the criteria.",
      query: raw.query ?? null,
      count: 0,
      opportunities: [],
      note: null,
    };
  }
  return {
    status: "demand_found",
    reason_code: null,
    message: null,
    query: raw.query ?? null,
    count: Number.isFinite(count) ? count : 0,
    opportunities: candidates.slice(0, 15).map((c) => ({
      vertical: str(c.vertical),
      product: str(c.product),
      bid_usd: typeof c.bid_cents === "number" ? (c.bid_cents as number) / 100 : null,
      bid_type: str(c.bid_type),
      states: c.states ?? null,
      network: str(c.network),
      campaign: str(c.campaign_name),
    })),
    note: "Bids are advertiser base bids, not guaranteed publisher payouts. Phase 1 does not submit leads.",
  };
}

export function requirementsPayload(raw: Record<string, unknown>) {
  const required = (raw.required_fields as Array<Record<string, unknown>>) ?? [];
  const optional = (raw.optional_fields as Array<Record<string, unknown>>) ?? [];
  const field = (f: Record<string, unknown>) => ({
    field: str(f.field_key),
    label: str(f.label),
    phase: str(f.phase),
    type: str(f.data_type),
    pii: bool(f.pii),
  });
  return {
    vertical: str(raw.vertical),
    product: str(raw.product),
    required: required.map(field),
    optional: optional.slice(0, 20).map(field),
    consent: raw.consent ?? null,
    geography: raw.geography ?? null,
  };
}

export function preflightPayload(raw: Record<string, unknown>) {
  return {
    eligible: bool(raw.eligible),
    status: str(raw.status),
    missing_fields: arr(raw.missing_fields),
    warnings: arr(raw.warnings),
    reason_codes: arr(raw.reason_codes),
    q_score: num(raw.q_score),
    potential_demand_count: num(raw.potential_demand_count),
    note: "This is a non-destructive preflight. No lead was submitted or distributed.",
  };
}

export function performancePayload(raw: Record<string, unknown>) {
  const metrics = (raw.metrics as Record<string, unknown>) ?? raw;
  const revenue = Number(metrics.revenue_cents ?? 0);
  return {
    submissions: num(metrics.submissions),
    billable: num(metrics.billable),
    rejected: num(metrics.rejected),
    pending: num(metrics.pending),
    acceptance_rate: num(metrics.acceptance_rate),
    revenue_usd: Number.isFinite(revenue) ? revenue / 100 : null,
    avg_payout_usd:
      metrics.avg_payout_cents != null ? num(metrics.avg_payout_cents)! / 100 : null,
    by_status: metrics.by_status ?? null,
    rejection_reasons: metrics.rejection_reasons ?? null,
  };
}

export function formatDemand(raw: Record<string, unknown>): string {
  return JSON.stringify(demandPayload(raw));
}

export function formatRequirements(raw: Record<string, unknown>): string {
  return JSON.stringify(requirementsPayload(raw));
}

export function formatPreflight(raw: Record<string, unknown>): string {
  return JSON.stringify(preflightPayload(raw));
}

export function formatPerformance(raw: Record<string, unknown>): string {
  return JSON.stringify(performancePayload(raw));
}

export function formatError(code: string, message: string): string {
  return JSON.stringify({ error: { code, message } });
}
