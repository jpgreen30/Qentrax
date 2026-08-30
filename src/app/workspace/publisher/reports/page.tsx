import { isBillable } from "@/lib/reporting/transaction-status";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

const chartSvg = (
  <svg viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Earnings trend">
    <defs>
      <linearGradient id="g-reports-pub" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#caff4b" stopOpacity=".25" />
        <stop offset="1" stopColor="#caff4b" stopOpacity="0" />
      </linearGradient>
    </defs>
    <path
      className="area"
      d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30 L700 230 L0 230Z"
      fill="url(#g-reports-pub)"
    />
    <path
      className="line"
      d="M0 200 C60 185 80 120 145 145 S230 178 290 100 S390 130 440 72 S540 120 590 55 S660 75 700 30"
    />
    <g className="dots">
      <circle cx="145" cy="145" r="4" />
      <circle cx="290" cy="100" r="4" />
      <circle cx="440" cy="72" r="4" />
      <circle cx="590" cy="55" r="4" />
      <circle cx="700" cy="30" r="4" />
    </g>
  </svg>
);

export default async function PublisherReports({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "publisher");

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, publisher_amount_cents, advertiser_price_cents, created_at, opportunity_id")
    .eq("publisher_org_id", org.id)
    .limit(200);

  const { data: sources } = await supabase
    .from("publisher_sources")
    .select("id, name, status")
    .eq("publisher_org_id", org.id);

  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, status, source_id, vertical_id")
    .eq("publisher_org_id", org.id)
    .limit(200);

  const earnings = (txns ?? []).reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const billable = (txns ?? []).filter((t) => isBillable(t.status)).length;
  const submitted = (opps ?? []).length;
  const acceptance = submitted ? Math.round((billable / submitted) * 1000) / 10 : 0;

  const bySource = new Map<string, { name: string; submitted: number; status: string }>();
  for (const s of sources ?? []) {
    bySource.set(s.id, { name: s.name, submitted: 0, status: s.status ?? "active" });
  }
  for (const o of opps ?? []) {
    if (!o.source_id) continue;
    const row = bySource.get(o.source_id) ?? {
      name: o.source_id.slice(0, 8),
      submitted: 0,
      status: "—",
    };
    row.submitted += 1;
    bySource.set(o.source_id, row);
  }

  const funnelMax = Math.max(submitted, billable, 1);

  return (
    <WorkspaceShell
      role="publisher"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="reports"
      eyebrow="INTELLIGENCE"
      title="Reports"
      subtitle="Acceptance, earnings, and source quality."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>SUBMITTED</span>
            <i>◇</i>
          </header>
          <strong>{submitted}</strong>
          <small>OPPORTUNITIES</small>
        </article>
        <article>
          <header>
            <span>BILLABLE</span>
            <i>◎</i>
          </header>
          <strong>{billable}</strong>
          <small>SOLD</small>
        </article>
        <article>
          <header>
            <span>ACCEPTANCE</span>
            <i>↗</i>
          </header>
          <strong>{acceptance}%</strong>
          <small>BILLABLE ÷ SUBMITTED</small>
        </article>
        <article>
          <header>
            <span>EARNINGS</span>
            <i>$</i>
          </header>
          <strong>{money(earnings)}</strong>
          <small>PUBLISHER SHARE</small>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel chartPanel">
          <header>
            <span>TREND</span>
            <h2>Earnings trajectory</h2>
          </header>
          <div className="chart">{chartSvg}</div>
          <p className="chartCaption">
            Illustrative shape until daily ledger aggregates are exposed.
          </p>
        </article>

        <article className="dashPanel">
          <header>
            <span>FUNNEL</span>
            <h2>Submit → billable</h2>
          </header>
          <div className="funnel">
            <div className="funnelStep">
              <span>SUBMITTED</span>
              <div className="funnelBar" style={{ width: `${(submitted / funnelMax) * 100}%` }} />
              <b>{submitted}</b>
            </div>
            <div className="funnelStep">
              <span>BILLABLE</span>
              <div className="funnelBar" style={{ width: `${(billable / funnelMax) * 100}%` }} />
              <b>{billable}</b>
            </div>
            <div className="funnelMeta">Acceptance {acceptance}%</div>
          </div>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>BY SOURCE</span>
          <h2>Volume by traffic source</h2>
        </header>
        <div className="tableHead report">
          <span>SOURCE</span>
          <span>SUBMITTED</span>
          <span>STATUS</span>
          <span>—</span>
        </div>
        {Array.from(bySource.entries()).map(([id, row]) => (
          <div className="tableRow report" key={id}>
            <span>{row.name}</span>
            <span>{row.submitted}</span>
            <span className="status">{row.status.toUpperCase()}</span>
            <span>—</span>
          </div>
        ))}
        {!bySource.size && (
          <div className="tableRow">
            <span className="status">No source activity yet.</span>
          </div>
        )}
      </div>

      <article className="dashPanel metricsNote">
        <span>METRICS NOTES</span>
        <p>
          Acceptance uses submitted opportunities vs billable transactions. Earnings are
          publisher_amount_cents on billable rows. Timezone: UTC.
        </p>
      </article>
    </WorkspaceShell>
  );
}
