import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

export default async function AdvertiserReports({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, status, advertiser_price_cents, created_at, campaign_id")
    .eq("advertiser_org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, base_bid_cents")
    .eq("advertiser_org_id", org.id);

  const { data: conversions } = await supabase
    .from("conversion_events")
    .select("id, event_type, revenue_cents, occurred_at, transaction_id")
    .eq("advertiser_org_id", org.id)
    .order("occurred_at", { ascending: false })
    .limit(50);

  const spend = (txns ?? []).reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0);
  const billable = (txns ?? []).filter((t) => t.status === "billable").length;
  const sales = (conversions ?? []).filter((c) => c.event_type === "sale");
  const revenue = sales.reduce((s, c) => s + (c.revenue_cents ?? 0), 0);

  const byCampaign = new Map<string, { name: string; count: number; spend: number }>();
  for (const c of campaigns ?? []) {
    byCampaign.set(c.id, { name: c.name, count: 0, spend: 0 });
  }
  for (const t of txns ?? []) {
    if (!t.campaign_id) continue;
    const row = byCampaign.get(t.campaign_id) ?? { name: t.campaign_id.slice(0, 8), count: 0, spend: 0 };
    row.count += 1;
    row.spend += t.advertiser_price_cents ?? 0;
    byCampaign.set(t.campaign_id, row);
  }

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
      <div className="dashStats">
        <article>
          <header>
            <span>TOTAL SPEND</span>
            <i>↗</i>
          </header>
          <strong>{money(spend)}</strong>
          <small>ALL TIME VIEW</small>
        </article>
        <article>
          <header>
            <span>BILLABLE LEADS</span>
            <i>◎</i>
          </header>
          <strong>{billable}</strong>
          <small>ACCEPTED</small>
        </article>
        <article>
          <header>
            <span>SALES</span>
            <i>$</i>
          </header>
          <strong>{sales.length}</strong>
          <small>CONVERSIONS</small>
        </article>
        <article>
          <header>
            <span>ATTRIBUTED REV</span>
            <i>▦</i>
          </header>
          <strong>{money(revenue)}</strong>
          <small>FROM SALES</small>
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
          {Array.from(byCampaign.entries()).map(([id, row]) => (
            <div className="tableRow report" key={id}>
              <span>{row.name}</span>
              <span>{row.count}</span>
              <span>{money(row.spend)}</span>
              <span>{money(row.count ? Math.round(row.spend / row.count) : 0)}</span>
            </div>
          ))}
          {!byCampaign.size && (
            <div className="tableRow">
              <span className="status">No campaign activity yet.</span>
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
          {(conversions ?? []).map((c) => (
            <div className="tableRow bill" key={c.id}>
              <span className="status">{c.event_type.toUpperCase()}</span>
              <span>{c.revenue_cents != null ? money(c.revenue_cents) : "—"}</span>
              <span>{new Date(c.occurred_at).toLocaleString()}</span>
            </div>
          ))}
          {!conversions?.length && (
            <div className="tableRow">
              <span className="status">No conversion events. Use POST /api/v1/conversions.</span>
            </div>
          )}
        </article>
      </div>

      <article className="dashPanel metricsNote">
        <span>METRICS NOTES</span>
        <p>
          Cohort is all transactions visible to this organization. CPL = advertiser charged ÷
          billable leads in view. Attributed revenue is sum of sale conversion events. Timezone:
          UTC for ledger dates.
        </p>
      </article>
    </WorkspaceShell>
  );
}
