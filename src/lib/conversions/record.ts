import type { SupabaseClient } from "@supabase/supabase-js";
import { isDisposition, carriesRevenue, type Disposition } from "./dispositions";

/**
 * Records advertiser conversion/disposition feedback against a purchased lead.
 *
 * Authorization is the caller's responsibility to establish, but the tenant is
 * never taken from the request body: the advertiser org is passed in from the
 * verified session, and the transaction is re-checked to belong to that org.
 * The previous endpoint took organization_id from a query parameter with no
 * authentication at all, using the service-role key, so any caller could read
 * or write any tenant's revenue.
 *
 * Idempotency rides on conversion_events (advertiser_org_id, external_event_id),
 * so a retried webhook cannot inflate revenue.
 */
export type RecordConversionInput = {
  advertiserOrgId: string;
  transactionId: string;
  disposition: string;
  revenueCents?: number | null;
  externalEventId?: string | null;
  externalRecordId?: string | null;
  occurredAt?: string | null;
  sourceMethod?: string;
};

export type RecordConversionResult =
  | { ok: true; id: string; duplicate: boolean; disposition: Disposition }
  | { ok: false; code: ConversionError; message: string };

export type ConversionError =
  | "INVALID_DISPOSITION"
  | "INVALID_REVENUE"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_NOT_BILLABLE"
  | "WRITE_FAILED";

export async function recordConversion(
  supabase: SupabaseClient,
  input: RecordConversionInput,
): Promise<RecordConversionResult> {
  if (!isDisposition(input.disposition)) {
    return {
      ok: false,
      code: "INVALID_DISPOSITION",
      message: `Unsupported disposition "${input.disposition}".`,
    };
  }

  const disposition = input.disposition;
  const revenue = input.revenueCents ?? null;

  if (revenue != null && (!Number.isInteger(revenue) || revenue < 0)) {
    return {
      ok: false,
      code: "INVALID_REVENUE",
      message: "Revenue must be a whole number of cents, zero or more.",
    };
  }

  // Revenue on a non-revenue disposition would silently inflate ROAS.
  if (revenue != null && revenue > 0 && !carriesRevenue(disposition)) {
    return {
      ok: false,
      code: "INVALID_REVENUE",
      message: `Revenue can only be reported on a sale, not "${disposition}".`,
    };
  }

  // The transaction must belong to the calling advertiser. RLS enforces this
  // too; checking here turns a silent empty result into a clear error.
  const { data: transaction } = await supabase
    .from("transactions")
    .select("id, status, advertiser_org_id")
    .eq("id", input.transactionId)
    .eq("advertiser_org_id", input.advertiserOrgId)
    .maybeSingle();

  if (!transaction) {
    return {
      ok: false,
      code: "TRANSACTION_NOT_FOUND",
      message: "Transaction not found for this organization.",
    };
  }

  // A lead that was never charged cannot have produced revenue.
  if (!["charged", "settled"].includes(transaction.status)) {
    return {
      ok: false,
      code: "TRANSACTION_NOT_BILLABLE",
      message: `Transaction is ${transaction.status}; only a charged lead can carry a conversion.`,
    };
  }

  const externalEventId =
    input.externalEventId?.trim() ||
    // Without a caller-supplied key, one disposition per transaction is the
    // idempotent unit: re-reporting "sale" must not double-count.
    `${input.transactionId}:${disposition}`;

  // At most one revenue-bearing disposition per transaction. Without this, two
  // "sale" events carrying different external ids both record and revenue is
  // counted twice, inflating ROAS for a lead that was bought once. Funnel
  // stages are unaffected — a lead can legitimately be contacted, qualified
  // and quoted.
  if (carriesRevenue(disposition)) {
    const { data: existingSale } = await supabase
      .from("conversion_events")
      .select("id, external_event_id")
      .eq("advertiser_org_id", input.advertiserOrgId)
      .eq("transaction_id", input.transactionId)
      .eq("event_type", disposition)
      .maybeSingle();

    if (existingSale) {
      return { ok: true, id: existingSale.id as string, duplicate: true, disposition };
    }
  }

  const row = {
    advertiser_org_id: input.advertiserOrgId,
    transaction_id: input.transactionId,
    external_event_id: externalEventId,
    external_record_id: input.externalRecordId ?? null,
    event_type: disposition,
    revenue_cents: revenue,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    source_method: input.sourceMethod ?? "api",
    validation_status: "accepted",
  };

  const { data, error } = await supabase
    .from("conversion_events")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation on (advertiser_org_id, external_event_id): the same
    // event arriving twice is success, not failure.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("conversion_events")
        .select("id")
        .eq("advertiser_org_id", input.advertiserOrgId)
        .eq("external_event_id", externalEventId)
        .maybeSingle();

      if (existing) {
        return { ok: true, id: existing.id as string, duplicate: true, disposition };
      }
    }
    return { ok: false, code: "WRITE_FAILED", message: error.message };
  }

  if (!data) {
    return { ok: false, code: "WRITE_FAILED", message: "Conversion was not recorded." };
  }

  const { emitNotification } = await import("@/lib/notifications");
  const negative = ["rejected", "returned", "refunded"].includes(disposition);
  await emitNotification(supabase, {
    organizationId: input.advertiserOrgId,
    type: `lead.${disposition}`,
    severity: negative ? "warning" : "info",
    title: `Lead ${disposition}`,
    body: `Transaction ${input.transactionId.slice(0, 8)}… marked ${disposition}.`,
    href: `/workspace/advertiser/opportunities?org=${input.advertiserOrgId}`,
    dedupeKey: `lead-disposition:${input.transactionId}:${disposition}:${externalEventId}`,
    payload: { transaction_id: input.transactionId, disposition },
  });

  return { ok: true, id: data.id as string, duplicate: false, disposition };
}
