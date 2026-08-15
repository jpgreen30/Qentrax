import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";

export default async function AdvertiserOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org: orgId } = await searchParams;
  const { supabase, org } = await requireOrg(orgId, "advertiser");

  const { data: txns } = await supabase
    .from("transactions")
    .select(
      "id, status, advertiser_price_cents, publisher_amount_cents, created_at, opportunity_id, campaign_id",
    )
    .eq("advertiser_org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const oppIds = (txns ?? []).map((t) => t.opportunity_id).filter(Boolean) as string[];
  const { data: opps } =
    oppIds.length > 0
      ? await supabase
          .from("opportunities")
          .select("id, public_transaction_id, status, ping_attributes, vertical_id")
          .in("id", oppIds)
      : { data: [] as { id: string; public_transaction_id: string; status: string; ping_attributes: Record<string, unknown>; vertical_id: string | null }[] };

  const oppMap = new Map((opps ?? []).map((o) => [o.id, o]));
  const { data: verticals } = await supabase.from("verticals").select("id, name");
  const vMap = new Map((verticals ?? []).map((v) => [v.id, v.name]));

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="opportunities"
      eyebrow="DEMAND COMMAND"
      title="Opportunities"
      subtitle="Billable and delivered demand purchased by your campaigns."
    >
      <div className="dashStats">
        <article>
          <header>
            <span>TRANSACTIONS</span>
            <i>◇</i>
          </header>
          <strong>{(txns ?? []).length}</strong>
          <small>IN VIEW</small>
        </article>
        <article>
          <header>
            <span>BILLABLE</span>
            <i>◎</i>
          </header>
          <strong>{(txns ?? []).filter((t) => t.status === "billable").length}</strong>
          <small>ACCEPTED</small>
        </article>
        <article>
          <header>
            <span>SPEND</span>
            <i>↗</i>
          </header>
          <strong>
            {money((txns ?? []).reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0))}
          </strong>
          <small>THIS VIEW</small>
        </article>
        <article>
          <header>
            <span>AVG CPL</span>
            <i>⌁</i>
          </header>
          <strong>
            {money(
              (txns ?? []).length
                ? Math.round(
                    (txns ?? []).reduce((s, t) => s + (t.advertiser_price_cents ?? 0), 0) /
                      (txns ?? []).length,
                  )
                : 0,
            )}
          </strong>
          <small>PER LEAD</small>
        </article>
      </div>

      <div className="dashPanel">
        <div className="tableHead opp">
          <span>ID</span>
          <span>VERTICAL</span>
          <span>STATE</span>
          <span>STATUS</span>
          <span>PRICE</span>
          <span>WHEN</span>
        </div>
        {(txns ?? []).map((t) => {
          const opp = t.opportunity_id ? oppMap.get(t.opportunity_id) : null;
          const ping = (opp?.ping_attributes ?? {}) as Record<string, unknown>;
          return (
            <div className="tableRow opp" key={t.id}>
              <span>{opp?.public_transaction_id ?? t.id.slice(0, 8)}</span>
              <span>
                {opp?.vertical_id ? vMap.get(opp.vertical_id) ?? "—" : "—"}
              </span>
              <span>{String(ping.state ?? ping.State ?? "—")}</span>
              <span className="status">{(t.status ?? "").toUpperCase()}</span>
              <span>{money(t.advertiser_price_cents)}</span>
              <span>{new Date(t.created_at).toLocaleString()}</span>
            </div>
          );
        })}
        {!txns?.length && (
          <div className="tableRow">
            <span className="status">No opportunities yet. Activate a funded campaign first.</span>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}
