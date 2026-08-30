import { apiError } from "@/lib/api";
import { requestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/reporting/date-range";
import { computeDailySeries, computeCampaignBreakdown } from "@/lib/reporting/metrics";
import {
  fetchAdvertiserTransactions,
  fetchAdvertiserConversions,
} from "@/lib/reporting/queries";
import { toCsv, centsToAmount } from "@/lib/reporting/csv";

/**
 * CSV export for the advertiser report.
 *
 * The export honours the same range/timezone filters as the rendered report and
 * is scoped to a single organization the caller is a member of, so it cannot be
 * used to read another tenant's transactions. Row-level security is still the
 * backstop; this check fails fast with a clear error.
 */
export async function GET(request: Request) {
  const id = requestId(request.headers.get("x-request-id"));
  const url = new URL(request.url);
  const orgId = url.searchParams.get("org");

  if (!orgId) {
    return apiError("VALIDATION_ERROR", "org is required", id, 400);
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return apiError("AUTH_REQUIRED", "Authentication required", id, 401);
  }

  // RLS restricts this row to organizations the caller belongs to, so a miss is
  // either a bad id or another tenant's org. Both are reported the same way.
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, legal_name, type")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !org || org.type !== "advertiser") {
    return apiError("AUTH_FORBIDDEN", "Organization not accessible", id, 403);
  }

  const timezone = url.searchParams.get("tz") || "America/Los_Angeles";
  const range = resolveDateRange(
    {
      range: url.searchParams.get("range"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    },
    timezone,
  );

  let txns;
  let conversions;
  try {
    [txns, conversions] = await Promise.all([
      fetchAdvertiserTransactions(supabase, org.id, range),
      fetchAdvertiserConversions(supabase, org.id, range),
    ]);
  } catch {
    return apiError("INTERNAL_ERROR", "Report query failed", id, 500);
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("advertiser_org_id", org.id);

  const section = url.searchParams.get("section") === "campaign" ? "campaign" : "daily";

  let csv: string;
  if (section === "campaign") {
    const rows = computeCampaignBreakdown(txns, conversions, campaigns ?? []);
    csv = toCsv(
      ["campaign_id", "campaign", "billable_leads", "spend", "revenue", "avg_cpl", "roas"],
      rows.map((r) => [
        r.campaignId,
        r.name,
        r.billableLeads,
        centsToAmount(r.spendCents),
        centsToAmount(r.revenueCents),
        centsToAmount(r.avgCplCents),
        r.roas == null ? "" : r.roas.toFixed(4),
      ]),
    );
  } else {
    const series = computeDailySeries(txns, conversions, range);
    csv = toCsv(
      ["day", "timezone", "billable_leads", "spend", "revenue"],
      series.map((p) => [
        p.day,
        range.timezone,
        p.billableLeads,
        centsToAmount(p.spendCents),
        centsToAmount(p.revenueCents),
      ]),
    );
  }

  const filename =
    `qentrax-${section}-${range.days[0]}-to-${range.days[range.days.length - 1]}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Request-Id": id,
    },
  });
}
