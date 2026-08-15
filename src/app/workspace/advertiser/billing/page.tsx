import WorkspaceShell from "@/components/WorkspaceShell";
import { initials, money, requireOrg } from "@/lib/workspace-data";
import { postTestFunding } from "../actions";

export default async function AdvertiserBilling({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; funded?: string }>;
}) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg(params.org, "advertiser");

  const { data: balance } = await supabase.rpc("advertiser_available_balance_cents", {
    p_organization_id: org.id,
  });
  const bal = Number(balance ?? 0);

  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, type")
    .eq("organization_id", org.id);

  const acctIds = (accounts ?? []).map((a) => a.id);
  const { data: entries } =
    acctIds.length > 0
      ? await supabase
          .from("ledger_entries")
          .select("id, journal_id, account_id, direction, amount_cents, occurred_at")
          .in("account_id", acctIds)
          .order("occurred_at", { ascending: false })
          .limit(40)
      : { data: [] as { id: string; direction: string; amount_cents: number; occurred_at: string }[] };

  return (
    <WorkspaceShell
      role="advertiser"
      orgId={org.id}
      orgName={org.legal_name}
      orgStatus={org.onboarding_status}
      initials={initials(org.legal_name)}
      active="billing"
      eyebrow="DEMAND COMMAND"
      title="Billing & funding"
      subtitle="Media balance, charges, and test funding. Stripe live webhooks come next."
    >
      {params.funded && <p className="dashNotice">Test funding posted to ledger.</p>}

      <div className="dashStats">
        <article>
          <header>
            <span>AVAILABLE BALANCE</span>
            <i>◫</i>
          </header>
          <strong>{money(bal)}</strong>
          <small>{bal > 0 ? "FUNDED" : "UNFUNDED"}</small>
        </article>
        <article>
          <header>
            <span>ACCOUNTS</span>
            <i>$</i>
          </header>
          <strong>{(accounts ?? []).length}</strong>
          <small>LEDGER</small>
        </article>
        <article>
          <header>
            <span>ENTRIES</span>
            <i>↗</i>
          </header>
          <strong>{(entries ?? []).length}</strong>
          <small>RECENT</small>
        </article>
        <article>
          <header>
            <span>MODE</span>
            <i>▦</i>
          </header>
          <strong>TEST</strong>
          <small>STRIPE LATER</small>
        </article>
      </div>

      <div className="dashLower">
        <article className="dashPanel">
          <header>
            <span>LEDGER ACTIVITY</span>
            <h2>Recent balance movements</h2>
          </header>
          <div className="tableHead bill">
            <span>DIRECTION</span>
            <span>AMOUNT</span>
            <span>WHEN</span>
          </div>
          {(entries ?? []).map((e) => (
            <div className="tableRow bill" key={e.id}>
              <span className="status">{e.direction?.toUpperCase()}</span>
              <span>{money(e.amount_cents)}</span>
              <span>{new Date(e.occurred_at).toLocaleString()}</span>
            </div>
          ))}
          {!entries?.length && (
            <div className="tableRow">
              <span className="status">No ledger entries yet.</span>
            </div>
          )}
        </article>
        <article className="quick">
          <header>
            <span>FUND ACCOUNT</span>
          </header>
          <form action={postTestFunding} className="workspace-actions">
            <input type="hidden" name="organization_id" value={org.id} />
            <input type="hidden" name="amount_cents" value={50000} />
            <button className="quickRow" type="submit">
              <i>$</i>
              <span>
                <b>Post $500 test funding</b>
                <small>Simulated Stripe top-up</small>
              </span>
              <em>→</em>
            </button>
          </form>
          <form action={postTestFunding} className="workspace-actions">
            <input type="hidden" name="organization_id" value={org.id} />
            <input type="hidden" name="amount_cents" value={200000} />
            <button className="quickRow" type="submit">
              <i>$</i>
              <span>
                <b>Post $2,000 test funding</b>
                <small>Larger test balance</small>
              </span>
              <em>→</em>
            </button>
          </form>
        </article>
      </div>
    </WorkspaceShell>
  );
}
