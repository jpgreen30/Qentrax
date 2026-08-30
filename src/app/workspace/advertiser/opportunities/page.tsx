import { isBillable } from "@/lib/reporting/transaction-status";
import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { recordDisposition } from "../actions";

export default async function AdvertiserOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; disp?: string }>;
}) {
  const { org: orgId, disp } = await searchParams;
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
      : {
          data: [] as {
            id: string;
            public_transaction_id: string;
            status: string;
            ping_attributes: Record<string, unknown>;
            vertical_id: string | null;
          }[],
        };

  const oppMap = new Map((opps ?? []).map((o) => [o.id, o]));
  const { data: verticals } = await supabase.from("verticals").select("id, name");
  const vMap = new Map((verticals ?? []).map((v) => [v.id, v.name]));
  const billableTxns = (txns ?? []).filter((t) => isBillable(t.status));

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
      {disp === "ok" && (
        <p className="dashNotice" role="status">
          Disposition recorded. It will appear on Reports.
        </p>
      )}
      {(disp === "error" || disp === "missing" || disp === "invalid") && (
        <p className="dashNotice" role="status">
          Could not record disposition ({disp}). Check the transaction and try again.
        </p>
      )}

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
          <strong>{billableTxns.length}</strong>
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
              <span>{opp?.vertical_id ? (vMap.get(opp.vertical_id) ?? "—") : "—"}</span>
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

      <div className="dashPanel formPanel">
        <header>
          <span>DISPOSITION</span>
          <h2>Record conversion event</h2>
        </header>
        <p className="formLede">
          Attach a disposition to a billable transaction. Writes through record_conversion_event
          and surfaces on Reports.
        </p>
        {billableTxns.length === 0 ? (
          <p className="status" style={{ padding: "12px 20px" }}>
            No billable transactions yet to disposition.
          </p>
        ) : (
          <form action={recordDisposition} className="workspace-actions disposition-form">
            <input type="hidden" name="organization_id" value={org.id} />
            <label>
              <span>TRANSACTION</span>
              <select name="transaction_id" required defaultValue={billableTxns[0]?.id}>
                {billableTxns.map((t) => {
                  const opp = t.opportunity_id ? oppMap.get(t.opportunity_id) : null;
                  const label = opp?.public_transaction_id ?? t.id.slice(0, 8);
                  return (
                    <option key={t.id} value={t.id}>
                      {label} · {money(t.advertiser_price_cents)} ·{" "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>EVENT TYPE</span>
              <select name="event_type" required defaultValue="sale">
                <option value="contacted">contacted</option>
                <option value="qualified">qualified</option>
                <option value="sale">sale</option>
                <option value="rejected">rejected</option>
                <option value="returned">returned</option>
                <option value="refunded">refunded</option>
              </select>
            </label>
            <label>
              <span>REVENUE (CENTS)</span>
              <input type="number" name="revenue_cents" placeholder="e.g. 25000 for $250" min={0} step={1} />
            </label>
            <label>
              <span>PRODUCT (OPTIONAL)</span>
              <input type="text" name="product" placeholder="policy / loan product" />
            </label>
            <label>
              <span>EXTERNAL EVENT ID (OPTIONAL)</span>
              <input type="text" name="external_event_id" placeholder="auto-generated if blank" />
            </label>
            <button type="submit" className="dashAction">
              RECORD DISPOSITION ↗
            </button>
          </form>
        )}
      </div>
    </WorkspaceShell>
  );
}
