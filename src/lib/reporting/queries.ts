import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "./date-range";
import type { ConversionRow, TransactionRow } from "./metrics";

/**
 * PostgREST caps a single response, so authoritative totals must page rather
 * than take the first N rows. Reporting previously read `.limit(200)` and
 * presented the result as "TOTAL SPEND", which quietly understated any
 * organization with more than 200 transactions in range.
 */
const PAGE_SIZE = 1000;
/** Bounds a runaway loop; 500k rows in one range is well past a UI report. */
const MAX_PAGES = 500;

async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchAdvertiserTransactions(
  supabase: SupabaseClient,
  orgId: string,
  range: DateRange,
): Promise<TransactionRow[]> {
  return fetchAllPages<TransactionRow>((from, to) =>
    supabase
      .from("transactions")
      .select("id, status, advertiser_price_cents, created_at, campaign_id")
      .eq("advertiser_org_id", orgId)
      .gte("created_at", range.start.toISOString())
      .lt("created_at", range.end.toISOString())
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

export async function fetchPublisherTransactions(
  supabase: SupabaseClient,
  orgId: string,
  range: DateRange,
): Promise<TransactionRow[]> {
  return fetchAllPages<TransactionRow>((from, to) =>
    supabase
      .from("transactions")
      .select(
        "id, status, advertiser_price_cents, publisher_amount_cents, created_at, campaign_id",
      )
      .eq("publisher_org_id", orgId)
      .gte("created_at", range.start.toISOString())
      .lt("created_at", range.end.toISOString())
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

export async function fetchAdvertiserConversions(
  supabase: SupabaseClient,
  orgId: string,
  range: DateRange,
): Promise<ConversionRow[]> {
  return fetchAllPages<ConversionRow>((from, to) =>
    supabase
      .from("conversion_events")
      .select("id, event_type, revenue_cents, occurred_at, transaction_id")
      .eq("advertiser_org_id", orgId)
      .gte("occurred_at", range.start.toISOString())
      .lt("occurred_at", range.end.toISOString())
      .order("occurred_at", { ascending: false })
      .range(from, to),
  );
}

export const REPORTING_PAGE_SIZE = PAGE_SIZE;
export { fetchAllPages };
