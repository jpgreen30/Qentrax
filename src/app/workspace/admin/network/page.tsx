import { isBillable } from "@/lib/reporting/transaction-status";
import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { money, requireAdmin } from "@/lib/workspace-data";

export default async function AdminNetwork() {
  const { supabase } = await requireAdmin();

  const [
    { data: orgs },
    { data: txns },
    { count: oppCount },
    { count: campaignCount },
    { count: sourceCount },
    { data: recentOpps },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, type, status, onboarding_status, created_at")
      .neq("type", "platform")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("transactions")
      .select(
        "id, status, advertiser_price_cents, publisher_amount_cents, created_at, opportunity_id, advertiser_org_id, publisher_org_id",
      )
      .order("created_at", { ascending: false })
      .limit(40),
    supabase.from("opportunities").select("id", { count: "exact", head: true }),
    supabase.from("campaigns").select("id", { count: "exact", head: true }),
    supabase.from("publisher_sources").select("id", { count: "exact", head: true }),
    supabase
      .from("opportunities")
      .select("id, status, public_transaction_id, created_at, publisher_org_id")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const advertisers = (orgs ?? []).filter((o) => o.type === "advertiser");
  const publishers = (orgs ?? []).filter((o) => o.type === "publisher");
  const activeAdvertisers = advertisers.filter(
    (o) => o.status === "active" && o.onboarding_status === "approved",
  ).length;
  const activePublishers = publishers.filter(
    (o) => o.status === "active" && o.onboarding_status === "approved",
  ).length;
  const pendingReview = (orgs ?? []).filter((o) =>
    ["profile_submitted", "under_review", "needs_information"].includes(o.onboarding_status),
  ).length;

  const billable = (txns ?? []).filter((t) => isBillable(t.status));
  const gmv = billable.reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0);
  const publisherShare = billable.reduce((s, t) => s + (t.publisher_amount_cents ?? 0), 0);
  const platformMargin = gmv - publisherShare;
  const billableCount = billable.length;

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.legal_name]));

  const byStatus = new Map<string, number>();
  for (const t of txns ?? []) {
    const key = (t.status ?? "unknown").toUpperCase();
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax Platform"
      orgStatus="admin"
      initials="QX"
      active="network"
      eyebrow="PLATFORM OPERATIONS"
      title="Network"
      subtitle="Live demand exchange pulse — organizations, volume, and clearing."
      primaryAction={
        <Link className="dashAction" href="/workspace/admin">
          APPROVAL QUEUE
        </Link>
      }
    >
      <div className="dashStats">
        <article>
          <header>
            <span>ACTIVE BUYERS</span>
            <i>◎</i>
          </header>
          <strong>{activeAdvertisers}</strong>
          <small>{advertisers.length} TOTAL ADVERTISERS</small>
        </article>
        <article>
          <header>
            <span>ACTIVE SUPPLY</span>
            <i>◇</i>
          </header>
          <strong>{activePublishers}</strong>
          <small>{publishers.length} TOTAL PUBLISHERS</small>
        </article>
        <article>
          <header>
            <span>BILLABLE GMV</span>
            <i>$</i>
          </header>
          <strong>{money(gmv)}</strong>
          <small>{billableCount} CLEARED TXNS</small>
        </article>
        <article>
          <header>
            <span>PLATFORM MARGIN</span>
            <i>↗</i>
          </header>
          <strong>{money(platformMargin)}</strong>
          <small>GMV − PUBLISHER SHARE</small>
        </article>
      </div>

      <div className="dashStats" style={{ marginTop: 0, borderTop: 0 }}>
        <article>
          <header>
            <span>OPPORTUNITIES</span>
            <i>⌁</i>
          </header>
          <strong>{oppCount ?? 0}</strong>
          <small>INTAKE TOTAL</small>
        </article>
        <article>
          <header>
            <span>CAMPAIGNS</span>
            <i>◎</i>
          </header>
          <strong>{campaignCount ?? 0}</strong>
          <small>ALL STATUSES</small>
        </article>
        <article>
          <header>
            <span>SOURCES</span>
            <i>◇</i>
          </header>
          <strong>{sourceCount ?? 0}</strong>
          <small>PUBLISHER TRAFFIC</small>
        </article>
        <article>
          <header>
            <span>PENDING KYB</span>
            <i>⌂</i>
          </header>
          <strong>{pendingReview}</strong>
          <small>
            <Link href="/workspace/admin" style={{ color: "inherit" }}>
              REVIEW QUEUE →
            </Link>
          </small>
        </article>
      </div>

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>CLEARING</span>
            <h2>Recent transactions</h2>
          </header>
          <div className="tableHead network">
            <span>TXN</span>
            <span>STATUS</span>
            <span>BUYER</span>
            <span>SUPPLY</span>
            <span>PRICE</span>
            <span>WHEN</span>
          </div>
          {(txns ?? []).map((t) => (
            <div className="tableRow network" key={t.id}>
              <span>{t.id.slice(0, 8)}</span>
              <span className="status">{(t.status ?? "—").toUpperCase()}</span>
              <span>{orgName.get(t.advertiser_org_id ?? "") ?? "—"}</span>
              <span>{orgName.get(t.publisher_org_id ?? "") ?? "—"}</span>
              <span>{money(t.advertiser_price_cents)}</span>
              <span>{new Date(t.created_at).toLocaleString()}</span>
            </div>
          ))}
          {!txns?.length && (
            <div className="tableRow">
              <span className="status">No transactions yet. Run a test lead through auction.</span>
            </div>
          )}
        </article>

        <article className="dashPanel">
          <header>
            <span>MIX</span>
            <h2>Txn status mix</h2>
          </header>
          <div className="funnel" style={{ paddingTop: 12 }}>
            {Array.from(byStatus.entries()).map(([status, n]) => {
              const max = Math.max(...Array.from(byStatus.values()), 1);
              return (
                <div className="funnelStep" key={status}>
                  <span>{status}</span>
                  <div className="funnelBar" style={{ width: `${(n / max) * 100}%` }} />
                  <b>{n}</b>
                </div>
              );
            })}
            {!byStatus.size && (
              <p className="dashNotice" style={{ margin: "8px 12px" }}>
                No status distribution yet.
              </p>
            )}
          </div>
          <div className="metricsNote" style={{ borderTop: "1px solid var(--edge)" }}>
            <span>MARGIN NOTES</span>
            <p>
              Platform margin = sum(advertiser_price_cents − publisher_amount_cents) on billable
              rows in this view. Payout batches and Net-30 holds ship in Phase 6.
            </p>
          </div>
        </article>
      </div>

      <div className="dashPanel">
        <header>
          <span>INTAKE</span>
          <h2>Latest opportunities</h2>
        </header>
        <div className="tableHead sources">
          <span>PUBLIC ID</span>
          <span>STATUS</span>
          <span>PUBLISHER</span>
          <span>CREATED</span>
          <span>—</span>
        </div>
        {(recentOpps ?? []).map((o) => (
          <div className="tableRow sources" key={o.id}>
            <span>{o.public_transaction_id ?? o.id.slice(0, 10)}</span>
            <span className="status">{(o.status ?? "—").toUpperCase()}</span>
            <span>{orgName.get(o.publisher_org_id ?? "") ?? o.publisher_org_id?.slice(0, 8) ?? "—"}</span>
            <span>{new Date(o.created_at).toLocaleString()}</span>
            <span>—</span>
          </div>
        ))}
        {!recentOpps?.length && (
          <div className="tableRow">
            <span className="status">No opportunities submitted yet.</span>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
