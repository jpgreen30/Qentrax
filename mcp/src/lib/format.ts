/**
 * Format API payloads for LLM consumption — concise, no secrets/IDs clutter.
 *
 * Each `*Payload` builder returns a plain object that conforms to the matching
 * tool `outputSchema` in server.ts. The `format*` wrappers keep the historical
 * JSON-string shape used for the text content block.
 *
 * Values are normalized and type-guarded on the way out so a surprising
 * upstream payload can neither throw nor fail schema validation.
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

/** Coerce an unknown list entry to a safe property bag. */
function obj(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}

export function demandPayload(raw: Record<string, unknown>) {
  const count = num(raw.count) ?? 0;
  const candidates = Array.isArray(raw.candidates) ? raw.candidates : [];
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
    count,
    opportunities: candidates.slice(0, 15).map((entry) => {
      const c = obj(entry);
      return {
        vertical: str(c.vertical),
        product: str(c.product),
        bid_usd: typeof c.bid_cents === "number" ? c.bid_cents / 100 : null,
        bid_type: str(c.bid_type),
        states: c.states ?? null,
        network: str(c.network),
        campaign: str(c.campaign_name),
      };
    }),
    note: "Bids are advertiser base bids, not guaranteed publisher payouts. Phase 1 does not submit leads.",
  };
}

export function requirementsPayload(raw: Record<string, unknown>) {
  const required = Array.isArray(raw.required_fields) ? raw.required_fields : [];
  const optional = Array.isArray(raw.optional_fields) ? raw.optional_fields : [];
  const field = (entry: unknown) => {
    const f = obj(entry);
    return {
      field: str(f.field_key),
      label: str(f.label),
      phase: str(f.phase),
      type: str(f.data_type),
      pii: bool(f.pii),
    };
  };
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
  const metrics =
    raw.metrics && typeof raw.metrics === "object"
      ? (raw.metrics as Record<string, unknown>)
      : raw;
  const revenue = num(metrics.revenue_cents) ?? 0;
  const avgPayout = num(metrics.avg_payout_cents);
  return {
    submissions: num(metrics.submissions),
    billable: num(metrics.billable),
    rejected: num(metrics.rejected),
    pending: num(metrics.pending),
    acceptance_rate: num(metrics.acceptance_rate),
    revenue_usd: revenue / 100,
    avg_payout_usd: avgPayout === null ? null : avgPayout / 100,
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
