import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { resolveDateRange, RANGE_PRESETS } from "@/lib/reporting/date-range";
import {
  computeTotals,
  computeDailySeries,
  computeCampaignBreakdown,
} from "@/lib/reporting/metrics";
import {
  fetchAdvertiserTransactions,
  fetchAdvertiserConversions,
} from "@/lib/reporting/queries";
import { buildSparkline } from "@/lib/reporting/sparkline";

const RANGE_LABELS: Record<string, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  custom: "CUSTOM",
};

function pct(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 1000) / 10}%`;
}

export default async function AdvertiserReports({
  searchParams,
}: {
  searchParams: Promise<{
    org?: string;
    range?: string;
    from?: string;
    to?: string;
    tz?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");

  // Reporting is anchored to a real timezone so day boundaries match the
  // campaign-local boundaries that caps and budgets are enforced on.
  const timezone = params.tz || "America/Los_Angeles";
  const range = resolveDateRange(params, timezone);

  const [txns, conversions] = await Promise.all([
    fetchAdvertiserTransactions(supabase, org.id, range),
    fetchAdvertiserConversions(supabase, org.id, range),
  ]);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("advertiser_org_id", org.id);

  const totals = computeTotals(txns, conversions);
  const series = computeDailySeries(txns, conversions, range);
  const byCampaign = computeCampaignBreakdown(txns, conversions, campaigns ?? []);
  const spark = buildSparkline(series, "spendCents");

  const rangeHref = (preset: string) =>
    `/workspace/advertiser/reports?org=${org.id}&range=${preset}`;

  const csvHref =
    `/api/v1/reports/advertiser/export?org=${org.id}` +
    `&range=${range.preset}&from=${range.days[0]}` +
    `&to=${range.days[range.days.length - 1]}&tz=${encodeURIComponent(timezone)}`;

  const funnelMax = Math.max(totals.billableLeads, totals.sales, 1);

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="reports"
      eyebrow="INTELLIGENCE"
      title="Reports"
      subtitle="Spend, acceptance, and conversion performance across campaigns."
    >
      <div className="reportControls">
        <div className="rangeTabs">
          {RANGE_PRESETS.filter((p) => p !== "custom").map((preset) => (
            <Link
              key={preset}
              href={rangeHref(preset)}
              className={range.preset === preset ? "rangeTab active" : "rangeTab"}
            >
              {RANGE_LABELS[preset]}
            </Link>
          ))}
          {range.preset === "custom" && <span className="rangeTab active">CUSTOM</span>}
        </div>
        <span className="rangeMeta">
          {range.days[0]} → {range.days[range.days.length - 1]} · {timezone}
        </span>
        <a className="rangeExport" href={csvHref}>
          EXPORT CSV ↓
        </a>
      </div>

      <div className="dashStats">
        <article>
          <header>
            <span>TOTAL SPEND</span>
            <i>↗</i>
          </header>
          <strong>{money(totals.spendCents)}</strong>
          <small>{RANGE_LABELS[range.preset]} · CHARGED ONLY</small>
        </article>
        <article>
          <header>
            <span>BILLABLE LEADS</span>
            <i>◎</i>
          </header>
          <strong>{totals.billableLeads}</strong>
          <small>AVG CPL {money(totals.avgCplCents)}</small>
        </article>
        <article>
          <header>
            <span>SALES</span>
            <i>◇</i>
          </header>
          <strong>{totals.sales}</strong>
          <small>CVR {pct(totals.conversionRate)}</small>
        </article>
        <article>
          <header>
            <span>ATTRIBUTED REV</span>
            <i>▦</i>
          </header>
          <strong>{money(totals.revenueCents)}</strong>
          <small>ROAS {totals.roas == null ? "—" : `${totals.roas.toFixed(2)}x`}</small>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel chartPanel">
          <header>
            <span>TREND</span>
            <h2>Daily spend</h2>
          </header>
          {spark.hasData ? (
            <>
              <div className="chart">
                <svg viewBox="0 0 700 230" preserveAspectRatio="none" role="img"
                     aria-label={`Daily spend, ${range.days[0]} to ${range.days[range.days.length - 1]}`}>
                  <defs>
                    <linearGradient id="g-reports-adv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#caff4b" stopOpacity=".25" />
                      <stop offset="1" stopColor="#caff4b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="area" d={spark.area!} fill="url(#g-reports-adv)" />
                  <path className="line" d={spark.line!} />
                </svg>
              </div>
              <p className="chartCaption">
                Peak day {money(spark.max)} · {series.length} days · {timezone}
              </p>
            </>
          ) : (
            <div className="emptyState">
              <p>No charged transactions in this range.</p>
              <small>The trend appears once leads are billed.</small>
            </div>
          )}
        </article>

        <article className="dashPanel">
          <header>
            <span>FUNNEL</span>
            <h2>Billable → sale</h2>
          </header>
          <div className="funnel">
            <div className="funnelStep">
              <span>BILLABLE</span>
              <div
                className="funnelBar"
                style={{ width: `${(totals.billableLeads / funnelMax) * 100}%` }}
              />
              <b>{totals.billableLeads}</b>
            </div>
            <div className="funnelStep">
              <span>SALES</span>
              <div
                className="funnelBar"
                style={{ width: `${(totals.sales / funnelMax) * 100}%` }}
              />
              <b>{totals.sales}</b>
            </div>
            <div className="funnelMeta">Close rate {pct(totals.conversionRate)}</div>
          </div>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>BY CAMPAIGN</span>
            <h2>Spend and volume</h2>
          </header>
          <div className="tableHead report">
            <span>CAMPAIGN</span>
            <span>LEADS</span>
            <span>SPEND</span>
            <span>AVG CPL</span>
          </div>
          {byCampaign.map((row) => (
            <div className="tableRow report" key={row.campaignId}>
              <span>{row.name}</span>
              <span>{row.billableLeads}</span>
              <span>{money(row.spendCents)}</span>
              <span>{money(row.avgCplCents)}</span>
            </div>
          ))}
          {!byCampaign.length && (
            <div className="tableRow">
              <span className="status">No campaign activity in this range.</span>
            </div>
          )}
        </article>

        <article className="dashPanel">
          <header>
            <span>CONVERSIONS</span>
            <h2>Disposition events</h2>
          </header>
          <div className="tableHead bill">
            <span>TYPE</span>
            <span>REVENUE</span>
            <span>WHEN</span>
          </div>
          {conversions.slice(0, 50).map((c) => (
            <div className="tableRow bill" key={c.id}>
              <span className="status">{c.event_type.toUpperCase()}</span>
              <span>{c.revenue_cents != null ? money(c.revenue_cents) : "—"}</span>
              <span>{new Date(c.occurred_at).toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
          ))}
          {!conversions.length && (
            <div className="tableRow">
              <span className="status">
                No conversion events in this range. Record dispositions on Opportunities.
              </span>
            </div>
          )}
        </article>
      </div>

      <article className="dashPanel metricsNote">
        <span>METRICS NOTES</span>
        <p>
          Spend counts transactions in state <code>charged</code> or <code>settled</code>;
          reserved and returned transactions are excluded. CPL = spend ÷ billable leads.
          Attributed revenue is the sum of <code>sale</code> conversion events, credited through
          the charged transaction that produced the lead. Totals cover every transaction in
          range, not a sample. Day boundaries use {timezone}.
          {conversions.length > 50 && ` Showing the 50 most recent of ${conversions.length} conversion events.`}
        </p>
      </article>
    </WorkspaceShell>
  );
}
