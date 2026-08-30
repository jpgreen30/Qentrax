/**
 * Publisher share of the advertiser price.
 *
 * The authoritative computation lives in reserve_campaign_transaction:
 *   v_publisher_cents := floor(p_price_cents * 0.85)
 * (supabase/migrations/20260830090000_campaign_offer_and_dayparts.sql).
 *
 * This mirror exists so publisher-facing surfaces can quote a rate before a
 * transaction exists. It must stay in step with that function; a SQL test
 * asserts the database still splits the same way, so a change on either side
 * fails the suite rather than silently misquoting publishers.
 */
export const PUBLISHER_SHARE = 0.85;

/** Floor, matching the SQL, so a quoted rate is never above what is paid. */
export function publisherAmountCents(advertiserPriceCents: number): number {
  if (!Number.isFinite(advertiserPriceCents) || advertiserPriceCents <= 0) return 0;
  return Math.floor(advertiserPriceCents * PUBLISHER_SHARE);
}

export function platformMarginCents(advertiserPriceCents: number): number {
  if (!Number.isFinite(advertiserPriceCents) || advertiserPriceCents <= 0) return 0;
  return advertiserPriceCents - publisherAmountCents(advertiserPriceCents);
}
