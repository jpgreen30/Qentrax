/**
 * Canonical transaction states.
 *
 * These mirror the CHECK constraint on public.transactions.status
 * (20260828015000_phase1_deliveries_transactions.sql):
 *
 *   pending | reserved | charged | returned | settled
 *
 * There is deliberately no "billable" state. Reporting surfaces previously
 * filtered on the string "billable", which the constraint can never produce, so
 * every billable count, publisher earning and admin finance total silently
 * resolved to zero. Route revenue questions through these sets instead of
 * comparing status strings inline.
 */
export const TRANSACTION_STATUSES = [
  "pending",
  "reserved",
  "charged",
  "returned",
  "settled",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Reserved against a cap/budget but not yet charged. Not revenue. */
export const RESERVED_STATUSES: readonly TransactionStatus[] = ["reserved"];

/**
 * The advertiser has been charged. "settled" is a charged transaction whose
 * publisher payout has cleared, so it stays billable — dropping it would make
 * revenue shrink as payouts run.
 */
export const BILLABLE_STATUSES: readonly TransactionStatus[] = ["charged", "settled"];

/** Reservation released; never counts toward spend, revenue or caps. */
export const RELEASED_STATUSES: readonly TransactionStatus[] = ["returned"];

/**
 * Eligible for a publisher payout batch. "settled" is excluded because it means
 * the payout already cleared; including it would pay the same lead twice.
 */
export const PAYABLE_STATUSES: readonly TransactionStatus[] = ["charged"];

export function isPayable(status: string | null | undefined): boolean {
  return PAYABLE_STATUSES.includes(status as TransactionStatus);
}

export function isBillable(status: string | null | undefined): boolean {
  return BILLABLE_STATUSES.includes(status as TransactionStatus);
}

export function isReserved(status: string | null | undefined): boolean {
  return RESERVED_STATUSES.includes(status as TransactionStatus);
}

export function isReleased(status: string | null | undefined): boolean {
  return RELEASED_STATUSES.includes(status as TransactionStatus);
}
