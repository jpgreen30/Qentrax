/**
 * Canonical disposition vocabulary for conversion feedback.
 *
 * An advertiser tells Qentrax what became of a lead. Only "sale" carries
 * revenue into reporting; the rest are funnel stages or negative outcomes that
 * feed quality and return handling. Codes are stable contract — wording may
 * change, a code is never repurposed.
 */
export const DISPOSITIONS = [
  "received",
  "contacted",
  "qualified",
  "quoted",
  "appointment",
  "application",
  "sale",
  "duplicate",
  "invalid",
  "returned",
] as const;

export type Disposition = (typeof DISPOSITIONS)[number];

/** Dispositions that carry revenue. Reporting sums revenue only for these. */
export const REVENUE_DISPOSITIONS: readonly Disposition[] = ["sale"];

/** Outcomes asserting the lead was not usable; these can support a return. */
export const NEGATIVE_DISPOSITIONS: readonly Disposition[] = [
  "duplicate",
  "invalid",
  "returned",
];

export function isDisposition(value: unknown): value is Disposition {
  return typeof value === "string" && (DISPOSITIONS as readonly string[]).includes(value);
}

export function carriesRevenue(disposition: Disposition): boolean {
  return REVENUE_DISPOSITIONS.includes(disposition);
}

export function isNegative(disposition: Disposition): boolean {
  return NEGATIVE_DISPOSITIONS.includes(disposition);
}

/**
 * Progress through the funnel, used to reject a regression that would otherwise
 * silently overwrite a better outcome (a late "contacted" after a "sale").
 * Negative outcomes sit outside the ladder and are always allowed.
 */
const FUNNEL_ORDER: Disposition[] = [
  "received",
  "contacted",
  "qualified",
  "quoted",
  "appointment",
  "application",
  "sale",
];

export function funnelRank(disposition: Disposition): number {
  const index = FUNNEL_ORDER.indexOf(disposition);
  return index === -1 ? -1 : index;
}
