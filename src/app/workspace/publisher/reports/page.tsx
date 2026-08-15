import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

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
  const billable = (txns ?? []).filter((t) => t.status === "billable").length;
  const submitted = (opps ?? []).length;
  const acceptance = submitted ? Math.round((billable / submitted) * 1000) / 10 : 0;

  const bySource = new Map<string, { name: string; submitted: number; sold: number }>();
  for (const s of sources ?? []) bySource.set(s.id, { name: s.name, submitted: 0, sold: 0 });
  for (const o of opps ?? []) {
    if (!o.source_id) continue;
    const row = bySource.get(o.source_id) ?? { name: o.source_id.slice(0, 8), submitted: 0, sold: 0 };
    row.submitted += 1;
    bySource.set(o.source_id, row);
  }

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

      <div className="dashPanel">
        <header>
          <span>BY SOURCE</span>
          <h2>Volume by traffic source</h2>
        </header>
        <div className="tableHead report">
          <span>SOURCE</span>
          <span>SUBMITTED</span>
          <span>—</span>
          <span>—</span>
        </div>
        {Array.from(bySource.entries()).map(([id, row]) => (
          <div className="tableRow report" key={id}>
            <span>{row.name}</span>
            <span>{row.submitted}</span>
            <span>—</span>
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
          Acceptance rate uses submitted opportunities vs billable transactions in this org view.
          Earnings are publisher_amount_cents on billable transactions. Timezone: UTC.
        </p>
      </article>
    </WorkspaceShell>
  );
}
